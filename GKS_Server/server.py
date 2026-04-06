import asyncio
import struct
import logging
import time
import math

from crypto_manager import CryptoManager
from repository import Repository
import config

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [%(module)s:%(lineno)d] - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(f"GKS-{config.GKS_ID}")

class TokenBucketRateLimiter:
    def __init__(self, capacity, fill_rate):
        self.capacity = capacity
        self.fill_rate = fill_rate
        self.tokens = capacity
        self.last_update = time.time()

    def consume(self, tokens=1):
        now = time.time()
        time_passed = now - self.last_update
        self.tokens = min(self.capacity, self.tokens + time_passed * self.fill_rate)
        self.last_update = now
        
        if self.tokens >= tokens:
            self.tokens -= tokens
            return True
        return False

class AegisUdpProtocol(asyncio.DatagramProtocol):
    def __init__(self, repository: Repository, crypto_manager: CryptoManager):
        self.repository = repository
        self.crypto_manager = crypto_manager
        self.transport = None
        
        self.uav_clock_offsets = {}
        self.local_fec_windows = {}
        self.last_valid_timestamps = {}
        self.last_seen_wall_clock = {}
        
        # Per-IP token bucket limiters for flood protection.
        self.ip_limiters = {}
        
        # Active UAV endpoints used when dispatching command packets.
        self.active_endpoints = {}
        self.redis_listener_task = None
        self.last_handover_attempt = {}
        self.last_not_local_event = {}
        self.out_of_range_state = {}
        self.seq_resync_required = set()
        self.active_missions = {}

    def connection_made(self, transport):
        self.transport = transport
        logger.info("Zero-trust datalink controls enabled.")
        logger.info("Listening on UDP port %s", config.PORT)
        asyncio.create_task(self._emit_event(
            event_type="gks.server.online",
            category="SYSTEM",
            severity="INFO",
            entity_type="gks",
            entity_id=f"GKS-{config.GKS_ID}",
            action="online",
            message=f"GKS-{config.GKS_ID} UDP sunucusu port {config.PORT} üzerinde dinlemeye başladı.",
            data={"port": config.PORT, "host": config.GKS_HOST}
        ))
        self.redis_listener_task = asyncio.create_task(self.listen_to_redis_commands())
        self.session_timeout_task = asyncio.create_task(self.session_timeout_checker())

    @staticmethod
    def _distance_km(lat1, lon1, lat2, lon2):
        r_km = 6371.0
        d_lat = math.radians(lat2 - lat1)
        d_lon = math.radians(lon2 - lon1)
        a = (
            math.sin(d_lat / 2) ** 2
            + math.cos(math.radians(lat1))
            * math.cos(math.radians(lat2))
            * math.sin(d_lon / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return r_km * c

    @staticmethod
    def _extract_gks_numeric_id(raw_id):
        text = str(raw_id or "").strip().upper()
        if text.startswith("GKS-"):
            return text.replace("GKS-", "")
        return text

    async def _emit_event(
        self,
        event_type,
        category,
        severity,
        entity_type,
        entity_id,
        action,
        message,
        data=None
    ):
        await self.repository.publish_ops_event(
            event_type=event_type,
            category=category,
            severity=severity,
            source=f"GKS-{config.GKS_ID}",
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            message=message,
            data=data or {}
        )

    async def _build_range_context(self, lat, lon):
        active_gks = await self.repository.get_active_gks_instances()

        my_entry = {
            "id": f"GKS-{config.GKS_ID}",
            "numeric_id": str(config.GKS_ID),
            "lat": float(config.GKS_LAT),
            "lng": float(config.GKS_LON),
            "radius": 50.0,
            "host": config.GKS_HOST,
            "port": int(config.PORT),
            "timestamp": int(time.time())
        }
        candidates = []

        for entry in active_gks:
            try:
                entry_id = self._extract_gks_numeric_id(entry.get("id"))
                entry_lat = float(entry.get("lat"))
                entry_lng = float(entry.get("lng"))
                entry_radius = float(entry.get("radius", 50.0))
                entry_port = int(entry.get("port", config.PORT))
                entry_host = str(entry.get("host", "")).strip()
                entry_timestamp = int(entry.get("timestamp", 0))
            except (TypeError, ValueError):
                continue

            if entry_timestamp > 0 and abs(time.time() - entry_timestamp) > 20:
                continue

            normalized = {
                "id": entry.get("id"),
                "numeric_id": entry_id,
                "lat": entry_lat,
                "lng": entry_lng,
                "radius": entry_radius,
                "port": entry_port,
                "host": entry_host,
                "timestamp": entry_timestamp
            }

            if entry_id == str(config.GKS_ID):
                my_entry = normalized
            else:
                candidates.append(normalized)

        my_distance = self._distance_km(lat, lon, float(my_entry["lat"]), float(my_entry["lng"]))
        my_in_range = my_distance <= float(my_entry["radius"])

        in_range_candidates = []
        for entry in [my_entry, *candidates]:
            dist = self._distance_km(lat, lon, entry["lat"], entry["lng"])
            if dist <= entry["radius"]:
                in_range_candidates.append((dist, entry))

        in_range_candidates.sort(key=lambda x: x[0])
        target_distance = in_range_candidates[0][0] if in_range_candidates else None
        target = in_range_candidates[0][1] if in_range_candidates else None

        return {
            "my_entry": my_entry,
            "my_distance": my_distance,
            "my_in_range": my_in_range,
            "has_in_range": len(in_range_candidates) > 0,
            "target_distance": target_distance,
            "target": target
        }

    async def _maybe_auto_handover(self, uav_id, address, current_time, range_ctx):
        # Prevent repeated handover storms for the same UAV.
        if current_time - self.last_handover_attempt.get(uav_id, 0) < 3.0:
            return

        my_entry = range_ctx["my_entry"]
        my_distance = range_ctx["my_distance"]
        my_in_range = range_ctx["my_in_range"]
        target = range_ctx["target"]
        target_distance = range_ctx["target_distance"]

        if target is None or target_distance is None:
            return

        target_id = target.get("numeric_id", "")

        # If current GKS is out-of-range, or there is a clearly closer in-range GKS, handover.
        should_handover = False
        if target_id != str(config.GKS_ID):
            if not my_in_range:
                should_handover = True
            elif (target_distance + 2.0) < my_distance:
                should_handover = True

        if not should_handover:
            return

        target_host = target["host"]
        if not target_host and target_id == "42":
            target_host = "aegis-gks-service"

        if not target_host:
            logger.warning(
                f"[HANDOVER ATLANDI] İHA-{uav_id} için {target.get('id')} hedefine erişilebilir host yok."
            )
            await self._emit_event(
                event_type="handover.skipped",
                category="HANDOVER",
                severity="WARN",
                entity_type="uav",
                entity_id=f"İHA-{uav_id}",
                action="handover_skip",
                message=f"İHA-{uav_id} için handover atlandı: hedef istasyona erişilebilir host yok.",
                data={"targetGks": target.get("id")}
            )
            return

        self.last_handover_attempt[uav_id] = current_time
        if not my_in_range:
            logger.warning(
                f"[MENZİL DIŞI] İHA-{uav_id} GKS-{config.GKS_ID} menzili dışında ({my_distance:.2f} km > {my_entry['radius']:.2f} km). "
                f"Yeni hedef: {target.get('id')} ({target_distance:.2f} km)."
            )
            await self._emit_event(
                event_type="handover.auto_initiated",
                category="HANDOVER",
                severity="WARN",
                entity_type="uav",
                entity_id=f"İHA-{uav_id}",
                action="auto_handover",
                message=(
                    f"İHA-{uav_id} menzil dışına çıktı; {target.get('id')} istasyonuna otomatik handover başlatıldı."
                ),
                data={
                    "fromGks": f"GKS-{config.GKS_ID}",
                    "toGks": target.get("id"),
                    "myDistanceKm": round(my_distance, 2),
                    "myRadiusKm": round(float(my_entry["radius"]), 2),
                    "targetDistanceKm": round(target_distance, 2)
                }
            )
        else:
            logger.info(
                f"[OPTİMUM GKS] İHA-{uav_id} daha yakın istasyona taşınıyor: "
                f"GKS-{config.GKS_ID} ({my_distance:.2f} km) -> {target.get('id')} ({target_distance:.2f} km)."
            )
            await self._emit_event(
                event_type="handover.auto_initiated",
                category="HANDOVER",
                severity="INFO",
                entity_type="uav",
                entity_id=f"İHA-{uav_id}",
                action="auto_handover",
                message=(
                    f"İHA-{uav_id} daha yakın istasyona devrediliyor: GKS-{config.GKS_ID} -> {target.get('id')}."
                ),
                data={
                    "fromGks": f"GKS-{config.GKS_ID}",
                    "toGks": target.get("id"),
                    "myDistanceKm": round(my_distance, 2),
                    "targetDistanceKm": round(target_distance, 2)
                }
            )

        await self.send_handover_command(uav_id, address, target_host, int(target["port"]))

    async def _evaluate_link_gate(self, uav_id, address, current_time, range_ctx):
        my_entry = range_ctx["my_entry"]
        my_distance = range_ctx["my_distance"]
        my_in_range = range_ctx["my_in_range"]
        has_in_range = range_ctx["has_in_range"]
        target = range_ctx["target"]
        target_distance = range_ctx["target_distance"]
        mission_active = bool(self.active_missions.get(uav_id, False))

        marker = self.out_of_range_state.get(uav_id)

        # 1) Fully out of coverage: stop publishing telemetry and close command path.
        if not has_in_range:
            self.active_endpoints.pop(uav_id, None)
            self.last_seen_wall_clock.pop(uav_id, None)
            self.local_fec_windows.pop(uav_id, None)
            self.seq_resync_required.add(uav_id)

            if marker is None:
                self.out_of_range_state[uav_id] = {
                    "since": current_time,
                    "last_emit": current_time,
                    "mode": "NO_RANGE"
                }
                msg_prefix = f"İHA-{uav_id} hiçbir GKS menzilinde değil"
                if mission_active:
                    msg_prefix = f"İHA-{uav_id} görev sırasında hiçbir GKS menzilinde değil"
                await self._emit_event(
                    event_type="link.signal_lost.out_of_range",
                    category="SYSTEM",
                    severity="WARN",
                    entity_type="uav",
                    entity_id=f"İHA-{uav_id}",
                    action="link_lost",
                    message=(
                        f"{msg_prefix}; telemetri yayını durduruldu "
                        f"(GKS-{config.GKS_ID} uzaklık: {my_distance:.2f} km / menzil: {float(my_entry['radius']):.2f} km)."
                    ),
                    data={
                        "gksId": f"GKS-{config.GKS_ID}",
                        "distanceKm": round(my_distance, 2),
                        "radiusKm": round(float(my_entry["radius"]), 2),
                        "missionActive": mission_active
                    }
                )
            return False

        # 2) Out of this GKS range while another GKS is still reachable.
        if not my_in_range:
            self.active_endpoints.pop(uav_id, None)
            self.last_seen_wall_clock.pop(uav_id, None)
            self.local_fec_windows.pop(uav_id, None)
            self.seq_resync_required.add(uav_id)

            if marker is None or marker.get("mode") != "AWAITING_HANDOVER":
                self.out_of_range_state[uav_id] = {
                    "since": current_time,
                    "last_emit": current_time,
                    "mode": "AWAITING_HANDOVER"
                }
                await self._emit_event(
                    event_type="link.signal_lost.out_of_current_gks",
                    category="HANDOVER",
                    severity="WARN",
                    entity_type="uav",
                    entity_id=f"İHA-{uav_id}",
                    action="handover_required",
                    message=(
                        f"İHA-{uav_id} GKS-{config.GKS_ID} menzili dışında "
                        f"({my_distance:.2f} km / {float(my_entry['radius']):.2f} km); "
                        "eski GKS telemetrisi durduruldu ve handover aranıyor."
                    ),
                    data={
                        "fromGks": f"GKS-{config.GKS_ID}",
                        "distanceKm": round(my_distance, 2),
                        "radiusKm": round(float(my_entry["radius"]), 2),
                        "targetGks": target.get("id") if target else None,
                        "targetDistanceKm": round(target_distance, 2) if target_distance is not None else None,
                        "missionActive": mission_active
                    }
                )

            await self._maybe_auto_handover(uav_id, address, current_time, range_ctx)
            return False

        # 3) Re-entered coverage of this GKS.
        current_time_ms = int(time.time() * 1000)
        self.active_endpoints[uav_id] = address
        self.last_seen_wall_clock[uav_id] = current_time_ms

        if marker is not None:
            elapsed = max(0.0, current_time - marker.get("since", current_time))
            self.out_of_range_state.pop(uav_id, None)
            await self._emit_event(
                event_type="link.signal_restored",
                category="SYSTEM",
                severity="INFO",
                entity_type="uav",
                entity_id=f"İHA-{uav_id}",
                action="link_restored",
                message=(
                    f"İHA-{uav_id} bağlantısı geri geldi; GKS-{config.GKS_ID} telemetri akışı yeniden aktif "
                    f"(kesinti: {elapsed:.1f} sn)."
                ),
                data={
                    "gksId": f"GKS-{config.GKS_ID}",
                    "downtimeSec": round(elapsed, 1),
                    "distanceKm": round(my_distance, 2),
                    "radiusKm": round(float(my_entry["radius"]), 2),
                    "missionActive": mission_active
                }
            )

        return True

    def datagram_received(self, data, addr):
        ip_addr = addr[0]
        
        if ip_addr not in self.ip_limiters:
            self.ip_limiters[ip_addr] = TokenBucketRateLimiter(capacity=150, fill_rate=config.RATE_LIMIT_PER_SECOND)
            
        if not self.ip_limiters[ip_addr].consume(1):
            # Rate limit exceeded
            return

        asyncio.create_task(self.process_packet(data, addr, time.time(), ip_addr))

    async def process_packet(self, data, address, current_time, ip_addr):
        if not data: return
        magic_byte = data[0]

        # Handshake
        if magic_byte == config.PacketMagic.HANDSHAKE_REQ:
            await self._handle_handshake(data, address, ip_addr, is_rekey=False)
            
        # Rekey
        elif magic_byte == config.PacketMagic.REKEY_REQ:
            await self._handle_handshake(data, address, ip_addr, is_rekey=True)

        # TELEMETRY OR FEC
        elif magic_byte in [config.PacketMagic.TELEMETRY, config.PacketMagic.FEC_RECOVERY]:
            await self._handle_telemetry_or_fec(data, address, current_time, ip_addr, magic_byte)

    async def _handle_handshake(self, data, address, ip_addr, is_rekey):
        if len(data) < 72: return
        uav_id = struct.unpack('<i', data[1:5])[0]
        uav_pub_key_bytes = data[5:70]
        sig_len = data[70]
        signature = data[71:71+sig_len]
        payload_to_verify = data[1:70]

        if not self.crypto_manager.verify_signature(signature, payload_to_verify):
            logger.warning("Handshake signature verification failed for UAV-%s from IP %s", uav_id, ip_addr)
            await self._emit_event(
                event_type="security.handshake.signature_invalid",
                category="SECURITY",
                severity="WARN",
                entity_type="uav",
                entity_id=f"İHA-{uav_id}",
                action="handshake_reject",
                message=f"İHA-{uav_id} için imza doğrulaması başarısız oldu.",
                data={"ip": ip_addr, "isRekey": is_rekey}
            )
            return
            
        if is_rekey and not self.crypto_manager.has_session(uav_id):
            return

        action_word = "rekey" if is_rekey else "handshake"
        logger.info("Accepted %s request for UAV-%s. Preparing session keys.", action_word, uav_id)
        await self._emit_event(
            event_type="crypto.handshake.accepted" if not is_rekey else "crypto.rekey.accepted",
            category="CRYPTO",
            severity="INFO",
            entity_type="uav",
            entity_id=f"İHA-{uav_id}",
            action="rekey" if is_rekey else "handshake",
            message=f"İHA-{uav_id} için {'anahtar rotasyonu' if is_rekey else 'el sıkışma'} doğrulandı.",
            data={"ip": ip_addr}
        )
        
        try:
            gks_ephemeral_public_bytes, gks_signature = self.crypto_manager.generate_handshake_response(
                uav_id, uav_pub_key_bytes, is_rekey=is_rekey
            )
            resp_magic = config.PacketMagic.REKEY_RES if is_rekey else config.PacketMagic.HANDSHAKE_RES
            response_pkt = struct.pack('<B', resp_magic) + gks_ephemeral_public_bytes + struct.pack('<B', len(gks_signature)) + gks_signature
            self.transport.sendto(response_pkt, address)
        except Exception as e:
            logger.error(f"Handshake yanıtı oluşturulamadı: {e}")
            await self._emit_event(
                event_type="crypto.handshake.failed",
                category="CRYPTO",
                severity="ERROR",
                entity_type="uav",
                entity_id=f"İHA-{uav_id}",
                action="handshake_response",
                message=f"İHA-{uav_id} için handshake yanıtı oluşturulamadı.",
                data={"error": str(e)}
            )

    async def _handle_telemetry_or_fec(self, data, address, current_time, ip_addr, magic_byte):
        if len(data) < 33: return 
        
        uav_id = struct.unpack('<i', data[1:5])[0]
        
        if not self.crypto_manager.has_session(uav_id):
            reset_key = f"reset_{uav_id}"
            if current_time - self.last_valid_timestamps.get(reset_key, 0) > 2.0:
                logger.warning("No active session for UAV-%s. Sending RESET packet.", uav_id)
                self.transport.sendto(struct.pack('<B', config.PacketMagic.RESET), address)
                self.last_valid_timestamps[reset_key] = current_time
                await self._emit_event(
                    event_type="packet.reset.sent",
                    category="PACKET",
                    severity="WARN",
                    entity_type="uav",
                    entity_id=f"İHA-{uav_id}",
                    action="reset",
                    message=f"İHA-{uav_id} için oturum bulunamadı, RESET paketi gönderildi.",
                    data={"ip": ip_addr}
                )
            return

        iv = data[5:17]
        ciphertext = data[17:-16]
        auth_tag = data[-16:]
        aad = data[1:5]
        
        try:
            decrypted_payload = self.crypto_manager.decrypt_payload(uav_id, iv, ciphertext, auth_tag, aad)
        except ValueError as e:
            logger.warning(f"{e} IP: {ip_addr}")
            await self._emit_event(
                event_type="security.packet.rejected",
                category="SECURITY",
                severity="WARN",
                entity_type="uav",
                entity_id=f"İHA-{uav_id}",
                action="decrypt_fail",
                message=f"İHA-{uav_id} paketi doğrulanamadı ve reddedildi.",
                data={"ip": ip_addr, "reason": str(e)}
            )
            return

        if len(decrypted_payload) != struct.calcsize(config.UNPACK_FORMAT): return

        unpacked_data = struct.unpack(config.UNPACK_FORMAT, decrypted_payload)
        seq_num, timestamp, lat_raw, lon_raw, alt, speed, batt, mode, priority = unpacked_data
        
        lat, lon = lat_raw / config.GPS_SCALE, lon_raw / config.GPS_SCALE

        if magic_byte != config.PacketMagic.FEC_RECOVERY:
            if uav_id in self.last_valid_timestamps:
                if timestamp <= self.last_valid_timestamps[uav_id]:
                    # Replay attack blocked basically (already handled by seq logic too)
                    ack_packet = struct.pack(config.ACK_FORMAT, config.PacketMagic.ACKNOWLEDGE, seq_num, timestamp)
                    self.transport.sendto(ack_packet, address)
                    return
            self.last_valid_timestamps[uav_id] = max(timestamp, self.last_valid_timestamps.get(uav_id, 0))

        range_ctx = await self._build_range_context(lat, lon)
        can_publish_here = await self._evaluate_link_gate(uav_id, address, current_time, range_ctx)
        if not can_publish_here:
            # Return ACK to keep transport flow stable, but do not publish telemetry.
            ack_packet = struct.pack(config.ACK_FORMAT, config.PacketMagic.ACKNOWLEDGE, seq_num, timestamp)
            self.transport.sendto(ack_packet, address)
            return
        
        state = await self.repository.check_uav_session(uav_id)
        if not state: return

        if uav_id not in self.local_fec_windows:
            self.local_fec_windows[uav_id] = {}

        updates = {}
        
        # FEC Mimarisi
        if magic_byte == config.PacketMagic.FEC_RECOVERY:
            if len(self.local_fec_windows[uav_id]) == 2:
                recovered_payload = bytearray(decrypted_payload)
                for stored_seq in self.local_fec_windows[uav_id]:
                    stored_data = self.local_fec_windows[uav_id][stored_seq]
                    for i in range(len(recovered_payload)):
                        recovered_payload[i] ^= stored_data[i]
                
                rec_seq = struct.unpack('<I', recovered_payload[0:4])[0]
                logger.debug(f"[FEC SİHİRİ] İHA-{uav_id} Paket #{rec_seq} ŞİFRELİ OLARAK KURTARILDI!")

                updates["recovered_packets"] = 1
                if state["total_lost"] > 0:
                    updates["total_lost"] = -1
                await self.repository.update_uav_stats(uav_id, updates)
                await self._emit_event(
                    event_type="packet.fec.recovered",
                    category="PACKET",
                    severity="INFO",
                    entity_type="uav",
                    entity_id=f"İHA-{uav_id}",
                    action="fec_recovery",
                    message=f"İHA-{uav_id} için kayıp paket FEC ile kurtarıldı (seq: {rec_seq}).",
                    data={"seqNum": rec_seq}
                )
            self.local_fec_windows[uav_id].clear()
            return

        # Db log records
        await self.repository.save_telemetry_log(state["session_id"], seq_num, lat, lon, alt, speed, batt, mode, priority)

        updates["total_received"] = 1
        resync_required = uav_id in self.seq_resync_required
        if resync_required:
            self.seq_resync_required.discard(uav_id)
        
        next_expected = state["expected_seq_num"]
        if state["expected_seq_num"] == 0:
            next_expected = seq_num + 1
        else:
            if resync_required and seq_num >= state["expected_seq_num"]:
                skipped_packets = max(0, seq_num - state["expected_seq_num"])
                next_expected = seq_num + 1
                if skipped_packets > 0:
                    await self._emit_event(
                        event_type="link.sequence_resynced",
                        category="SYSTEM",
                        severity="INFO",
                        entity_type="uav",
                        entity_id=f"İHA-{uav_id}",
                        action="seq_resync",
                        message=(
                            f"İHA-{uav_id} bağlantı dönüşünde sıra numarası yeniden senkronlandı "
                            f"(atlanan: {skipped_packets})."
                        ),
                        data={
                            "skippedPackets": skipped_packets,
                            "resumeSeq": seq_num,
                            "expectedSeqBefore": state["expected_seq_num"]
                        }
                    )
            elif seq_num > state["expected_seq_num"]:
                lost_count = seq_num - state["expected_seq_num"]
                updates["total_lost"] = updates.get("total_lost", 0) + lost_count
                next_expected = seq_num + 1
            elif seq_num == state["expected_seq_num"]:
                next_expected = seq_num + 1
            else:
                 if priority == 1: 
                     updates["recovered_packets"] = updates.get("recovered_packets", 0) + 1
                     if state["total_lost"] > 0:
                         updates["total_lost"] = updates.get("total_lost", 0) - 1
                 next_expected = state["expected_seq_num"]

        updates["expected_seq_num"] = next_expected
        await self.repository.update_uav_stats(uav_id, updates)

        total_received = state["total_received"] + updates.get("total_received", 0)
        total_lost = state["total_lost"] + updates.get("total_lost", 0)
        
        total_processed = total_received + total_lost
        
        # Apply warm-up window to avoid exaggerated QoS loss ratios on small samples.
        if total_processed < 100:
            packet_loss_percent = 0.0
        else:
            qos = (total_received / total_processed) * 100 if total_processed > 0 else 100.0
            packet_loss_percent = 100.0 - qos 

        current_time_ms = int(time.time() * 1000)
        
        if timestamp > 1600000000000:
            calculated_ping = max(0, current_time_ms - timestamp)
        else:
            offset = current_time_ms - timestamp
            if uav_id not in self.uav_clock_offsets or offset < self.uav_clock_offsets[uav_id]:
                self.uav_clock_offsets[uav_id] = offset
            calculated_ping = offset - self.uav_clock_offsets[uav_id]

        status_text = "Otonom Devriye" if mode == 1 else ("Eve Dönüyor (RTL)" if mode == 2 else "Manuel Kontrol")
        prio_str = "KRİTİK" if priority == 1 else "AKAN"

        logger.debug(f"[{prio_str}] [GKS-{config.GKS_ID} -> İHA-{uav_id}] Pkt #{seq_num} | Bat: %{batt:.1f}")

        telemetry_payload = {
            "id": f"İHA-{uav_id}",
            "lat": lat,
            "lng": lon,
            "alt": round(alt, 1),
            "speed": round(speed, 1),
            "battery": round(batt, 1),
            "status": status_text,
            "ping": calculated_ping,
            "qos": round(packet_loss_percent, 2),
            "active_gks": f"GKS-{config.GKS_ID}"
        }
        
        await self.repository.publish_telemetry(telemetry_payload)
        await self._maybe_auto_handover(uav_id, address, current_time, range_ctx)
        
        if priority == 1 and magic_byte != config.PacketMagic.FEC_RECOVERY:
            if uav_id in self.local_fec_windows:
                self.local_fec_windows[uav_id][seq_num] = decrypted_payload
                if len(self.local_fec_windows[uav_id]) > 3:
                    oldest_seq = min(self.local_fec_windows[uav_id].keys())
                    del self.local_fec_windows[uav_id][oldest_seq]

        ack_packet = struct.pack(config.ACK_FORMAT, config.PacketMagic.ACKNOWLEDGE, seq_num, timestamp)
        self.transport.sendto(ack_packet, address)

    async def session_timeout_checker(self):
        """Her 30 saniyede bir otonom temizlik ve GKS kayıt işlemleri yapar."""
        SESSION_TIMEOUT = 60.0  # saniye
        CHECK_INTERVAL = 10.0  # saniye (GKS kayıt için daha sıkılaştırdık)
        
        while True:
            try:
                await asyncio.sleep(CHECK_INTERVAL)
                current_time_ms = int(time.time() * 1000)
                
                # Refresh this GKS heartbeat so it stays visible on the map.
                await self.repository.register_gks()
                
                timed_out_uavs = []
                for uav_id, last_ts in list(self.last_seen_wall_clock.items()):
                    elapsed_seconds = (current_time_ms - last_ts) / 1000.0
                    if elapsed_seconds > SESSION_TIMEOUT:
                        timed_out_uavs.append(uav_id)
                
                for uav_id in timed_out_uavs:
                    logger.warning(f"[ZAMAN AŞIMI] İHA-{uav_id} {SESSION_TIMEOUT}sn boyunca veri göndermedi. Oturum kapatılıyor...")
                    await self._emit_event(
                        event_type="uav.timeout",
                        category="SYSTEM",
                        severity="WARN",
                        entity_type="uav",
                        entity_id=f"İHA-{uav_id}",
                        action="timeout",
                        message=f"İHA-{uav_id} {SESSION_TIMEOUT}sn veri göndermediği için oturum kapatılıyor.",
                        data={"timeoutSeconds": SESSION_TIMEOUT}
                    )
                    await self.repository.close_flight_session(uav_id)
                    self.last_valid_timestamps.pop(uav_id, None)
                    self.last_valid_timestamps.pop(f"reset_{uav_id}", None)
                    self.last_seen_wall_clock.pop(uav_id, None)
                    self.active_endpoints.pop(uav_id, None)
                    self.local_fec_windows.pop(uav_id, None)
                    self.last_handover_attempt.pop(uav_id, None)
                    self.out_of_range_state.pop(uav_id, None)
                    self.seq_resync_required.discard(uav_id)
                    self.active_missions.pop(uav_id, None)
                    self.crypto_manager.uav_session_keys.pop(uav_id, None)
                    
            except Exception as e:
                logger.error(f"Session timeout checker hatası: {e}")

    async def listen_to_redis_commands(self):
        import json
        while True:
            pubsub = self.repository.redis_conn.pubsub()
            try:
                await pubsub.subscribe("command_stream")
                logger.info(f"[GKS-{config.GKS_ID}] Redis 'command_stream' dinleniyor...")

                async for message in pubsub.listen():
                    if message["type"] != "message":
                        continue

                    try:
                        payload = json.loads(message["data"])
                    except Exception as parse_error:
                        logger.warning(f"Komut parse edilemedi, atlanıyor: {parse_error}")
                        await self._emit_event(
                            event_type="system.redis_listener.payload_invalid",
                            category="SYSTEM",
                            severity="WARN",
                            entity_type="gks",
                            entity_id=f"GKS-{config.GKS_ID}",
                            action="redis_listener",
                            message="Redis komut payload çözümlenemedi, mesaj atlandı.",
                            data={"error": str(parse_error)}
                        )
                        continue

                    try:
                        target_str = payload.get("target", "")
                        command = payload.get("command")

                        if target_str.startswith("İHA-"):
                            uav_id_str = target_str.replace("İHA-", "")
                        elif target_str.startswith("UAV-"):
                            uav_id_str = target_str.replace("UAV-", "")
                        else:
                            continue

                        try:
                            uav_id = int(uav_id_str)
                        except ValueError:
                            import zlib
                            uav_id = zlib.crc32(uav_id_str.encode('utf-8')) & 0xffffffff

                        if uav_id not in self.active_endpoints:
                            # This UAV is not currently owned by this GKS.
                            now = time.time()
                            throttle_key = f"{uav_id}:{command or 'UNKNOWN'}:{target_str}"
                            last_emit = self.last_not_local_event.get(throttle_key, 0)
                            if now - last_emit > 5.0:
                                self.last_not_local_event[throttle_key] = now
                                await self._emit_event(
                                    event_type="command.skipped.not_local",
                                    category="COMMAND",
                                    severity="DEBUG",
                                    entity_type="uav",
                                    entity_id=f"İHA-{uav_id}",
                                    action=command or "UNKNOWN",
                                    message=(
                                        f"İHA-{uav_id} bu GKS üzerinde aktif olmadığı için "
                                        f"{command or 'UNKNOWN'} komutu işlenmedi."
                                    ),
                                    data={"target": target_str}
                                )
                            continue

                        address = self.active_endpoints[uav_id]
                        await self._emit_event(
                            event_type="command.received.redis",
                            category="COMMAND",
                            severity="INFO",
                            entity_type="uav",
                            entity_id=f"İHA-{uav_id}",
                            action=command or "UNKNOWN",
                            message=f"İHA-{uav_id} için {command} komutu Redis üzerinden alındı.",
                            data={"target": target_str}
                        )

                        if command == "MISSION_UPLOAD":
                            waypoints = payload.get("waypoints", [])
                            await self.send_mission(uav_id, address, waypoints)
                        elif command == "HANDOVER":
                            target_gks_ip = payload.get("target_ip")
                            target_gks_port = int(payload.get("target_port", 5000))
                            if not target_gks_ip:
                                logger.error("HANDOVER komutu target_ip içermiyor!")
                                await self._emit_event(
                                    event_type="handover.command.invalid",
                                    category="HANDOVER",
                                    severity="ERROR",
                                    entity_type="uav",
                                    entity_id=f"İHA-{uav_id}",
                                    action="handover",
                                    message=f"İHA-{uav_id} için gelen HANDOVER komutu target_ip içermiyor.",
                                    data={}
                                )
                                continue
                            logger.info(f"[HANDOVER] İHA-{uav_id} {target_gks_ip}:{target_gks_port} adresine devrediliyor...")
                            await self.send_handover_command(uav_id, address, target_gks_ip, target_gks_port)
                        else:
                            lat = payload.get("lat")
                            lng = payload.get("lng")
                            lat = float(lat) if lat is not None else 0.0
                            lng = float(lng) if lng is not None else 0.0
                            logger.info(f"[TAKTİK] {command} komutu {uav_id} ID'sine atılıyor...")
                            await self.send_tactical_command(uav_id, address, command, lat, lng)
                    except Exception as message_error:
                        logger.error(f"Komut işleme hatası (mesaj atlandı): {message_error}")
                        await self._emit_event(
                            event_type="system.redis_listener.message_error",
                            category="SYSTEM",
                            severity="ERROR",
                            entity_type="gks",
                            entity_id=f"GKS-{config.GKS_ID}",
                            action="redis_listener",
                            message="Redis komut mesajı işlenirken hata oluştu, mesaj atlandı.",
                            data={"error": str(message_error)}
                        )
                        continue
            except Exception as e:
                logger.error(f"Redis Listen Hatası: {e}")
                await self._emit_event(
                    event_type="system.redis_listener.error",
                    category="SYSTEM",
                    severity="ERROR",
                    entity_type="gks",
                    entity_id=f"GKS-{config.GKS_ID}",
                    action="redis_listener",
                    message="Redis komut dinleyicisi hata verdi, yeniden bağlanacak.",
                    data={"error": str(e)}
                )
                await asyncio.sleep(2)
            finally:
                try:
                    await pubsub.unsubscribe("command_stream")
                except Exception:
                    pass
                try:
                    await pubsub.close()
                except Exception:
                    pass

    async def send_tactical_command(self, uav_id, address, command_str, lat=0.0, lng=0.0):
        if not self.crypto_manager.has_session(uav_id):
            await self._emit_event(
                event_type="command.tactical.skipped.no_session",
                category="COMMAND",
                severity="WARN",
                entity_type="uav",
                entity_id=f"İHA-{uav_id}",
                action=command_str,
                message=f"İHA-{uav_id} için {command_str} komutu atlandı: aktif oturum yok.",
                data={}
            )
            return
        
        # Command map (C# enum -> integer ID)
        cmd_map = {
            "RTL": 1,
            "AUTO_PATROL": 2,
            "STOP": 3,
            "TAKEOFF": 4,
            "SPEED_INC": 5,
            "SPEED_DEC": 6,
            "ALT_INC": 7,
            "ALT_DEC": 8,
            "ORBIT_TARGET": 9,
            "FIGURE_8": 10,
            "EVASIVE_MANEUVER": 11
        }
        
        cmd_id = cmd_map.get(command_str, 0)
        if cmd_id == 0:
            logger.warning(f"Bilinmeyen taktiksel komut: {command_str}")
            await self._emit_event(
                event_type="command.tactical.invalid",
                category="COMMAND",
                severity="WARN",
                entity_type="uav",
                entity_id=f"İHA-{uav_id}",
                action=command_str,
                message=f"İHA-{uav_id} için bilinmeyen taktik komut alındı: {command_str}.",
                data={}
            )
            return
            
        # Payload: 4 byte integer veya 20 byte (int + double + double)
        if lat != 0.0 and lng != 0.0:
            payload = struct.pack('<idd', cmd_id, float(lat), float(lng))
        else:
            payload = struct.pack('<i', cmd_id)
            
        aad = struct.pack('<i', uav_id)
        
        iv, ciphertext, auth_tag = self.crypto_manager.encrypt_payload(uav_id, payload, aad)
        
        magic = struct.pack('<B', config.PacketMagic.TACTICAL_CMD)
        packet = magic + aad + iv + ciphertext + auth_tag
        self.transport.sendto(packet, address)
        logger.info(f"==> TAKTİKSEL KOMUT ({command_str} @ {lat},{lng}) -> İHA-{uav_id} [AES-GCM Zırhlı]")
        await self._emit_event(
            event_type="command.tactical.sent",
            category="COMMAND",
            severity="INFO",
            entity_type="uav",
            entity_id=f"İHA-{uav_id}",
            action=command_str,
            message=f"İHA-{uav_id} için {command_str} komutu gönderildi.",
            data={"lat": lat, "lng": lng}
        )
        if command_str in ("RTL", "STOP"):
            self.active_missions[uav_id] = False

    async def send_handover_command(self, uav_id, address, target_ip, target_port):
        if not self.crypto_manager.has_session(uav_id):
            await self._emit_event(
                event_type="handover.skipped.no_session",
                category="HANDOVER",
                severity="WARN",
                entity_type="uav",
                entity_id=f"İHA-{uav_id}",
                action="handover",
                message=f"İHA-{uav_id} için handover atlandı: aktif oturum yok.",
                data={"targetIp": target_ip, "targetPort": target_port}
            )
            return
        
        # HANDOVER CMD ID = 12
        cmd_id = 12
        ip_bytes = target_ip.encode('utf-8')
        # Format: <i (4 bytes id) + H (2 bytes port) + B (1 byte ip len) + N bytes IP string
        payload = struct.pack(f'<iHB{len(ip_bytes)}s', cmd_id, target_port, len(ip_bytes), ip_bytes)
        
        aad = struct.pack('<i', uav_id)
        iv, ciphertext, auth_tag = self.crypto_manager.encrypt_payload(uav_id, payload, aad)
        
        magic = struct.pack('<B', config.PacketMagic.TACTICAL_CMD)
        packet = magic + aad + iv + ciphertext + auth_tag
        self.transport.sendto(packet, address)
        logger.info(f"==> HANDOVER KOMUTU ({target_ip}:{target_port}) -> İHA-{uav_id} [AES-GCM Zırhlı]")
        await self._emit_event(
            event_type="handover.command.sent",
            category="HANDOVER",
            severity="INFO",
            entity_type="uav",
            entity_id=f"İHA-{uav_id}",
            action="handover",
            message=f"İHA-{uav_id} için handover komutu gönderildi ({target_ip}:{target_port}).",
            data={"targetIp": target_ip, "targetPort": target_port}
        )
        
        # Short delay to increase delivery chance before releasing source session.
        await asyncio.sleep(0.5)
        logger.info(f"[DEVİR] İHA-{uav_id} oturumu eski GKS'den (GKS-{config.GKS_ID}) temizleniyor.")
        await self.repository.close_flight_session(uav_id)
        await self._emit_event(
            event_type="handover.source_released",
            category="HANDOVER",
            severity="INFO",
            entity_type="uav",
            entity_id=f"İHA-{uav_id}",
            action="source_release",
            message=f"İHA-{uav_id} eski GKS kaynağından temizlendi.",
            data={"fromGks": f"GKS-{config.GKS_ID}"}
        )
        self.last_valid_timestamps.pop(uav_id, None)
        self.last_valid_timestamps.pop(f"reset_{uav_id}", None)
        self.last_seen_wall_clock.pop(uav_id, None)
        self.active_endpoints.pop(uav_id, None)
        self.local_fec_windows.pop(uav_id, None)
        self.last_handover_attempt.pop(uav_id, None)
        self.out_of_range_state.pop(uav_id, None)
        self.seq_resync_required.discard(uav_id)
        self.active_missions.pop(uav_id, None)
        self.crypto_manager.uav_session_keys.pop(uav_id, None)

    async def send_mission(self, uav_id, address, waypoints):
        if not self.crypto_manager.has_session(uav_id):
            await self._emit_event(
                event_type="mission.upload.skipped.no_session",
                category="MISSION",
                severity="WARN",
                entity_type="uav",
                entity_id=f"İHA-{uav_id}",
                action="MISSION_UPLOAD",
                message=f"İHA-{uav_id} için görev yükleme atlandı: aktif oturum yok.",
                data={}
            )
            return
        num_points = min(len(waypoints), 50)
        fmt = f"<B{num_points * 2}f"
        points_flat = []
        for wp in waypoints[:num_points]:
            points_flat.extend([wp['lat'], wp['lng']])
            
        payload = struct.pack(fmt, num_points, *points_flat)
        aad = struct.pack('<i', uav_id)
        
        iv, ciphertext, auth_tag = self.crypto_manager.encrypt_payload(uav_id, payload, aad)
        
        magic = struct.pack('<B', config.PacketMagic.MISSION_UPLOAD)
        packet = magic + aad + iv + ciphertext + auth_tag
        self.transport.sendto(packet, address)
        logger.info(f"==> MISSION UPLOAD ({num_points} WPs) -> İHA-{uav_id} [AES-GCM Zırhlı]")
        await self._emit_event(
            event_type="mission.upload.sent",
            category="MISSION",
            severity="INFO",
            entity_type="uav",
            entity_id=f"İHA-{uav_id}",
            action="MISSION_UPLOAD",
            message=f"İHA-{uav_id} için görev paketi gönderildi ({num_points} waypoint).",
            data={"waypointCount": num_points}
        )
        self.active_missions[uav_id] = True


async def main():
    logger.info("Veritabanı ve Redis bağlantıları başlatılıyor (AsyncIO)...")
    
    crypto_manager = CryptoManager()
    repository = Repository()
    
    await repository.connect()
    
    # Publish an initial GKS heartbeat immediately so UI can render this node.
    await repository.register_gks()

    loop = asyncio.get_running_loop()
    
    transport, protocol = await loop.create_datagram_endpoint(
        lambda: AegisUdpProtocol(repository, crypto_manager),
        local_addr=(config.HOST, config.PORT)
    )

    try:
        await asyncio.sleep(3600*24*365) # Server forever
    except asyncio.CancelledError:
        pass
    finally:
        transport.close()
        await repository.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("GKS Sunucusu kapatılıyor...")
