import base64
import datetime as dt
import hashlib
import hmac
import ipaddress
import secrets
import socket
from urllib.parse import urlparse

import jwt
from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from .config import ALLOW_PRIVATE_PROVIDER_URLS, ENCRYPTION_KEY, JWT_TTL_HOURS, SECRET_KEY
from .db import get_session
from .models import User

_fernet = Fernet(ENCRYPTION_KEY.encode())


def encrypt(s: str) -> str:
    return _fernet.encrypt(s.encode()).decode()


def decrypt(s: str) -> str:
    return _fernet.decrypt(s.encode()).decode()


def mask(s: str) -> str:
    if not s:
        return ""
    if len(s) <= 10:
        return s[:2] + "…"
    return f"{s[:5]}…{s[-4:]}"


# ---- passwords (scrypt, stdlib) ----
def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(pw.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(dk).decode()


def verify_password(pw: str, stored: str) -> bool:
    try:
        _, salt_b64, dk_b64 = stored.split("$")
        salt = base64.b64decode(salt_b64)
        dk = hashlib.scrypt(pw.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(dk, base64.b64decode(dk_b64))
    except Exception:
        return False


# ---- JWT for web panel ----
def make_token(user: User) -> str:
    payload = {"sub": str(user.id), "role": user.role,
               "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=JWT_TTL_HOURS)}
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


async def current_user(request: Request, session: AsyncSession = Depends(get_session)) -> User:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Не авторизован")
    try:
        data = jwt.decode(auth[7:], SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Сессия истекла, войдите снова")
    user = await session.get(User, int(data["sub"]))
    if not user or user.is_blocked:
        raise HTTPException(403, "Аккаунт заблокирован")
    return user


async def admin_user(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Только для администратора")
    return user


# ---- client API keys ----
def new_api_key() -> tuple[str, str, str]:
    raw = "sk-gw-" + secrets.token_urlsafe(32).replace("-", "").replace("_", "")[:40]
    return raw, hash_key(raw), f"{raw[:9]}…{raw[-4:]}"


def hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ---- SSRF guard for provider base URLs ----
def check_public_url(url: str):
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise HTTPException(400, "Некорректный URL")
    if ALLOW_PRIVATE_PROVIDER_URLS:
        return
    try:
        infos = socket.getaddrinfo(p.hostname, None)
    except socket.gaierror:
        raise HTTPException(400, f"Не удалось разрешить хост {p.hostname}")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise HTTPException(400, "URL указывает на приватный адрес (защита от SSRF). "
                                     "Чтобы разрешить, задайте ALLOW_PRIVATE_PROVIDER_URLS=1")
