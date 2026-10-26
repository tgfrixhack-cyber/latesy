import json
import os
import pathlib
import secrets

from cryptography.fernet import Fernet

DATA_DIR = pathlib.Path(os.getenv("DATA_DIR", "./data")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite+aiosqlite:///{DATA_DIR}/gateway.db"

_secrets_file = DATA_DIR / "secrets.json"


def _load_secrets() -> dict:
    if _secrets_file.exists():
        return json.loads(_secrets_file.read_text())
    return {}


def _secret(name: str, factory) -> str:
    val = os.getenv(name)
    if val:
        return val
    data = _load_secrets()
    if name not in data:
        data[name] = factory()
        _secrets_file.write_text(json.dumps(data, indent=2))
        try:
            os.chmod(_secrets_file, 0o600)
        except OSError:
            pass
    return data[name]


SECRET_KEY = _secret("SECRET_KEY", lambda: secrets.token_urlsafe(48))
ENCRYPTION_KEY = _secret("ENCRYPTION_KEY", lambda: Fernet.generate_key().decode())

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@example.com").lower().strip()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
PUBLIC_URL = os.getenv("PUBLIC_URL", "http://localhost:8000").rstrip("/")
ALLOW_PRIVATE_PROVIDER_URLS = os.getenv("ALLOW_PRIVATE_PROVIDER_URLS", "0") == "1"
JWT_TTL_HOURS = int(os.getenv("JWT_TTL_HOURS", "168"))
