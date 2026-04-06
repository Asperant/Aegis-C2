import os
from enum import IntEnum

# Database and Redis configuration
DB_HOST = os.getenv("DB_HOST", "aegis_db")
DB_USER = os.getenv("DB_USER", "admin")
DB_PASS = os.getenv("DB_PASS", "CHANGE_ME_LOCAL_PASSWORD")
DB_NAME = os.getenv("DB_NAME", "aegis_hq")
REDIS_HOST = os.getenv("REDIS_HOST", "redis_db")
REDIS_PORT = 6379

# Server constants
GKS_ID = int(os.getenv("GKS_ID", "42"))  # Use a stable default ID for baseline deployment.
GKS_LAT = float(os.getenv("GKS_LAT", "37.8728"))  # Default station latitude.
GKS_LON = float(os.getenv("GKS_LON", "32.4922"))
POD_IP = os.getenv("POD_IP", "").strip()
_GKS_HOST_ENV = os.getenv("GKS_HOST", "").strip()
if POD_IP:
    GKS_HOST = POD_IP
elif _GKS_HOST_ENV:
    GKS_HOST = _GKS_HOST_ENV
elif GKS_ID == 42:
    # Static baseline deployment is usually reachable from the stable ClusterIP service.
    GKS_HOST = "aegis-gks-service"
else:
    GKS_HOST = f"aegis-gks-{GKS_ID}"
HOST = "0.0.0.0"
PORT = 5000
GPS_SCALE = 10000000.0

UNPACK_FORMAT = '<IQiifffBB' 
ACK_FORMAT = '<BIQ'

# Rate limiting configuration
RATE_LIMIT_PER_SECOND = 100
OPS_PACKET_EVENT_EVERY = max(1, int(os.getenv("OPS_PACKET_EVENT_EVERY", "1")))

class PacketMagic(IntEnum):
    HANDSHAKE_REQ = 0xDD
    HANDSHAKE_RES = 0xEE
    REKEY_REQ = 0xCC
    REKEY_RES = 0xCB
    TELEMETRY = 0xFF
    FEC_RECOVERY = 0xFE
    ACKNOWLEDGE = 0xAA
    RESET = 0xBB
    MISSION_UPLOAD = 0x1A
    TACTICAL_CMD = 0x1B

# Crypto configuration
GKS_PASSPHRASE = os.getenv("GKS_KEY_PASSPHRASE", "").encode() if os.getenv("GKS_KEY_PASSPHRASE") else None
PRIVATE_KEY_PATH = "../keys/gks_private.pem"
PUBLIC_KEY_PATH = "../keys/uav_public.pem"
