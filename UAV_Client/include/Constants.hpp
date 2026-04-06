#ifndef CONSTANTS_HPP
#define CONSTANTS_HPP

#include <cstdint>
#include <cstddef>

constexpr char SERVER_HOSTNAME[] = "aegis_gks"; // Or localhost or ip
constexpr int PORT = 5000;
constexpr double GPS_SCALE = 10000000.0;
constexpr double DEGREE_TO_METER = 111000.0;

constexpr size_t UNCOMPRESSED_PUBKEY_SIZE = 65;
constexpr size_t SIGNATURE_MAX_SIZE = 72;
constexpr size_t AES_256_KEY_SIZE = 32;
constexpr size_t AES_GCM_IV_SIZE = 12;
constexpr size_t AES_GCM_TAG_SIZE = 16;
constexpr size_t REKEY_PACKET_THRESHOLD = 100;
constexpr size_t FEC_BUFFER_SIZE = 3;

#endif // CONSTANTS_HPP
