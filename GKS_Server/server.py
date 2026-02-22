import socket
import struct
import zlib
import random
import redis
import psycopg2
import time

GKS_ID = random.randint(10,99)

HOST = "0.0.0.0"
PORT = 5000
GPS_SCALE = 10000000.0

PACKET_FORMAT = '<BIQiiifffBBI' 
ACK_FORMAT = '<BIQ'

server_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
server_socket.bind((HOST, PORT))

try:
    r = redis.Redis(host='redis_db', port=6379, decode_responses=True)
    r.ping()
except Exception as e:
    print(f"❌ [GKS-{GKS_ID}] Redis'e bağlanılamadı: {e}")
    exit(1)

max_retries = 5
for attepts in range(max_retries):
    try:
        pg_conn = psycopg2.connect(
            host="sentinel_db",
            database="sentinel_hq",
            user="admin",
            password="password123"
        )
        pg_conn.autocommit = True
        pg_cursor = pg_conn.cursor()
        print(f"🗄️ [GKS-{GKS_ID}] Kara Kutu (PostgreSQL) Bağlantısı Başarılı!")
        break
    except Exception as e:
        print(f"❌ [GKS-{GKS_ID}] PostgreSQL'e bağlanılamadı: {e}")
        time.sleep(3)
else:
    print(f"❌ [GKS-{GKS_ID}] PostgreSQL'e ulaşılamadı! Sistem kapatılıyor.")
    exit(1)

print(f"📡 [GKS-{GKS_ID}] Ortak Beyin (Redis) Bağlantısı Başarılı!")
print(f"📊 [GKS-{GKS_ID}] Dinlemede ve Dağıtık Sürü Takibine Hazır...\n")

local_fec_windows = {}

while True:
    try:
        data, address = server_socket.recvfrom(1024)
        
        expected_size = struct.calcsize(PACKET_FORMAT)

        if len(data) != expected_size: continue

        payload = data[:-4] 
        calculated_crc = zlib.crc32(payload) & 0xFFFFFFFF

        unpacked_data = struct.unpack(PACKET_FORMAT, data)
        
        magic, seq_num, timestamp, uav_id, lat_raw, lon_raw, alt, speed, batt, mode, priority, received_crc = unpacked_data
        lat = lat_raw / GPS_SCALE
        lon = lon_raw / GPS_SCALE

        if magic not in [0xFF, 0xFE]: continue
            
        if calculated_crc != received_crc: continue

        uav_key = f"uav:{uav_id}"
        
        if not r.exists(uav_key):
            print(f"\n🌐 [GKS-{GKS_ID}] YENİ BAĞLANTI: İHA-{uav_id} ağa katıldı! Sistemlere işleniyor...")

            pg_cursor.execute("""
                INSERT INTO uav_registery (uav_id)
                VALUES (%s)
                ON CONFLICT (uav_id) DO NOTHING;
            """, (uav_id,))

            pg_cursor.execute("""
                INSERT INTO flight_sessions (uav_id)
                VALUES (%s)
                RETURNING session_id;
            """, (uav_id,))
            new_session_id = pg_cursor.fetchone()[0]

            r.hset(uav_key, mapping={
                "expected_seq_num": 0,
                "total_received": 0,
                "total_lost": 0,
                "recovered_packets": 0,
                "last_seen_by": GKS_ID,
                "session_id": new_session_id
            })
            local_fec_windows[uav_id] = {}

        if uav_id not in local_fec_windows:
            local_fec_windows[uav_id] = {}

        state = r.hgetall(uav_key)
        expected_seq_num = int(state["expected_seq_num"])
        total_received = int(state["total_received"])
        total_lost = int(state["total_lost"])
        recovered_packets = int(state["recovered_packets"])
        last_seen_by = int(state["last_seen_by"])
        current_session_id = int(state.get("session_id", 0))

        if last_seen_by != GKS_ID:
            print(f"🔀 [HANDOVER] İHA-{uav_id}, GKS-{last_seen_by} istasyonundan [GKS-{GKS_ID}] istasyonuna devredildi!")
            r.hset(uav_key, "last_seen_by", GKS_ID)

        if priority == 2:
            if len(local_fec_windows[uav_id]) == 2:
                recovered_payload = bytearray(data[:-4])
                for stored_seq in local_fec_windows[uav_id]:
                    stored_data = local_fec_windows[uav_id][stored_seq]
                    for i in range(len(recovered_payload)):
                        recovered_payload[i] ^= stored_data[i]
                
                rec_seq = struct.unpack('<I', recovered_payload[1:5])[0]
                print(f"🪄 [GKS-{GKS_ID}] [FEC SİHİRİ] İHA-{uav_id} Paket #{rec_seq} HAVADA TAMİR EDİLDİ!")

                if total_lost > 0:
                    r.hincrby(uav_key, "total_lost", -1)
                    total_lost -= 1
                r.hincrby(uav_key, "recovered_packets", 1)
                recovered_packets += 1
            
            local_fec_windows[uav_id].clear()
            continue

        try:
            pg_cursor.execute("""
                INSERT INTO telemetry_logs
                (session_id, gks_id, seq_num, latitude, longitude, altitude, speed, battery, flight_mode, priority)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (current_session_id, GKS_ID, seq_num, lat, lon, alt, speed, batt, mode, priority))
        except Exception as db_err:
            print(f"⚠️ Veritabanı Yazma Hatası: {db_err}")

        r.hincrby(uav_key, "total_received", 1)
        total_received += 1
        
        next_expected = expected_seq_num
        
        if expected_seq_num == 0:
            next_expected = seq_num + 1
        else:
            if seq_num == expected_seq_num:
                next_expected = expected_seq_num + 1
            elif seq_num > expected_seq_num:
                lost_count = seq_num - expected_seq_num
                r.hincrby(uav_key, "total_lost", lost_count)
                total_lost += lost_count
                next_expected = seq_num + 1
            else:
                if seq_num == 1 or (expected_seq_num - seq_num > 50):
                    next_expected = seq_num + 1
                    r.hset(uav_key, mapping={"total_received": 1, "total_lost": 0, "recovered_packets": 0})
                    total_received = 1; total_lost = 0; recovered_packets = 0
                    local_fec_windows[uav_id].clear()
                elif priority == 1:
                    r.hincrby(uav_key, "recovered_packets", 1)
                    recovered_packets += 1
                    if total_lost > 0:
                        r.hincrby(uav_key, "total_lost", -1)
                        total_lost -= 1

        r.hset(uav_key, "expected_seq_num", next_expected)

        total_processed = total_received + total_lost
        qos_percentage = (total_received / total_processed) * 100 if total_processed > 0 else 100.0
        prio_str = "🔴 KRİTİK" if priority == 1 else "🟢 AKAN"

        print(f"✅ [{prio_str}] [GKS-{GKS_ID} -> İHA-{uav_id}] Pkt #{seq_num} | 🔋 %{batt:.1f} | 📍 {lat:.4f}, {lon:.4f}")
        print(f"   📊 QoS: %{qos_percentage:.1f} | Beklenen: {next_expected} | Kayıp: {total_lost} | Kurtarılan: {recovered_packets}\n")

        if priority == 1:
            local_fec_windows[uav_id][seq_num] = data[:-4]
            ack_packet = struct.pack(ACK_FORMAT, 0xAA, seq_num, timestamp)
            server_socket.sendto(ack_packet, address)

    except Exception as e:
        print(f"Hata: {e}")