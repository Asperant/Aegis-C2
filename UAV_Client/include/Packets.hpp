#ifndef PACKETS_HPP
#define PACKETS_HPP

#include <cstdint>
#include "Constants.hpp"

enum class PacketMagic : uint8_t {
    HANDSHAKE_REQ = 0xDD, HANDSHAKE_RES = 0xEE, TELEMETRY = 0xFF,
    FEC_RECOVERY = 0xFE, ACKNOWLEDGE = 0xAA, REKEY_REQ = 0xCC, REKEY_RES = 0xCB
};

enum class PriorityLevel : uint8_t { NORMAL = 0, CRITICAL = 1, FEC_PACKET = 2 };
enum class FlightMode : uint8_t { MANUAL = 0, AUTONOMOUS = 1, RTL = 2 };

#pragma pack(push, 1)
struct PlaintextTelemetry {
    uint32_t seq_num; uint64_t timestamp; int32_t latitude; int32_t longitude;
    float altitude; float speed; float battery; uint8_t flight_mode; uint8_t priority;
};

struct TacticalCmd {
    int id;
    double lat;
    double lon;
};

struct EncryptedPacket {
    uint8_t magic_byte; int32_t uav_id; 
    uint8_t iv[AES_GCM_IV_SIZE];
    uint8_t ciphertext[sizeof(PlaintextTelemetry)]; 
    uint8_t auth_tag[AES_GCM_TAG_SIZE];
};

struct HandshakeRequest {
    uint8_t magic_byte = static_cast<uint8_t>(PacketMagic::HANDSHAKE_REQ); 
    int32_t uav_id; 
    uint8_t ephemeral_pub_key[UNCOMPRESSED_PUBKEY_SIZE];
    uint8_t sig_len; 
    uint8_t signature[SIGNATURE_MAX_SIZE];
};

struct AckPacket {
    uint8_t magic_byte; uint32_t seq_num; uint64_t timestamp;
};
#pragma pack(pop)

struct UnackedPacket {
    PlaintextTelemetry pkt; uint64_t last_send_time; uint32_t current_timeout; uint8_t retry_count; 
};

#endif // PACKETS_HPP
