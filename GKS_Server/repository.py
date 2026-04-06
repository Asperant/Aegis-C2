import json
import logging
import asyncpg
import redis.asyncio as redis
from redis.exceptions import RedisError
from datetime import datetime, timezone
import uuid

import config
import asyncio

logger = logging.getLogger("Repository")

class Repository:
    def __init__(self):
        self.db_pool = None
        self.redis_conn = None
        self.packet_event_counter = 0

    async def connect(self):
        if not config.DB_PASS:
            raise RuntimeError("DB_PASS environment variable is required for GKS database connection.")

        max_retries = 10
        for attempt in range(max_retries):
            try:
                self.redis_conn = await redis.Redis(host=config.REDIS_HOST, port=config.REDIS_PORT, decode_responses=True)
                await self.redis_conn.ping()
                logger.info("Redis async connection established.")
                break
            except RedisError as e:
                logger.error(f"Redis Bağlantı Hatası (Deneme {attempt + 1}/{max_retries}): {e}")
                if attempt == max_retries - 1: raise
                await asyncio.sleep(3)

        for attempt in range(max_retries):
            try:
                self.db_pool = await asyncpg.create_pool(
                    host=config.DB_HOST,
                    database=config.DB_NAME,
                    user=config.DB_USER,
                    password=config.DB_PASS,
                    min_size=5,
                    max_size=20
                )
                logger.info("PostgreSQL async connection established.")
                break
            except (asyncpg.PostgresError, OSError) as e:
                logger.error(f"PostgreSQL Bağlantı Hatası (Deneme {attempt + 1}/{max_retries}): {e}")
                if attempt == max_retries - 1: raise
                await asyncio.sleep(3)

    async def close(self):
        if self.db_pool:
            await self.db_pool.close()
        if self.redis_conn:
            await self.redis_conn.close()

    async def check_uav_session(self, uav_id):
        try:
            uav_key = f"uav:{uav_id}"
            uav_exists = await self.redis_conn.exists(uav_key)
            if not uav_exists:
                await self.db_pool.execute("INSERT INTO uav_registry (uav_id) VALUES ($1) ON CONFLICT (uav_id) DO NOTHING;", uav_id)
                new_session_id = await self.db_pool.fetchval("INSERT INTO flight_sessions (uav_id) VALUES ($1) RETURNING session_id;", uav_id)
                
                await self.redis_conn.hset(uav_key, mapping={
                    "expected_seq_num": 0, "total_received": 0, "total_lost": 0,
                    "recovered_packets": 0, "last_seen_by": config.GKS_ID, "session_id": new_session_id or 0
                })
                await self.publish_ops_event(
                    event_type="uav.session.created",
                    category="SYSTEM",
                    severity="INFO",
                    source=f"GKS-{config.GKS_ID}",
                    entity_type="uav",
                    entity_id=f"İHA-{uav_id}",
                    action="session_open",
                    message=f"İHA-{uav_id} için yeni uçuş oturumu açıldı.",
                    data={"sessionId": new_session_id or 0}
                )
            
            state = await self.redis_conn.hgetall(uav_key)
            previous_gks = int(state.get("last_seen_by", config.GKS_ID))
            if previous_gks != config.GKS_ID:
                await self.redis_conn.hset(uav_key, "last_seen_by", config.GKS_ID)
                await self.publish_ops_event(
                    event_type="handover.completed",
                    category="HANDOVER",
                    severity="INFO",
                    source=f"GKS-{config.GKS_ID}",
                    entity_type="uav",
                    entity_id=f"İHA-{uav_id}",
                    action="handover_accept",
                    message=f"İHA-{uav_id} kontrolü GKS-{previous_gks}'den GKS-{config.GKS_ID}'ye geçti.",
                    data={"fromGks": previous_gks, "toGks": config.GKS_ID}
                )
                
            # Persist active GKS for handover-aware routing.
            await self.redis_conn.hset(uav_key, "active_gks", config.GKS_ID)
                
            return {
                "expected_seq_num": int(state.get("expected_seq_num", 0)),
                "total_received": int(state.get("total_received", 0)),
                "total_lost": int(state.get("total_lost", 0)),
                "recovered_packets": int(state.get("recovered_packets", 0)),
                "session_id": int(state.get("session_id", 0))
            }
        except (RedisError, asyncpg.PostgresError) as e:
            logger.error(f"check_uav_session Hatası: {type(e).__name__} - {e}")
            return None

    async def save_telemetry_log(self, session_id, seq_num, lat, lon, alt, speed, batt, mode, priority):
        try:
            await self.db_pool.execute("""
                INSERT INTO telemetry_logs (session_id, gks_id, seq_num, latitude, longitude, altitude, speed, battery, flight_mode, priority)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """, session_id, config.GKS_ID, seq_num, lat, lon, alt, speed, batt, mode, priority)
        except asyncpg.PostgresError as e:
            logger.error(f"Veritabanı yazma hatası (AsyncPG): {type(e).__name__} - {e}")

    async def update_uav_stats(self, uav_id, updates):
        try:
            uav_key = f"uav:{uav_id}"
            
            if "total_lost" in updates: await self.redis_conn.hincrby(uav_key, "total_lost", updates["total_lost"])
            if "total_received" in updates: await self.redis_conn.hincrby(uav_key, "total_received", updates["total_received"])
            if "recovered_packets" in updates: await self.redis_conn.hincrby(uav_key, "recovered_packets", updates["recovered_packets"])
            if "expected_seq_num" in updates: await self.redis_conn.hset(uav_key, "expected_seq_num", updates["expected_seq_num"])
            
        except RedisError as e:
            logger.error(f"update_uav_stats Hatası: {e}")

    async def close_flight_session(self, uav_id):
        """Close timed-out UAV session and update end_time."""
        try:
            uav_key = f"uav:{uav_id}"
            await self.db_pool.execute(
                "UPDATE flight_sessions SET end_time = NOW() WHERE uav_id = $1 AND end_time IS NULL;",
                uav_id
            )
            await self.redis_conn.delete(uav_key)
            logger.info(f"[OTURUM KAPANDI] İHA-{uav_id} uçuş oturumu sonlandırıldı.")
            await self.publish_ops_event(
                event_type="uav.session.closed",
                category="SYSTEM",
                severity="WARN",
                source=f"GKS-{config.GKS_ID}",
                entity_type="uav",
                entity_id=f"İHA-{uav_id}",
                action="session_close",
                message=f"İHA-{uav_id} uçuş oturumu kapatıldı.",
                data={"reason": "session_closed"}
            )
        except (asyncpg.PostgresError, RedisError) as e:
            logger.error(f"close_flight_session Hatası: {type(e).__name__} - {e}")

    async def publish_telemetry(self, telemetry_payload):
        try:
            await self.redis_conn.publish("telemetry_stream", json.dumps(telemetry_payload))
            self.packet_event_counter += 1
            if self.packet_event_counter % config.OPS_PACKET_EVENT_EVERY == 0:
                await self.publish_ops_event(
                    event_type="packet.telemetry.received",
                    category="PACKET",
                    severity="INFO",
                    source=f"GKS-{config.GKS_ID}",
                    entity_type="uav",
                    entity_id=str(telemetry_payload.get("id", "İHA-?")),
                    action="telemetry_ingress",
                    message=(
                        f"{telemetry_payload.get('id', 'İHA-?')} telemetrisi işlendi "
                        f"(Ping: {telemetry_payload.get('ping', '-') }ms, QoS Kayıp: %{telemetry_payload.get('qos', '-')})."
                    ),
                    data={
                        "lat": telemetry_payload.get("lat"),
                        "lng": telemetry_payload.get("lng"),
                        "alt": telemetry_payload.get("alt"),
                        "speed": telemetry_payload.get("speed"),
                        "battery": telemetry_payload.get("battery"),
                        "ping": telemetry_payload.get("ping"),
                        "qosLoss": telemetry_payload.get("qos"),
                        "activeGks": telemetry_payload.get("active_gks")
                    }
                )
        except RedisError as e:
            logger.error(f"publish_telemetry Hatası: {e}")

    async def publish_ops_event(
        self,
        event_type,
        category,
        severity,
        source,
        entity_type,
        entity_id,
        action,
        message,
        data=None
    ):
        try:
            event_payload = {
                "eventId": uuid.uuid4().hex,
                "timestampUtc": datetime.now(timezone.utc).isoformat(),
                "eventType": event_type,
                "category": str(category or "SYSTEM").upper(),
                "severity": str(severity or "INFO").upper(),
                "source": source or f"GKS-{config.GKS_ID}",
                "entityType": entity_type or "system",
                "entityId": entity_id,
                "action": action or "unknown",
                "message": message or "",
                "data": data or {}
            }
            raw = json.dumps(event_payload, ensure_ascii=False)
            await self.redis_conn.publish("ops_event_stream", raw)
            await self.redis_conn.xadd(
                "ops_event_history",
                {
                    "event": raw,
                    "event_type": event_payload["eventType"],
                    "category": event_payload["category"],
                    "severity": event_payload["severity"],
                    "source": event_payload["source"],
                    "entity_id": event_payload["entityId"] or "",
                    "action": event_payload["action"]
                },
                maxlen=5000,
                approximate=True
            )
        except RedisError as e:
            logger.error(f"publish_ops_event Hatası: {e}")

    async def register_gks(self):
        """Publish periodic GKS heartbeat to Redis for map visibility."""
        import time
        try:
            gks_key = f"gks_instance:{config.GKS_ID}"
            
            # Preserve existing radius value; fallback to 50.0.
            current_radius = 50.0
            existing_data = await self.redis_conn.get(gks_key)
            if existing_data:
                try:
                    parsed = json.loads(existing_data)
                    current_radius = parsed.get("radius", 50.0)
                except:
                    pass

            payload = {
                "id": f"GKS-{config.GKS_ID}",
                "lat": config.GKS_LAT,
                "lng": config.GKS_LON,
                "timestamp": int(time.time()),
                "status": "active",
                "radius": current_radius,
                "host": config.GKS_HOST,
                "port": config.PORT
            }
            # Keep heartbeat key short-lived.
            await self.redis_conn.setex(gks_key, 30, json.dumps(payload))
        except RedisError as e:
            logger.error(f"GKS Registry yazma hatası: {e}")

    async def get_active_gks_instances(self):
        """Return active GKS records from Redis."""
        try:
            keys = await self.redis_conn.keys("gks_instance:*")
            instances = []
            for key in keys:
                raw = await self.redis_conn.get(key)
                if not raw:
                    continue
                try:
                    parsed = json.loads(raw)
                    parsed.setdefault("id", f"GKS-{str(key).replace('gks_instance:', '')}")
                    parsed.setdefault("radius", 50.0)
                    parsed.setdefault("port", config.PORT)
                    instances.append(parsed)
                except json.JSONDecodeError:
                    continue
            return instances
        except RedisError as e:
            logger.error(f"get_active_gks_instances Hatası: {e}")
            return []
