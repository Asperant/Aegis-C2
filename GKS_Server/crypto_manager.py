import logging
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.exceptions import InvalidTag

import config

logger = logging.getLogger(f"CryptoManager")

class CryptoManager:
    def __init__(self):
        self.gks_private_key = None
        self.uav_public_key = None
        self.uav_session_keys = {}
        self.pending_session_keys = {}
        self._load_keys()

    def _load_keys(self):
        try:
            with open(config.PRIVATE_KEY_PATH, "rb") as f:
                self.gks_private_key = serialization.load_pem_private_key(f.read(), password=config.GKS_PASSPHRASE)
            with open(config.PUBLIC_KEY_PATH, "rb") as f:
                self.uav_public_key = serialization.load_pem_public_key(f.read())
            logger.info("Asimetrik Anahtarlar başarıyla yüklendi.")
        except Exception as e:
            logger.critical(f"Asimetrik Anahtarlar okunamadı! 'keys' klasörünü kontrol edin. Hata türü: {type(e).__name__}")
            raise

    def verify_signature(self, signature, payload):
        try:
            self.uav_public_key.verify(signature, payload, ec.ECDSA(hashes.SHA256()))
            return True
        except Exception:
            return False

    def generate_handshake_response(self, uav_id, uav_pub_key_bytes, is_rekey=False):
        gks_ephemeral_private = ec.generate_private_key(ec.SECP256R1())
        gks_ephemeral_public_bytes = gks_ephemeral_private.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint
        )

        uav_ephemeral_public = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), uav_pub_key_bytes)
        shared_key = gks_ephemeral_private.exchange(ec.ECDH(), uav_ephemeral_public)
        
        session_key = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b'handshake').derive(shared_key)
        
        if is_rekey:
            self.pending_session_keys[uav_id] = AESGCM(session_key)
        else:
            self.uav_session_keys[uav_id] = AESGCM(session_key)
        
        gks_signature = self.gks_private_key.sign(gks_ephemeral_public_bytes, ec.ECDSA(hashes.SHA256()))
        return gks_ephemeral_public_bytes, gks_signature

    def decrypt_payload(self, uav_id, iv, ciphertext, auth_tag, aad):
        try:
            return self.uav_session_keys[uav_id].decrypt(iv, ciphertext + auth_tag, associated_data=aad)
        except InvalidTag:
            if uav_id in self.pending_session_keys:
                try:
                    decrypted_payload = self.pending_session_keys[uav_id].decrypt(iv, ciphertext + auth_tag, associated_data=aad)
                    self.uav_session_keys[uav_id] = self.pending_session_keys[uav_id]
                    del self.pending_session_keys[uav_id]
                    logger.info(f"[ROTASYON TAMAMLANDI] İHA-{uav_id} yeni AES-256 zırhı AKTİF!")
                    return decrypted_payload
                except InvalidTag:
                    raise ValueError("Spoofing - Authentication Tag Verification Failed on Rekey")
            else:
                raise ValueError("Spoofing - Authentication Tag Verification Failed")

    def encrypt_payload(self, uav_id, payload, aad):
        import os
        iv = os.urandom(12)
        encrypted = self.uav_session_keys[uav_id].encrypt(iv, payload, aad)
        return iv, encrypted[:-16], encrypted[-16:]

    def has_session(self, uav_id):
        return uav_id in self.uav_session_keys
