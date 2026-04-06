#ifndef UDP_TRANSCEIVER_HPP
#define UDP_TRANSCEIVER_HPP

#include "Packets.hpp"
#include "CryptoEngine.hpp"
#include "TelemetrySensor.hpp"
#include <map>
#include <array>
#include <queue>
#include <arpa/inet.h>
#include <sys/socket.h>

class UdpTransceiver {
private:
    int sockfd;
    struct sockaddr_in server_addr;
    std::map<uint32_t, UnackedPacket> unacked_packets;
    uint32_t send_interval = 1000;
    uint64_t current_ping = 0;
    int my_uav_id;
    
    std::array<uint8_t, AES_256_KEY_SIZE> session_key{}; 
    bool is_handshake_complete = false;

    std::array<PlaintextTelemetry, FEC_BUFFER_SIZE> fec_buffer{}; 
    int fec_counter = 0;
    uint32_t last_fec_seq = 0;

    PkeyPtr pending_ephemeral_key = nullptr;
    uint32_t packets_sent_since_rekey = 0;

    bool encrypt_data(const PlaintextTelemetry& plain_data, EncryptedPacket& enc_pkt, uint8_t magic);
    void generate_and_send_fec();

public:
    UdpTransceiver(int uav_id);
    ~UdpTransceiver();
    uint32_t get_send_interval() const;
    bool is_secure() const;
    void init_socket(int port);
    bool perform_handshake();
    void initiate_key_rotation();
    void send_telemetry(PlaintextTelemetry& packet);
    void listen_for_acks();

    bool has_new_mission();
    std::vector<TargetPoint> pop_mission();
    
    bool has_tactical_command();
    TacticalCmd pop_tactical_command();
    
private:
    std::vector<TargetPoint> pending_mission;
    bool new_mission_available = false;
    std::queue<TacticalCmd> pending_tactical_cmds;
};

#endif // UDP_TRANSCEIVER_HPP
