import socket
import struct
import zlib
import random
import redis
import psycopg2
import time
import os

GKS_ID = random.randint(10,99)
HOST = "0.0.0.0"
PORT = 5000
GPS_SCALE = 10000000.0
PACKET_FORMAT = '<BIQiiifffBBI' 
ACK_FORMAT = '<BIQ'

DB_HOST = os.getenv("DB_HOST", "sentinel_db")
DB_USER = os.getenv("DB_USER", "admin")
DB_PASS = os.getenv("DB_PASS", "password123")
DB_NAME = os.getenv("DB_NAME", "sentinel_hq")
REDIS_HOST = os.getenv("REDIS_HOST", "redis_db")

def connect_to_db():
    conn = psycopg2.connect(host=DB_HOST, database=DB_NAME, user=DB_USER, password=DB_PASS)
    conn.autocommit = True
    return conn, conn.cursor()

def connect_to_redis():
    client = redis.Redis(host=REDIS_HOST, port=6379, decode_responses=True)
    client.ping()
    return client

server_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
server_socket.bind((HOST, PORT))

try:
    pg_conn, pg_cursor = connect_to_db()
    print(f"🗄️ [GKS-{GKS_ID}] Kara Kutu (PostgreSQL) Bağlantısı Başarılı!")
    
    r = connect_to_redis()
    print(f"📡 [GKS-{GKS_ID}] Ortak Beyin (Redis) Bağlantısı Başarılı!")
except Exception as e:
    print(f"❌ [GKS-{GKS_ID}] Kritik Başlatma Hatası! Docker Healthcheck aşılamadı: {e}")
    exit(1)

print(f"📊 [GKS-{GKS_ID}] Dinlemede ve Dağıtık Sürü Takibine Hazır...\n")

local_fec_windows = {}

while True:
    try:
        data, address = server_socket.recvfrom(1024)
        if len(data) != struct.calcsize(PACKET_FORMAT): continue

        payload = data[:-4] 
        calculated_crc = zlib.crc32(payload) & 0xFFFFFFFF

        unpacked_data = struct.unpack(PACKET_FORMAT, data)
        magic, seq_num, timestamp, uav_id, lat_raw, lon_raw, alt, speed, batt, mode, priority, received_crc = unpacked_data
        
        if magic not in [0xFF, 0xFE]: continue
        if calculated_crc != received_crc: continue

        lat, lon = lat_raw / GPS_SCALE, lon_raw / GPS_SCALE
        uav_key = f"uav:{uav_id}"
        
        if not r.exists(uav_key):
            print(f"\n🌐 [GKS-{GKS_ID}] YENİ BAĞLANTI: İHA-{uav_id} ağa katıldı! Sistemlere işleniyor...")

            pg_cursor.execute("INSERT INTO uav_registery (uav_id) VALUES (%s) ON CONFLICT (uav_id) DO NOTHING;", (uav_id,))
            pg_cursor.execute("INSERT INTO flight_sessions (uav_id) VALUES (%s) RETURNING session_id;", (uav_id,))
            new_session_id = pg_cursor.fetchone()[0]

            r.hset(uav_key, mapping={
                "expected_seq_num": 0, "total_received": 0, "total_lost": 0,
                "recovered_packets": 0, "last_seen_by": GKS_ID, "session_id": new_session_id
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
                INSERT INTO telemetry_logs (session_id, gks_id, seq_num, latitude, longitude, altitude, speed, battery, flight_mode, priority)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (current_session_id, GKS_ID, seq_num, lat, lon, alt, speed, batt, mode, priority))
        except Exception as db_err:
            try:
                pg_conn, pg_cursor = connect_to_db()
                print("✅ 🗄️ Veritabanı Bağlantısı KURTARILDI! Kayıtlar devam ediyor.")
            except Exception:
                pass

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
        try:
            r = connect_to_redis()
            print("✅ 📡 Ortak Beyin KURTARILDI! Senkronizasyon devam ediyor.")
        except Exception:
            time.sleep(1)