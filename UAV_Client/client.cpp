#include <iostream>
#include <cstring>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <cmath>
#include <cstdint>
#include <netdb.h>
#include <map>

#define SERVER_HOSTNAME "sentinel_gks"
#define PORT 5000
#define GPS_SCALE 10000000.0

using namespace std;

#pragma pack(push, 1)
struct TelemetryPacket{
    uint8_t magic_byte;
    uint32_t seq_num;
    uint64_t timestamp;
    int32_t uav_id;
    int32_t latitude;
    int32_t longitude;
    float altitude;
    float speed;
    float battery;
    uint8_t flight_mode;
    uint8_t priorty;
    uint32_t crc32;
};
#pragma pack(pop)

struct AckPacket{
    uint8_t magic_byte;
    uint32_t seq_num;
    uint64_t timestamp;
}__attribute__((packed));

struct UnackedPacket{
    TelemetryPacket pkt;
    uint64_t last_send_time;
    uint32_t current_timeout;
};

uint64_t get_time_ms(){
    struct timeval tv;
    gettimeofday(&tv,NULL);
    return (uint64_t)(tv.tv_sec) * 1000 + (uint64_t)(tv.tv_usec) / 1000;
}

uint32_t calculate_crc32(const unsigned char *data, size_t length){
    uint32_t crc = 0xFFFFFFFF;
    for(size_t i = 0; i < length; i++){
        crc ^= data[i];
        for(int j = 0; j < 8; j++){
            if(crc & 1) crc = (crc >> 1) ^ 0xEDB88320;
            else crc >>= 1;
        }
    }
    return ~crc;
}

class UavLinkManager {
    private:
        int sockfd;
        struct sockaddr_in server_addr;

        std::map<uint32_t, UnackedPacket> unacked_packets;

        uint32_t send_interval;
        uint64_t current_ping;

        TelemetryPacket fec_buffer[3];
        int fec_counter = 0;
    
    public:

        UavLinkManager() : send_interval(1000), current_ping(0) {} 

        uint32_t get_send_interval(){
            return send_interval;
        }

