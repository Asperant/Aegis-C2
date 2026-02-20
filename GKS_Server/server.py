import socket
import struct

HOST = "0.0.0.0"
PORT = 5000
GPS_SCALE = 10000000.0

PACKET_FORMAT = '<BiiifffB'

MODES = {0:"Manuel",1:"Otonom",2:"Eve Dönüş"}

server_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
server_socket.bind((HOST,PORT))

print(f"GKS(Binary Mod) Dinlemeye Başladı {HOST}:{PORT}")

while True:
    try:
        data,address = server_socket.recvfrom(1024)
        expected_size = struct.calcsize(PACKET_FORMAT)

        if len(data) != expected_size:
            print(f"⚠️ Hatalı Paket Boyutu! Gelen: {len(data)}, Beklenen: {expected_size}")
            continue
        
        unpacked_data = struct.unpack(PACKET_FORMAT,data)

        magic = unpacked_data[0]
        uav_id = unpacked_data[1]

        lat = unpacked_data[2] / GPS_SCALE
        lon = unpacked_data[3] / GPS_SCALE

        alt = unpacked_data[4]
        speed = unpacked_data[5]
        batt = unpacked_data[6]
        mode = unpacked_data[7]

        if magic != 0xFF:
            print(f"⛔ GEÇERSİZ İMZA! Magic Byte: {magic}")
            continue

        mode_str = MODES.get(mode,"BİLİNMİYOR")
        print(f"✅ [İHA-{uav_id}] {mode_str} | 📍 GPS: {lat:.4f}, {lon:.4f} | 🏔️ İrtifa: {alt:.1f}m | 🔋 %{batt:.1f}")

    except Exception as e:
        print(f"Bir Hata oluştu: {e}")