#include "CryptoEngine.hpp"
#include "Logger.hpp"
#include <openssl/ec.h>
#include <openssl/pem.h>

void EvpPkeyCtxDeleter::operator()(EVP_PKEY_CTX* ctx) const { if (ctx) EVP_PKEY_CTX_free(ctx); }
void EvpPkeyDeleter::operator()(EVP_PKEY* pkey) const { if (pkey) EVP_PKEY_free(pkey); }
void EvpMdCtxDeleter::operator()(EVP_MD_CTX* ctx) const { if (ctx) EVP_MD_CTX_free(ctx); }
void EvpCipherCtxDeleter::operator()(EVP_CIPHER_CTX* ctx) const { if (ctx) EVP_CIPHER_CTX_free(ctx); }
void FileDeleter::operator()(FILE* f) const { if (f) fclose(f); }

PkeyPtr CryptoEngine::load_private_key(const std::string& path) {
    FilePtr fp(fopen(path.c_str(), "r"));
    if (!fp) { Logger::error("Private key file not found: " + path); return nullptr; }
    return PkeyPtr(PEM_read_PrivateKey(fp.get(), NULL, NULL, NULL));
}

PkeyPtr CryptoEngine::load_public_key(const std::string& path) {
    FilePtr fp(fopen(path.c_str(), "r"));
    if (!fp) { Logger::error("Public key file not found: " + path); return nullptr; }
    return PkeyPtr(PEM_read_PUBKEY(fp.get(), NULL, NULL, NULL));
}

PkeyPtr CryptoEngine::generate_ephemeral_key() {
    PkeyCtxPtr pctx(EVP_PKEY_CTX_new_id(EVP_PKEY_EC, NULL));
    EVP_PKEY_keygen_init(pctx.get());
    EVP_PKEY_CTX_set_ec_paramgen_curve_nid(pctx.get(), NID_X9_62_prime256v1);
    EVP_PKEY *raw_key = nullptr;
    if(EVP_PKEY_keygen(pctx.get(), &raw_key) <= 0) return nullptr;
    return PkeyPtr(raw_key);
}