        void init_socket(const char* hostname, int port){
            if((sockfd = socket(AF_INET, SOCK_DGRAM, 0)) < 0){
                perror("Socket Hatası");
                exit(EXIT_FAILURE);
            }

            struct hostent *host = gethostbyname(hostname);
            if(host == nullptr){
                cerr << "Hata: GKS sunucusu (" << hostname << ") bulunamadı! Docker DNS çözülemiyor." << endl;
                exit(EXIT_FAILURE);
            }

            memset(&server_addr, 0, sizeof(server_addr));
            server_addr.sin_family = AF_INET;
            server_addr.sin_port = htons(port);

            memcpy(&server_addr.sin_addr, host->h_addr_list[0],host->h_length);

            struct timeval timeout;
            timeout.tv_sec = 0;
            timeout.tv_usec = 10000;
            setsockopt(sockfd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
        }

        void send_telemetry(TelemetryPacket& packet, bool is_retransmit = false){
            if(!is_retransmit){
                size_t data_length = sizeof(packet) - sizeof(uint32_t);
                packet.crc32 = calculate_crc32((const unsigned char*)&packet, data_length);
            }

            sendto(sockfd, &packet, sizeof(packet), 0, (const struct sockaddr*)&server_addr, sizeof(server_addr));

            string prio_str = (packet.priorty == 1) ? "[🔴 KRİTİK]" : "[🟢 AKAN]";

            if(is_retransmit){
                cout << "   🔁 [YENİDEN GÖNDERİM] " << prio_str << " Paket #" << packet.seq_num 
                     << " (Timeout: " << unacked_packets[packet.seq_num].current_timeout << "ms)" << endl;
            }
            else{
                cout << "📤 " << prio_str << " Paket #" << packet.seq_num << " Gönderildi..." << endl;
            }

            if(packet.priorty == 1 && !is_retransmit){
                unacked_packets[packet.seq_num] = {packet, get_time_ms(), 200};

                fec_buffer[fec_counter] = packet;
                fec_counter++;

                if(fec_counter == 3){
                    generate_and_send_fec();
                    fec_counter = 0;
                }
            }
        }

        void listen_for_acks(){
            struct AckPacket ack;
            socklen_t addr_len = sizeof(server_addr);
            int n = recvfrom(sockfd, &ack, sizeof(ack), 0, (struct sockaddr*)&server_addr, &addr_len);

            if(n > 0 && ack.magic_byte == 0xAA){
                uint64_t now = get_time_ms();
                current_ping = now - ack.timestamp;
                cout << "   ✅ [GKS ONAYI] Paket #" << ack.seq_num << " ulaştı! | 📶 Ping: " << current_ping << " ms" << endl;

                unacked_packets.erase(ack.seq_num);

                if(current_ping > 150){
                    if(send_interval != 2000){
                        cout << "   ⚠️ [AĞ TIKANIKLIĞI] Ping yüksek (" << current_ping << " ms). Veri hızı düşürülüyor!" << endl;
                        send_interval = 2000;
                    }
                }
                else if(current_ping < 50){
                    if(send_interval != 1000){
                        cout << "   ✅ [AĞ RAHATLADI] Ping normal (" << current_ping << " ms). Veri hızı normale döndü!" << endl;
                        send_interval = 1000;
                    }
                }
            }
        }

        void check_retransmissions(){
            uint64_t current_time = get_time_ms();
            for(auto& pair : unacked_packets){
                if(current_time - pair.second.last_send_time >= pair.second.current_timeout){
                    send_telemetry(pair.second.pkt, true);
                    pair.second.last_send_time = current_time;

                    pair.second.current_timeout *= 2;
                    if(pair.second.current_timeout >= 2000){
                        pair.second.current_timeout = 2000;
                    }
                }
            }
        }

        void generate_and_send_fec(){
            TelemetryPacket fec_packet;
            memset(&fec_packet, 0, sizeof(fec_packet));

            uint8_t* p1 = (uint8_t*)&fec_buffer[0];
            uint8_t* p2 = (uint8_t*)&fec_buffer[1];
            uint8_t* p3 = (uint8_t*)&fec_buffer[2];
            uint8_t* pf = (uint8_t*)&fec_packet;

            for(size_t i = 0;i < sizeof(TelemetryPacket) - sizeof(uint32_t); i++){
                pf[i] = p1[i] ^ p2[i] ^ p3[i];
            }
            
            fec_packet.magic_byte = 0xFE;
            fec_packet.priorty = 2;
            fec_packet.seq_num = 0;

            size_t data_length = sizeof(fec_packet) - sizeof(uint32_t);
            fec_packet.crc32 = calculate_crc32((const unsigned char*)&fec_packet, data_length);

            sendto(sockfd, &fec_packet, sizeof(fec_packet),0, (const struct sockaddr*)&server_addr, sizeof(server_addr));
            cout << "🚀 [FEC] Kurtarma Paketi Oluşturuldu ve Gönderildi!" << endl;
        }
};

int main(){
    UavLinkManager link;
    link.init_socket(SERVER_HOSTNAME, PORT);

    TelemetryPacket packet;

    memset(&packet, 0, sizeof(packet));

    packet.magic_byte = 0xFF;
    packet.uav_id = 101;
    packet.battery = 100.0;
    packet.flight_mode = 1;

    float angle = 0.1;
    uint32_t current_seq = 1;

    uint64_t last_send_time = 0;

    cout << "🚁 İHA-1 (C++ Hibrit Sentinel Modu) Başlatıldı..." << endl;

    while(1){
        uint64_t current_time = get_time_ms();

        link.listen_for_acks();

        link.check_retransmissions();

        if(current_time - last_send_time >= link.get_send_interval()){
            packet.latitude = (int32_t)((37.8715 + (0.001 * sin(angle))) * GPS_SCALE);
            packet.longitude = (int32_t)((32.4930 + (0.001 * cos(angle))) * GPS_SCALE);
            packet.altitude = 500 + (10 * sin(angle * 2));
            packet.speed = 80 + (rand() % 10);
            packet.battery -= 2.0;
            if(packet.battery < 0) packet.battery = 0;
            angle += 0.1;
            
            packet.seq_num = current_seq;
            packet.timestamp = current_time;

            if(packet.battery <= 20){
                packet.priorty = 1;
            }
            else{
                packet.priorty = 0;
            }

            link.send_telemetry(packet);

            current_seq++;
            last_send_time = current_time;
        }
        usleep(1000);
    }
    return 0;
}