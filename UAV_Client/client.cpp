#include <iostream>
#include <cstring>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <cmath>
#include <cstdint>
#include <netdb.h>
#include <map>
#include <cstdlib>
#include <chrono>
#include <array>
#include <iomanip>

using namespace std;

constexpr char SERVER_HOSTNAME[] = "sentinel_gks";
constexpr int PORT = 5000;
constexpr double GPS_SCALE = 10000000.0;
constexpr double EARTH_RADIUS_KM = 6371.0;
constexpr double DEGREE_TO_METER = 111000.0;

enum class PacketMagic : uint8_t {
    TELEMETRY = 0xFF,
    FEC_RECOVERY = 0xFE,
    ACKNOWLEDGE = 0xAA
};

enum class PriorityLevel : uint8_t {
    NORMAL = 0,
    CRITICAL = 1,
    FEC_PACKET = 2
};

enum class FlightMode : uint8_t {
    MANUAL = 0,
    AUTONOMOUS = 1,
    RTL = 2 
};

#pragma pack(push, 1)
struct TelemetryPacket {
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
    uint8_t priority;
    uint32_t crc32;
};
#pragma pack(pop)

struct AckPacket {
    uint8_t magic_byte;
    uint32_t seq_num;
    uint64_t timestamp;
} __attribute__((packed));

struct UnackedPacket {
    TelemetryPacket pkt;
    uint64_t last_send_time;
    uint32_t current_timeout;
    uint8_t retry_count; 
};

double to_rad(double degree) { return degree * M_PI / 180.0; }

double calculate_distance(double lat1, double lon1, double lat2, double lon2) {
    double dLat = to_rad(lat2 - lat1);
    double dLon = to_rad(lon2 - lon1);
    double a = sin(dLat/2)*sin(dLat/2) + cos(to_rad(lat1))*cos(to_rad(lat2))*sin(dLon/2)*sin(dLon/2);
    double c = 2 * atan2(sqrt(a), sqrt(1-a));
    return EARTH_RADIUS_KM * c;
}

uint64_t get_time_ms() {
    using namespace std::chrono;
    return duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count();
}

