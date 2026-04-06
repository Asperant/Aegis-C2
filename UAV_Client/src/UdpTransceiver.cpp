#include "UdpTransceiver.hpp"
#include "Logger.hpp"
#include <cstring>
#include <unistd.h>
#include <netdb.h>
#include <sys/time.h>
#include <openssl/rand.h>
#include <openssl/kdf.h>
#include <openssl/err.h>
#include <openssl/core_names.h>
#include <vector>
#include <iostream>

extern uint64_t get_time_ms();

bool UdpTransceiver::has_new_mission() { return new_mission_available; }

std::vector<TargetPoint> UdpTransceiver::pop_mission() {
    new_mission_available = false;
    return pending_mission;
}

UdpTransceiver::UdpTransceiver(int uav_id) : sockfd(-1), my_uav_id(uav_id) {} 
UdpTransceiver::~UdpTransceiver() { if (sockfd >= 0) close(sockfd); }
uint32_t UdpTransceiver::get_send_interval() const { return send_interval; }
bool UdpTransceiver::is_secure() const { return is_handshake_complete; }

void UdpTransceiver::init_socket(int port){
    if((sockfd = socket(AF_INET, SOCK_DGRAM, 0)) < 0) exit(EXIT_FAILURE);
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(port);
    
    const char* gks_host_env = std::getenv("GKS_HOST");
    const char* target_host = gks_host_env ? gks_host_env : SERVER_HOSTNAME;
    
    struct hostent *host = gethostbyname(target_host);
    if(host != nullptr) memcpy(&server_addr.sin_addr, host->h_addr_list[0], host->h_length);
    else { Logger::critical("GKS host DNS resolution failed."); exit(EXIT_FAILURE); }
    
    struct timeval timeout{0, 10000};
    setsockopt(sockfd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
}

bool UdpTransceiver::perform_handshake() {
    Logger::info("Starting zero-trust handshake with GKS.");

    PkeyPtr uav_priv_key = CryptoEngine::load_private_key("../keys/uav_private.pem");
    PkeyPtr gks_pub_key = CryptoEngine::load_public_key("../keys/gks_public.pem");
    if (!uav_priv_key || !gks_pub_key) return false;

    PkeyPtr ephemeral_key = CryptoEngine::generate_ephemeral_key();
    if (!ephemeral_key) { Logger::critical("Failed to generate ephemeral ECDH key."); return false; }

    size_t eph_pub_len = 0;
    EVP_PKEY_get_octet_string_param(ephemeral_key.get(), OSSL_PKEY_PARAM_PUB_KEY, NULL, 0, &eph_pub_len);
    std::array<uint8_t, UNCOMPRESSED_PUBKEY_SIZE> eph_pub_bytes{};
    EVP_PKEY_get_octet_string_param(ephemeral_key.get(), OSSL_PKEY_PARAM_PUB_KEY, eph_pub_bytes.data(), eph_pub_bytes.size(), &eph_pub_len);

    HandshakeRequest req;
    req.uav_id = my_uav_id;
    memcpy(req.ephemeral_pub_key, eph_pub_bytes.data(), UNCOMPRESSED_PUBKEY_SIZE);
    
    MdCtxPtr mdctx(EVP_MD_CTX_new());
    EVP_DigestSignInit(mdctx.get(), NULL, EVP_sha256(), NULL, uav_priv_key.get());
    EVP_DigestSignUpdate(mdctx.get(), &req.uav_id, sizeof(req.uav_id));
    EVP_DigestSignUpdate(mdctx.get(), req.ephemeral_pub_key, UNCOMPRESSED_PUBKEY_SIZE);
    
    size_t sig_len;
    EVP_DigestSignFinal(mdctx.get(), NULL, &sig_len);
    EVP_DigestSignFinal(mdctx.get(), req.signature, &sig_len);
    req.sig_len = static_cast<uint8_t>(sig_len);

    sendto(sockfd, &req, 1 + 4 + UNCOMPRESSED_PUBKEY_SIZE + 1 + sig_len, 0, (struct sockaddr*)&server_addr, sizeof(server_addr));
    
    struct timeval tv{0, 500000};
    setsockopt(sockfd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    
    std::array<uint8_t, 512> resp_buf{};
    socklen_t addr_len = sizeof(server_addr);
    bool found_ee = false;
    uint64_t start_wait = get_time_ms();
    
    while(get_time_ms() - start_wait < 2500) { 
        int n = recvfrom(sockfd, resp_buf.data(), resp_buf.size(), 0, (struct sockaddr*)&server_addr, &addr_len);
        if (n > 0 && resp_buf[0] == static_cast<uint8_t>(PacketMagic::HANDSHAKE_RES)) {
            found_ee = true; break;
        }
    }
    
    tv = {0, 10000};
    setsockopt(sockfd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    if (!found_ee) { Logger::warn("Handshake response not received from GKS."); return false; }

    uint8_t* gks_pub_bytes_recv = resp_buf.data() + 1;
    uint8_t gks_sig_len = resp_buf[66];
    uint8_t* gks_sig = resp_buf.data() + 67;

    MdCtxPtr v_ctx(EVP_MD_CTX_new());
    EVP_DigestVerifyInit(v_ctx.get(), NULL, EVP_sha256(), NULL, gks_pub_key.get());
    EVP_DigestVerifyUpdate(v_ctx.get(), gks_pub_bytes_recv, UNCOMPRESSED_PUBKEY_SIZE);
    if (EVP_DigestVerifyFinal(v_ctx.get(), gks_sig, gks_sig_len) != 1) {
        Logger::critical("GKS signature verification failed; possible spoofing detected.");
        return false;
    }

    OSSL_PARAM params[3];
    params[0] = OSSL_PARAM_construct_utf8_string(OSSL_PKEY_PARAM_GROUP_NAME, (char*)"prime256v1", 0);
    params[1] = OSSL_PARAM_construct_octet_string(OSSL_PKEY_PARAM_PUB_KEY, gks_pub_bytes_recv, UNCOMPRESSED_PUBKEY_SIZE);
    params[2] = OSSL_PARAM_construct_end();
    
    PkeyCtxPtr ctx_p(EVP_PKEY_CTX_new_from_name(NULL, "EC", NULL));
    EVP_PKEY_fromdata_init(ctx_p.get());
    EVP_PKEY *gks_ephemeral_raw = NULL;
    EVP_PKEY_fromdata(ctx_p.get(), &gks_ephemeral_raw, EVP_PKEY_PUBLIC_KEY, params);
    PkeyPtr gks_ephemeral_pkey(gks_ephemeral_raw);

    PkeyCtxPtr ctx(EVP_PKEY_CTX_new(ephemeral_key.get(), NULL));
    EVP_PKEY_derive_init(ctx.get());
    EVP_PKEY_derive_set_peer(ctx.get(), gks_ephemeral_pkey.get());
    
    size_t secret_len;
    EVP_PKEY_derive(ctx.get(), NULL, &secret_len);
    std::vector<uint8_t> shared_secret(secret_len);
    EVP_PKEY_derive(ctx.get(), shared_secret.data(), &secret_len);

    PkeyCtxPtr hkdf_ctx(EVP_PKEY_CTX_new_id(EVP_PKEY_HKDF, NULL));
    EVP_PKEY_derive_init(hkdf_ctx.get());
    EVP_PKEY_CTX_set_hkdf_md(hkdf_ctx.get(), EVP_sha256());
    EVP_PKEY_CTX_set1_hkdf_key(hkdf_ctx.get(), shared_secret.data(), secret_len);
    EVP_PKEY_CTX_add1_hkdf_info(hkdf_ctx.get(), reinterpret_cast<const unsigned char*>("handshake"), 9);
    
    size_t key_len = AES_256_KEY_SIZE;
    EVP_PKEY_derive(hkdf_ctx.get(), session_key.data(), &key_len);

    Logger::success("Zero-trust verification completed. AES-256 session key established.");
    is_handshake_complete = true;
    return true;
}

void UdpTransceiver::initiate_key_rotation() {
    Logger::info("Starting dynamic key rotation (PFS).");
    
    PkeyPtr uav_priv_key = CryptoEngine::load_private_key("../keys/uav_private.pem");
    if (!uav_priv_key) return;

    pending_ephemeral_key = CryptoEngine::generate_ephemeral_key();

    size_t eph_pub_len = 0;
    EVP_PKEY_get_octet_string_param(pending_ephemeral_key.get(), OSSL_PKEY_PARAM_PUB_KEY, NULL, 0, &eph_pub_len);
    std::array<uint8_t, UNCOMPRESSED_PUBKEY_SIZE> eph_pub_bytes{};
    EVP_PKEY_get_octet_string_param(pending_ephemeral_key.get(), OSSL_PKEY_PARAM_PUB_KEY, eph_pub_bytes.data(), eph_pub_bytes.size(), &eph_pub_len);

    HandshakeRequest req;
    req.magic_byte = static_cast<uint8_t>(PacketMagic::REKEY_REQ);
    req.uav_id = my_uav_id;
    memcpy(req.ephemeral_pub_key, eph_pub_bytes.data(), UNCOMPRESSED_PUBKEY_SIZE);
    
    MdCtxPtr mdctx(EVP_MD_CTX_new());
    EVP_DigestSignInit(mdctx.get(), NULL, EVP_sha256(), NULL, uav_priv_key.get());
    EVP_DigestSignUpdate(mdctx.get(), &req.uav_id, sizeof(req.uav_id));
    EVP_DigestSignUpdate(mdctx.get(), req.ephemeral_pub_key, UNCOMPRESSED_PUBKEY_SIZE);
    
    size_t sig_len;
    EVP_DigestSignFinal(mdctx.get(), NULL, &sig_len);
    EVP_DigestSignFinal(mdctx.get(), req.signature, &sig_len);
    req.sig_len = static_cast<uint8_t>(sig_len);

    sendto(sockfd, &req, 1 + 4 + UNCOMPRESSED_PUBKEY_SIZE + 1 + sig_len, 0, (struct sockaddr*)&server_addr, sizeof(server_addr));
}

bool UdpTransceiver::encrypt_data(const PlaintextTelemetry& plain_data, EncryptedPacket& enc_pkt, uint8_t magic) {
    enc_pkt.magic_byte = magic;
    enc_pkt.uav_id = my_uav_id;
    RAND_bytes(enc_pkt.iv, AES_GCM_IV_SIZE);

    CipherCtxPtr ctx(EVP_CIPHER_CTX_new());
    int len;

    EVP_EncryptInit_ex(ctx.get(), EVP_aes_256_gcm(), NULL, NULL, NULL);
    EVP_EncryptInit_ex(ctx.get(), NULL, NULL, session_key.data(), enc_pkt.iv);

    int outlen;
    EVP_EncryptUpdate(ctx.get(), NULL, &outlen, (const unsigned char*)&enc_pkt.uav_id, sizeof(enc_pkt.uav_id));
    EVP_EncryptUpdate(ctx.get(), enc_pkt.ciphertext, &len, (const unsigned char*)&plain_data, sizeof(PlaintextTelemetry));
    EVP_EncryptFinal_ex(ctx.get(), enc_pkt.ciphertext + len, &len);
    EVP_CIPHER_CTX_ctrl(ctx.get(), EVP_CTRL_GCM_GET_TAG, AES_GCM_TAG_SIZE, enc_pkt.auth_tag);
    
    return true;
}

void UdpTransceiver::send_telemetry(PlaintextTelemetry& packet){
    if(!is_handshake_complete) return;

    EncryptedPacket secure_pkt{};
    if (!encrypt_data(packet, secure_pkt, static_cast<uint8_t>(PacketMagic::TELEMETRY))) return;

    sendto(sockfd, &secure_pkt, sizeof(secure_pkt), 0, (struct sockaddr*)&server_addr, sizeof(server_addr));

    std::string prio_str = (packet.priority == 1) ? "[PRIORITY:CRITICAL]" : "[PRIORITY:NORMAL]";
    std::cout << "[TX] " << prio_str << " Packet #" << packet.seq_num << " encrypted telemetry sent." << std::endl;
    unacked_packets[packet.seq_num] = {packet, get_time_ms(), 500, 0};

    packets_sent_since_rekey++;
    if (packets_sent_since_rekey >= REKEY_PACKET_THRESHOLD) {
        initiate_key_rotation();
        packets_sent_since_rekey = 0;
    }

    if(packet.priority == 1 && packet.seq_num > last_fec_seq){
        fec_buffer[fec_counter] = packet;
        fec_counter++;
        last_fec_seq = packet.seq_num;
        if(fec_counter == FEC_BUFFER_SIZE){
            generate_and_send_fec();
            fec_counter = 0;
        }
    }
}

void UdpTransceiver::generate_and_send_fec(){
    PlaintextTelemetry plain_fec{};
    uint8_t* p1 = reinterpret_cast<uint8_t*>(&fec_buffer[0]);
    uint8_t* p2 = reinterpret_cast<uint8_t*>(&fec_buffer[1]);
    uint8_t* p3 = reinterpret_cast<uint8_t*>(&fec_buffer[2]);
    uint8_t* pf = reinterpret_cast<uint8_t*>(&plain_fec);

    for(size_t i = 0; i < sizeof(PlaintextTelemetry); i++){
        pf[i] = p1[i] ^ p2[i] ^ p3[i];
    }
    
    EncryptedPacket secure_fec{};
    if(encrypt_data(plain_fec, secure_fec, static_cast<uint8_t>(PacketMagic::FEC_RECOVERY))) {
        sendto(sockfd, &secure_fec, sizeof(secure_fec), 0, (struct sockaddr*)&server_addr, sizeof(server_addr));
        Logger::info("[FEC] Encrypted recovery packet sent.");
    }
}

void UdpTransceiver::listen_for_acks(){
    if(!is_handshake_complete) return;

    std::array<uint8_t, 512> buffer{};
    socklen_t addr_len = sizeof(server_addr);
    int n = recvfrom(sockfd, buffer.data(), buffer.size(), 0, (struct sockaddr*)&server_addr, &addr_len);

    if(n > 0){
        if(buffer[0] == 0xBB){
            Logger::warn("[SESSION] GKS session reset detected; handshake will be re-established.");
            is_handshake_complete = false;
            return;
        }

        if(buffer[0] == static_cast<uint8_t>(PacketMagic::REKEY_RES) && pending_ephemeral_key != nullptr){
            PkeyPtr gks_pub_key = CryptoEngine::load_public_key("../keys/gks_public.pem");

            uint8_t* gks_pub_bytes = buffer.data() + 1;
            uint8_t gks_sig_len = buffer[66];
            uint8_t* gks_sig = buffer.data() + 67;

            MdCtxPtr v_ctx(EVP_MD_CTX_new());
            EVP_DigestVerifyInit(v_ctx.get(), NULL, EVP_sha256(), NULL, gks_pub_key.get());
            EVP_DigestVerifyUpdate(v_ctx.get(), gks_pub_bytes, UNCOMPRESSED_PUBKEY_SIZE);
            
            if (EVP_DigestVerifyFinal(v_ctx.get(), gks_sig, gks_sig_len) == 1) {
                OSSL_PARAM params[3];
                params[0] = OSSL_PARAM_construct_utf8_string(OSSL_PKEY_PARAM_GROUP_NAME, (char*)"prime256v1", 0);
                params[1] = OSSL_PARAM_construct_octet_string(OSSL_PKEY_PARAM_PUB_KEY, gks_pub_bytes, UNCOMPRESSED_PUBKEY_SIZE);
                params[2] = OSSL_PARAM_construct_end();
                
                PkeyCtxPtr ctx_p(EVP_PKEY_CTX_new_from_name(NULL, "EC", NULL));
                EVP_PKEY_fromdata_init(ctx_p.get());
                EVP_PKEY *gks_ephem_raw = NULL;
                EVP_PKEY_fromdata(ctx_p.get(), &gks_ephem_raw, EVP_PKEY_PUBLIC_KEY, params);
                PkeyPtr gks_ephemeral_pkey(gks_ephem_raw);

                PkeyCtxPtr ctx(EVP_PKEY_CTX_new(pending_ephemeral_key.get(), NULL));
                EVP_PKEY_derive_init(ctx.get());
                EVP_PKEY_derive_set_peer(ctx.get(), gks_ephemeral_pkey.get());
                
                size_t secret_len;
                EVP_PKEY_derive(ctx.get(), NULL, &secret_len);
                std::vector<uint8_t> shared_secret(secret_len);
                EVP_PKEY_derive(ctx.get(), shared_secret.data(), &secret_len);

                PkeyCtxPtr hkdf_ctx(EVP_PKEY_CTX_new_id(EVP_PKEY_HKDF, NULL));
                EVP_PKEY_derive_init(hkdf_ctx.get());
                EVP_PKEY_CTX_set_hkdf_md(hkdf_ctx.get(), EVP_sha256());
                EVP_PKEY_CTX_set1_hkdf_key(hkdf_ctx.get(), shared_secret.data(), secret_len);
                EVP_PKEY_CTX_add1_hkdf_info(hkdf_ctx.get(), reinterpret_cast<const unsigned char*>("handshake"), 9);
                
                size_t key_len = AES_256_KEY_SIZE;
                EVP_PKEY_derive(hkdf_ctx.get(), session_key.data(), &key_len);
                
                Logger::success("[KEY ROTATION] Make-before-break completed. Switched to the new AES-256 session key.");
            } else {
                Logger::warn("[KEY ROTATION] GKS signature verification failed. Continuing with the previous key.");
            }
            pending_ephemeral_key.reset();
            return;
        }

        if(buffer[0] == static_cast<uint8_t>(PacketMagic::ACKNOWLEDGE)){
            AckPacket* ack = reinterpret_cast<AckPacket*>(buffer.data());
            current_ping = get_time_ms() - ack->timestamp;
            std::cout << "   [ACK] Packet #" << ack->seq_num << " | Ping: " << current_ping << " ms" << std::endl;
            unacked_packets.erase(ack->seq_num);
            return;
        }

        if(buffer[0] == 0x1A) { // PacketMagic::MISSION_UPLOAD
            if (n > 1 + 4 + 12 + 16) {
                uint8_t* uav_id_ptr = buffer.data() + 1;
                uint8_t* iv = buffer.data() + 5;
                size_t ct_len = n - 1 - 4 - 12 - 16;
                uint8_t* ciphertext = buffer.data() + 17;
                uint8_t* tag = buffer.data() + 17 + ct_len;

                CipherCtxPtr ctx(EVP_CIPHER_CTX_new());
                EVP_DecryptInit_ex(ctx.get(), EVP_aes_256_gcm(), NULL, NULL, NULL);
                EVP_DecryptInit_ex(ctx.get(), NULL, NULL, session_key.data(), iv);
                
                int len;
                EVP_DecryptUpdate(ctx.get(), NULL, &len, uav_id_ptr, 4); // AAD

                std::vector<uint8_t> pt(ct_len);
                EVP_DecryptUpdate(ctx.get(), pt.data(), &len, ciphertext, ct_len);
                
                int plain_len = len;
                EVP_CIPHER_CTX_ctrl(ctx.get(), EVP_CTRL_GCM_SET_TAG, 16, tag);
                std::vector<uint8_t> final_buf(16);
                int final_len = 0;
                if (EVP_DecryptFinal_ex(ctx.get(), final_buf.data(), &final_len) > 0) {
                    if (final_len > 0) {
                        pt.insert(pt.end(), final_buf.begin(), final_buf.begin() + final_len);
                    }
                    plain_len += final_len;
                    uint32_t num_points = pt[0];
                    if (plain_len == static_cast<int>(1 + num_points * 8)) {
                        pending_mission.clear();
                        float* floats = reinterpret_cast<float*>(pt.data() + 1);
                        for (uint32_t i = 0; i < num_points; i++) {
                            pending_mission.push_back({floats[i*2], floats[i*2+1]});
                        }
                        new_mission_available = true;
                        Logger::success("Mission received: " + std::to_string(num_points) + " waypoints.");
                    }
                } else {
                    Logger::warn("Mission packet decryption/authentication failed.");
                }
            }
        }
        
        if(buffer[0] == 0x1B) { // PacketMagic::TACTICAL_CMD
            if (n > 1 + 4 + 12 + 16) {
                uint8_t* uav_id_ptr = buffer.data() + 1;
                uint8_t* iv = buffer.data() + 5;
                size_t ct_len = n - 1 - 4 - 12 - 16;
                uint8_t* ciphertext = buffer.data() + 17;
                uint8_t* tag = buffer.data() + 17 + ct_len;

                CipherCtxPtr ctx(EVP_CIPHER_CTX_new());
                EVP_DecryptInit_ex(ctx.get(), EVP_aes_256_gcm(), NULL, NULL, NULL);
                EVP_DecryptInit_ex(ctx.get(), NULL, NULL, session_key.data(), iv);
                
                int len;
                EVP_DecryptUpdate(ctx.get(), NULL, &len, uav_id_ptr, 4); // AAD

                std::vector<uint8_t> pt(ct_len);
                EVP_DecryptUpdate(ctx.get(), pt.data(), &len, ciphertext, ct_len);
                
                int plain_len = len;
                EVP_CIPHER_CTX_ctrl(ctx.get(), EVP_CTRL_GCM_SET_TAG, 16, tag);
                std::vector<uint8_t> final_buf(16);
                int final_len = 0;
                if (EVP_DecryptFinal_ex(ctx.get(), final_buf.data(), &final_len) > 0) {
                    if (final_len > 0) {
                        pt.insert(pt.end(), final_buf.begin(), final_buf.begin() + final_len);
                    }
                    plain_len += final_len;
                    if (plain_len >= 4) {
                        int cmd_id = *reinterpret_cast<int*>(pt.data());
                        
                        // HANDOVER (ID=12) -> <i (4 bytes id) + H (2 bytes port) + B (1 byte len) + N bytes IP
                        if (cmd_id == 12 && plain_len >= 7) {
                            uint16_t port = *reinterpret_cast<uint16_t*>(pt.data() + 4);
                            uint8_t ip_len = pt.data()[6];
                            if (plain_len == 7 + ip_len) {
                                std::string target_ip(reinterpret_cast<char*>(pt.data() + 7), ip_len);
                                Logger::critical("[HANDOVER] Transfer command received. Target: " + target_ip + ":" + std::to_string(port));

                                const char* current_host_env = std::getenv("GKS_HOST");
                                std::string previous_host = current_host_env ? std::string(current_host_env) : std::string(SERVER_HOSTNAME);
                                uint16_t previous_port = ntohs(server_addr.sin_port);

                                // Close old socket
                                if (sockfd >= 0) close(sockfd);
                                is_handshake_complete = false;
                                
                                // Reset DNS env logic
                                setenv("GKS_HOST", target_ip.c_str(), 1);
                                
                                // Re-init socket and perform new Handshake
                                init_socket(port);
                                if (!perform_handshake()) {
                                    Logger::warn("[HANDOVER] New GKS validation failed. Reverting to previous GKS.");

                                    if (sockfd >= 0) close(sockfd);
                                    is_handshake_complete = false;
                                    setenv("GKS_HOST", previous_host.c_str(), 1);
                                    init_socket(previous_port);

                                    if (!perform_handshake()) {
                                        Logger::critical("[HANDOVER] Validation failed for both new and previous GKS. UAV link lost.");
                                    } else {
                                        Logger::success("[HANDOVER] Previous GKS connection restored.");
                                    }
                                } else {
                                    Logger::success("[HANDOVER] Switched to new GKS and re-established AES-256 session.");
                                }
                            } else {
                                Logger::warn("Invalid HANDOVER packet length.");
                            }
                        }
                        else if (plain_len == 20) {
                            TacticalCmd cmd;
                            cmd.id = cmd_id;
                            cmd.lat = *reinterpret_cast<double*>(pt.data() + 4);
                            cmd.lon = *reinterpret_cast<double*>(pt.data() + 12);
                            pending_tactical_cmds.push(cmd);
                            Logger::success("Targeted tactical command received (ID: " + std::to_string(cmd.id) + ").");
                        } else if (plain_len == 4) {
                            TacticalCmd cmd;
                            cmd.id = cmd_id;
                            cmd.lat = 0.0;
                            cmd.lon = 0.0;
                            pending_tactical_cmds.push(cmd);
                            Logger::success("Tactical command received (ID: " + std::to_string(cmd.id) + ").");
                        }
                    } else {
                        Logger::warn("Invalid tactical command payload size.");
                    }
                }
            }
        }
    }
}

bool UdpTransceiver::has_tactical_command() {
    return !pending_tactical_cmds.empty();
}

TacticalCmd UdpTransceiver::pop_tactical_command() {
    TacticalCmd cmd = pending_tactical_cmds.front();
    pending_tactical_cmds.pop();
    return cmd;
}
