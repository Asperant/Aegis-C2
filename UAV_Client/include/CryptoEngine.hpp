#ifndef CRYPTO_ENGINE_HPP
#define CRYPTO_ENGINE_HPP

#include <memory>
#include <string>
#include <openssl/evp.h>

struct EvpPkeyCtxDeleter { void operator()(EVP_PKEY_CTX* ctx) const; };
struct EvpPkeyDeleter { void operator()(EVP_PKEY* pkey) const; };
struct EvpMdCtxDeleter { void operator()(EVP_MD_CTX* ctx) const; };
struct EvpCipherCtxDeleter { void operator()(EVP_CIPHER_CTX* ctx) const; };
struct FileDeleter { void operator()(FILE* f) const; };

using PkeyCtxPtr = std::unique_ptr<EVP_PKEY_CTX, EvpPkeyCtxDeleter>;
using PkeyPtr = std::unique_ptr<EVP_PKEY, EvpPkeyDeleter>;
using MdCtxPtr = std::unique_ptr<EVP_MD_CTX, EvpMdCtxDeleter>;
using CipherCtxPtr = std::unique_ptr<EVP_CIPHER_CTX, EvpCipherCtxDeleter>;
using FilePtr = std::unique_ptr<FILE, FileDeleter>;

class CryptoEngine {
public:
    static PkeyPtr load_private_key(const std::string& path);
    static PkeyPtr load_public_key(const std::string& path);
    static PkeyPtr generate_ephemeral_key();
};

#endif // CRYPTO_ENGINE_HPP
