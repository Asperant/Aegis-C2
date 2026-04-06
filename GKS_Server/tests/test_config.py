from pathlib import Path
import importlib
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import config  # noqa: E402


def test_config_host_resolution_default_service(monkeypatch):
    monkeypatch.delenv("POD_IP", raising=False)
    monkeypatch.delenv("GKS_HOST", raising=False)
    monkeypatch.setenv("GKS_ID", "42")

    importlib.reload(config)

    assert config.GKS_HOST == "aegis-gks-service"


def test_config_host_resolution_dynamic_instance(monkeypatch):
    monkeypatch.delenv("POD_IP", raising=False)
    monkeypatch.delenv("GKS_HOST", raising=False)
    monkeypatch.setenv("GKS_ID", "7")

    importlib.reload(config)

    assert config.GKS_HOST == "aegis-gks-7"