uint32_t calculate_crc32(const unsigned char *data, size_t length) {
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
        
        std::array<TelemetryPacket, 3> fec_buffer{}; 
        int fec_counter = 0;
    
    public:
        UavLinkManager() : send_interval(1000), current_ping(0), sockfd(-1) {} 

        ~UavLinkManager() {
            if (sockfd >= 0) {
                close(sockfd);
                cout << "🔌 [İHA] Soket güvenli bir şekilde kapatıldı (RAII)." << endl;
            }
        }

        uint32_t get_send_interval() const { return send_interval; }

        bool resolve_new_gks() {
            struct hostent *host = gethostbyname(SERVER_HOSTNAME);
            if(host != nullptr){
                memcpy(&server_addr.sin_addr, host->h_addr_list[0], host->h_length);
                return true;
            }
            return false;
        }

        void init_socket(int port){
            if((sockfd = socket(AF_INET, SOCK_DGRAM, 0)) < 0){
                perror("Socket Hatası");
                exit(EXIT_FAILURE);
            }

            memset(&server_addr, 0, sizeof(server_addr));
            server_addr.sin_family = AF_INET;
            server_addr.sin_port = htons(port);

            if (!resolve_new_gks()) {
                cerr << "Hata: GKS sunucusu bulunamadı! Docker DNS çözülemiyor." << endl;
                exit(EXIT_FAILURE);
            }

            struct timeval timeout{0, 10000};
            setsockopt(sockfd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
        }

        void send_telemetry(TelemetryPacket& packet, bool is_retransmit = false){
            if(!is_retransmit){
                size_t data_length = sizeof(packet) - sizeof(uint32_t);
                packet.crc32 = calculate_crc32(reinterpret_cast<const unsigned char*>(&packet), data_length);
            }

            sendto(sockfd, &packet, sizeof(packet), 0, reinterpret_cast<const struct sockaddr*>(&server_addr), sizeof(server_addr));

            string prio_str = (packet.priority == static_cast<uint8_t>(PriorityLevel::CRITICAL)) ? "[🔴 KRİTİK]" : "[🟢 AKAN]";

            if(is_retransmit){
                cout << "   🔁 [YENİDEN GÖNDERİM] " << prio_str << " Paket #" << packet.seq_num 
                     << " (Timeout: " << unacked_packets[packet.seq_num].current_timeout << "ms)" << endl;
            } else {
                cout << "📤 " << prio_str << " Paket #" << packet.seq_num << " Gönderildi..." << endl;
                
                unacked_packets[packet.seq_num] = {packet, get_time_ms(), 500, 0};

                if(packet.priority == static_cast<uint8_t>(PriorityLevel::CRITICAL)){
                    fec_buffer[fec_counter] = packet;
                    fec_counter++;
                    if(fec_counter == 3){
                        generate_and_send_fec();
                        fec_counter = 0;
                    }
                }
            }
        }

        void listen_for_acks(){
            struct AckPacket ack;
            socklen_t addr_len = sizeof(server_addr);
            int n = recvfrom(sockfd, &ack, sizeof(ack), 0, reinterpret_cast<struct sockaddr*>(&server_addr), &addr_len);

            if(n > 0 && ack.magic_byte == static_cast<uint8_t>(PacketMagic::ACKNOWLEDGE)){
                uint64_t now = get_time_ms();
                current_ping = now - ack.timestamp;
                cout << "   ✅ [GKS ONAYI] Paket #" << ack.seq_num << " ulaştı! | 📶 Ping: " << current_ping << " ms" << endl;

                unacked_packets.erase(ack.seq_num);

                if(current_ping > 150 && send_interval != 2000){
                    cout << "   ⚠️ [AĞ TIKANIKLIĞI] Ping yüksek (" << current_ping << " ms). Veri hızı düşürülüyor!" << endl;
                    send_interval = 2000;
                } else if(current_ping < 50 && send_interval != 1000){
                    cout << "   ✅ [AĞ RAHATLADI] Ping normal (" << current_ping << " ms). Veri hızı normale döndü!" << endl;
                    send_interval = 1000;
                }
            }
        }

        void check_retransmissions(){
            uint64_t current_time = get_time_ms();
            for(auto& pair : unacked_packets){
                if(current_time - pair.second.last_send_time >= pair.second.current_timeout){
                    
                    pair.second.retry_count++;
                    if(pair.second.retry_count >= 3) {
                        cout << "🔄 [İHA-" << pair.second.pkt.uav_id << "] BAĞLANTI KOPTU! Eski istasyon ölü, yeni hedef aranıyor..." << endl;
                        if(resolve_new_gks()) {
                            cout << "✅ [İHA-" << pair.second.pkt.uav_id << "] Yeni İstasyon Kilitlendi -> IP: " << inet_ntoa(server_addr.sin_addr) << endl;
                            pair.second.retry_count = 0; 
                            pair.second.current_timeout = 500;
                        }
                    }

                    send_telemetry(pair.second.pkt, true);
                    pair.second.last_send_time = current_time;
                    pair.second.current_timeout = std::min(pair.second.current_timeout * 2, 2000u); // YENİ: Temiz kod
                }
            }
        }

        void generate_and_send_fec(){
            TelemetryPacket fec_packet{};
            
            uint8_t* p1 = reinterpret_cast<uint8_t*>(&fec_buffer[0]);
            uint8_t* p2 = reinterpret_cast<uint8_t*>(&fec_buffer[1]);
            uint8_t* p3 = reinterpret_cast<uint8_t*>(&fec_buffer[2]);
            uint8_t* pf = reinterpret_cast<uint8_t*>(&fec_packet);

            for(size_t i = 0; i < sizeof(TelemetryPacket) - sizeof(uint32_t); i++){
                pf[i] = p1[i] ^ p2[i] ^ p3[i];
            }
            
            fec_packet.magic_byte = static_cast<uint8_t>(PacketMagic::FEC_RECOVERY);
            fec_packet.priority = static_cast<uint8_t>(PriorityLevel::FEC_PACKET);
            fec_packet.seq_num = 0;

            size_t data_length = sizeof(fec_packet) - sizeof(uint32_t);
            fec_packet.crc32 = calculate_crc32(reinterpret_cast<const unsigned char*>(&fec_packet), data_length);

            sendto(sockfd, &fec_packet, sizeof(fec_packet), 0, reinterpret_cast<const struct sockaddr*>(&server_addr), sizeof(server_addr));
            cout << "🚀 [FEC] Kurtarma Paketi Oluşturuldu ve Gönderildi!" << endl;
        }
};

int main(){
    UavLinkManager link;
    link.init_socket(PORT);

    srand(time(nullptr) ^ clock());
    int my_uav_id = 100 + (rand() % 900);
    if(getenv("UAV_ID")) my_uav_id = atoi(getenv("UAV_ID"));

    TelemetryPacket packet{};
    packet.magic_byte = static_cast<uint8_t>(PacketMagic::TELEMETRY);
    packet.uav_id = my_uav_id;
    packet.battery = 100.0f;
    packet.flight_mode = static_cast<uint8_t>(FlightMode::AUTONOMOUS);
    packet.speed = 25.0f;

    double current_lat = 37.8000, current_lon = 32.4000;
    const double target_lat = 39.9208, target_lon = 32.8541;
    const double gks_lat = 37.8715, gks_lon = 32.4930;

    uint32_t current_seq = 1;
    uint64_t last_send_time = 0;

    cout << "🚁 İHA-" << my_uav_id << " (Otonom Navigasyon Modu) Başlatıldı..." << endl;

    while(true){
        uint64_t current_time = get_time_ms();

        link.listen_for_acks();
        link.check_retransmissions();

        if(current_time - last_send_time >= link.get_send_interval()){
            
            double dLat = target_lat - current_lat;
            double dLon = target_lon - current_lon;
            double dist_to_target = sqrt(dLat*dLat + dLon*dLon);

            if(dist_to_target > 0.0001){
                double delta_t = link.get_send_interval() / 1000.0;
                double move_deg = (packet.speed * delta_t) / DEGREE_TO_METER;

                if(move_deg > dist_to_target) move_deg = dist_to_target;

                current_lat += (dLat / dist_to_target) * move_deg;
                current_lon += (dLon / dist_to_target) * move_deg;
            }

            double distance_to_gks = calculate_distance(current_lat, current_lon, gks_lat, gks_lon);
            
            cout << fixed << setprecision(2);
            cout << "   📍 GKS'ye Uzaklık: " << distance_to_gks << " km | Kalan Batarya: %" << packet.battery << endl;

            packet.latitude = static_cast<int32_t>(current_lat * GPS_SCALE);
            packet.longitude = static_cast<int32_t>(current_lon * GPS_SCALE);
            packet.altitude = 500.0f;
            
            packet.battery -= 25.0f;
            if(packet.battery < 0.0f) packet.battery = 0.0f;

            packet.seq_num = current_seq;
            packet.timestamp = current_time;
            
            packet.priority = (packet.battery <= 20.0f) ? 
                              static_cast<uint8_t>(PriorityLevel::CRITICAL) : 
                              static_cast<uint8_t>(PriorityLevel::NORMAL);

            link.send_telemetry(packet);

            current_seq++;
            last_send_time = current_time;
        }
        usleep(1000);
    }
    return 0;
}