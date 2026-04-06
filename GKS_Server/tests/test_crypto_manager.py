from pathlib import Path
import sys

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import config  # noqa: E402
from crypto_manager import CryptoManager  # noqa: E402


def _write_test_keypair(private_path: Path, public_path: Path) -> ec.EllipticCurvePrivateKey:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()

    private_path.write_bytes(
        private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    public_path.write_bytes(
        public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )

    return private_key


def test_crypto_manager_roundtrip_encrypt_decrypt(monkeypatch, tmp_path):
    gks_private_path = tmp_path / "gks_private.pem"
    uav_public_path = tmp_path / "uav_public.pem"

    gks_private_key = _write_test_keypair(gks_private_path, uav_public_path)

    monkeypatch.setattr(config, "PRIVATE_KEY_PATH", str(gks_private_path))
    monkeypatch.setattr(config, "PUBLIC_KEY_PATH", str(uav_public_path))
    monkeypatch.setattr(config, "GKS_PASSPHRASE", None)

    crypto = CryptoManager()

    uav_ephemeral_private = ec.generate_private_key(ec.SECP256R1())
    uav_ephemeral_public_bytes = uav_ephemeral_private.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )

    gks_ephemeral_pub, gks_signature = crypto.generate_handshake_response(
        uav_id=1,
        uav_pub_key_bytes=uav_ephemeral_public_bytes,
        is_rekey=False,
    )

    gks_private_key.public_key().verify(gks_signature, gks_ephemeral_pub, ec.ECDSA(hashes.SHA256()))
    assert crypto.has_session(1)

    payload = b"aegis-payload"
    aad = b"aegis-aad"

    iv, ciphertext, auth_tag = crypto.encrypt_payload(1, payload, aad)
    decrypted = crypto.decrypt_payload(1, iv, ciphertext, auth_tag, aad)

    assert decrypted == payload
