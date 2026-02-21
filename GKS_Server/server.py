import socket
import struct
import zlib

HOST = "0.0.0.0"
PORT = 5000
GPS_SCALE = 10000000.0

PACKET_FORMAT = '<BIQiiifffBBI' 
ACK_FORMAT = '<BIQ'

server_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
server_socket.bind((HOST, PORT))

print(f"📡 GKS (FAZ-3.3 Sentinel Modu) Dinlemede: {HOST}:{PORT}")
print("📊 QoS (Hizmet Kalitesi) Canlı Takip Sistemi Aktif...\n")

expected_seq_num = 0
total_received = 0
total_lost = 0
recovered_packets = 0
fec_window = {}

while True:
    try:
        data, address = server_socket.recvfrom(1024)
        
        expected_size = struct.calcsize(PACKET_FORMAT)

        if len(data) != expected_size:
            print(f"⚠️ BOYUT HATASI! Gelen: {len(data)} byte | Beklenen: {expected_size} byte")
            continue

        payload = data[:-4] 
        calculated_crc = zlib.crc32(payload) & 0xFFFFFFFF

        unpacked_data = struct.unpack(PACKET_FORMAT, data)
        
        magic = unpacked_data[0]
        seq_num = unpacked_data[1]
        timestamp = unpacked_data[2]
        uav_id = unpacked_data[3]
        lat = unpacked_data[4] / GPS_SCALE
        lon = unpacked_data[5] / GPS_SCALE
        alt = unpacked_data[6]
        speed = unpacked_data[7]
        batt = unpacked_data[8]
        mode = unpacked_data[9]
        priority = unpacked_data[10]     
        received_crc = unpacked_data[11] 

        if magic not in [0xFF, 0xFE]:
            continue
            
        if calculated_crc != received_crc:
            print(f"☢️ CRC HATA! Seq: {seq_num} | İHA'nın Şifresi: {received_crc} | GKS'nin Hesabı: {calculated_crc}")
            continue

        if priority == 2:
            print(f"📥 [FEC] Kurtarma Paketi Geldi. Havuzda {len(fec_window)} paket var.")
            if len(fec_window) == 2:
                recovered_payload = bytearray(data[:-4])
                for stored_seq in fec_window:
                    stored_data = fec_window[stored_seq]
                    for i in range(len(recovered_payload)):
                        recovered_payload[i] ^= stored_data[i]
                
                rec_seq = struct.unpack('<I', recovered_payload[1:5])[0]
                print(f"🪄 [FEC SİHİRİ] Paket #{rec_seq} HAVADA TAMİR EDİLDİ!")

                if total_lost > 0:
                    total_lost -= 1

                recovered_packets += 1

            fec_window.clear()
            continue

        total_received += 1

        if expected_seq_num == 0:
            expected_seq_num = seq_num + 1
        else:
            if seq_num == expected_seq_num:
                expected_seq_num += 1

            elif seq_num > expected_seq_num:
                lost_count = seq_num - expected_seq_num
                total_lost += lost_count
                print(f"⚠️ DİKKAT: Ağda kopukluk! {lost_count} paket atlandı. (Beklenen: {expected_seq_num}, Gelen: {seq_num})")
                expected_seq_num = seq_num + 1
            
            else:
                if seq_num == 1 or (expected_seq_num - seq_num > 50):
                    print("🔄 SİSTEM MESAJI: İHA'nın yeniden başlatıldığı tespit edildi. Sayaçlar sıfırlanıyor...")
                    expected_seq_num = seq_num + 1
                    total_received = 1
                    total_lost = 0
                    recovered_packets = 0
                
                elif priority == 1:
                    recovered_packets += 1
                    if total_lost > 0:
                        total_lost -= 1
                        print(f"🔄 HARİKA: İHA'nın Araf Hafızası Devrede! Kayıp Paket #{seq_num} Kurtarıldı.")
                else:
                    pass
        
        total_processed = total_received + total_lost
        qos_percentage = (total_received / total_processed) * 100 if total_processed > 100 else 100.0

        prio_str = "🔴 KRİTİK" if priority == 1 else "🟢 AKAN"
        print(f"✅ [{prio_str}] Paket #{seq_num} | 🔋 Pil: %{batt:.1f} | 🛡️ CRC: OK")
        print(f"   📊 QoS: %{qos_percentage:.1f} | Beklenen: {expected_seq_num} | Kayıp: {total_lost} | Kurtarılan: {recovered_packets}\n")

        if priority == 1:
            fec_window[seq_num] = data[:-4]

            ack_packet = struct.pack(ACK_FORMAT, 0xAA, seq_num, timestamp)
            server_socket.sendto(ack_packet, address)

    except Exception as e:
        print(f"Hata: {e}")