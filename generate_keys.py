import os
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

# Read optional passphrase from environment.
GKS_PASSPHRASE = os.getenv("GKS_KEY_PASSPHRASE", "").encode()

def generate_and_save_keypair(private_filename, public_filename):
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()

    if GKS_PASSPHRASE:
        encryption_alg = serialization.BestAvailableEncryption(GKS_PASSPHRASE)
    else:
        encryption_alg = serialization.NoEncryption()

    with open(private_filename, "wb") as f:
        f.write(private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=encryption_alg
        ))
    
    with open(public_filename, "wb") as f:
        f.write(public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        ))
    print(f"Generated: {private_filename} / {public_filename}")

if __name__ == "__main__":
    try:
        os.makedirs("keys", exist_ok=True)
        os.chmod("keys", 0o700)  # Restrict directory access to owner.
        
        print("Generating Aegis key material...\n")
        generate_and_save_keypair("keys/gks_private.pem", "keys/gks_public.pem")
        generate_and_save_keypair("keys/uav_private.pem", "keys/uav_public.pem")
        
        # Restrict private keys to owner read/write.
        for key_file in ["keys/gks_private.pem", "keys/uav_private.pem"]:
            if os.path.exists(key_file):
                os.chmod(key_file, 0o600)
                
        print("\nKey generation completed successfully.")
    except OSError as e:
        print(f"Key generation failed due to filesystem/permission error: {e}")
    except Exception as e:
        print(f"Unexpected key generation error: {e}")
