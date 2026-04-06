# Crypto Keys

Bu klasördeki özel/açık anahtar dosyaları (`*.pem`) repoya commit edilmemelidir.

Anahtarları yerelde üretmek için:

```bash
python3 generate_keys.py
```

Opsiyonel olarak GKS private key şifreli üretmek için:

```bash
export GKS_KEY_PASSPHRASE="guclu_bir_sifre"
python3 generate_keys.py
```

Not: Anahtarlar runtime sırasında konteyner/pod içine volume veya secret olarak mount edilmelidir.
