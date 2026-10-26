"""Sign-in via GitHub and Google (OAuth 2.0). Accounts are created automatically on first sign-in."""
import os
import secrets
import urllib.parse

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import settings_store
from .billing import to_nano
from .config import ADMIN_EMAIL, ADMIN_PASSWORD, PUBLIC_URL
from .db import get_session
from .models import ApiKey, Transaction, User
from .security import make_token, new_api_key

router = APIRouter(prefix="/api/auth/oauth")

PROVIDERS = {
    "github": {
        "authorize": "https://github.com/login/oauth/authorize",
        "token": "https://github.com/login/oauth/access_token",
        "scope": "read:user user:email",
    },
    "google": {
        "authorize": "https://accounts.google.com/o/oauth2/v2/auth",
        "token": "https://oauth2.googleapis.com/token",
        "scope": "openid email profile",
    },
}


def callback_url(provider: str) -> str:
    return f"{PUBLIC_URL}/api/auth/oauth/{provider}/callback"


async def credentials(session: AsyncSession, provider: str) -> tuple[str, str]:
    s = await settings_store.get(session, "oauth")
    cid = s.get(f"{provider}_client_id") or os.getenv(f"{provider.upper()}_CLIENT_ID", "")
    sec = s.get(f"{provider}_client_secret") or os.getenv(f"{provider.upper()}_CLIENT_SECRET", "")
    return cid.strip(), sec.strip()


async def enabled_providers(session: AsyncSession) -> dict:
    return {p: all(await credentials(session, p)) for p in PROVIDERS}


def fail(msg: str) -> RedirectResponse:
    r = RedirectResponse("/#/login?error=" + urllib.parse.quote(msg), status_code=302)
    r.delete_cookie("oauth_state", path="/api/auth/oauth")
    r.delete_cookie("ref", path="/")
    return r


@router.get("/{provider}/start")
async def start(provider: str, session: AsyncSession = Depends(get_session)):
    if provider not in PROVIDERS:
        return fail("Неизвестный способ входа")
    cid, sec = await credentials(session, provider)
    if not (cid and sec):
        return fail("Этот способ входа ещё не настроен")
    state = secrets.token_urlsafe(24)
    q = {"client_id": cid, "redirect_uri": callback_url(provider), "scope": PROVIDERS[provider]["scope"], "state": state}
    if provider == "google":
        q.update(response_type="code", prompt="select_account")
    else:
        q.update(allow_signup="true")
    r = RedirectResponse(PROVIDERS[provider]["authorize"] + "?" + urllib.parse.urlencode(q), status_code=302)
    r.set_cookie("oauth_state", state, max_age=600, httponly=True, samesite="lax",
                 secure=PUBLIC_URL.startswith("https"), path="/api/auth/oauth")
    return r


async def fetch_profile(provider: str, code: str, cid: str, sec: str) -> tuple[str, str]:
    """Returns (verified email, display name)."""
    async with httpx.AsyncClient(timeout=20) as c:
        if provider == "github":
            t = (await c.post(PROVIDERS["github"]["token"], headers={"Accept": "application/json"},
                              data={"client_id": cid, "client_secret": sec, "code": code,
                                    "redirect_uri": callback_url("github")})).json()
            tok = t.get("access_token")
            if not tok:
                raise ValueError(t.get("error_description") or "GitHub не выдал токен")
            h = {"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json"}
            u = (await c.get("https://api.github.com/user", headers=h)).json()
            emails = (await c.get("https://api.github.com/user/emails", headers=h)).json()
            verified = [e for e in emails if isinstance(e, dict) and e.get("verified")] if isinstance(emails, list) else []
            primary = next((e for e in verified if e.get("primary")), verified[0] if verified else None)
            if not primary:
                raise ValueError("В аккаунте GitHub нет подтверждённого email")
            return primary["email"], u.get("name") or u.get("login") or ""
        t = (await c.post(PROVIDERS["google"]["token"],
                          data={"client_id": cid, "client_secret": sec, "code": code, "grant_type": "authorization_code",
                                "redirect_uri": callback_url("google")})).json()
        tok = t.get("access_token")
        if not tok:
            raise ValueError(t.get("error_description") or "Google не выдал токен")
        u = (await c.get("https://openidconnect.googleapis.com/v1/userinfo",
                         headers={"Authorization": f"Bearer {tok}"})).json()
        if not u.get("email") or not u.get("email_verified"):
            raise ValueError("Email в аккаунте Google не подтверждён")
        return u["email"], u.get("name") or ""


@router.get("/{provider}/callback")
async def callback(provider: str, request: Request, code: str = "", state: str = "", error: str = "",
                   session: AsyncSession = Depends(get_session)):
    if provider not in PROVIDERS:
        return fail("Неизвестный способ входа")
    if error:
        return fail("Вход отменён")
    cookie = request.cookies.get("oauth_state", "")
    if not code or not state or not cookie or not secrets.compare_digest(cookie, state):
        return fail("Сессия входа устарела, попробуйте ещё раз")
    cid, sec = await credentials(session, provider)
    try:
        email, name = await fetch_profile(provider, code, cid, sec)
    except Exception as e:  # noqa: BLE001
        return fail(str(e)[:200] or "Не удалось войти")
    email = email.lower().strip()
    user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    first_key = ""
    if not user:
        g = await settings_store.get(session, "general")
        has_admin = (await session.execute(select(User).where(User.role == "admin"))).scalars().first()
        make_admin = email == ADMIN_EMAIL or (not has_admin and not ADMIN_PASSWORD and not os.getenv("ADMIN_EMAIL"))
        if not g["registration_enabled"] and not make_admin:
            return fail("Регистрация новых пользователей временно закрыта")
        bonus = to_nano(g["signup_bonus_usd"]) if g["signup_bonus_usd"] > 0 else 0
        user = User(email=email, name=name[:100], password_hash="", role="admin" if make_admin else "user",
                    balance=bonus)
        session.add(user)
        await session.flush()
        if bonus:
            session.add(Transaction(user_id=user.id, type="bonus", amount=bonus, description="Бонус за регистрацию"))
        from .growth import on_signup
        await on_signup(session, user, request.cookies.get("ref"))
        first_key, h, disp = new_api_key()
        session.add(ApiKey(user_id=user.id, name="default", key_hash=h, display=disp))
        await session.commit()
    else:
        if user.is_blocked:
            return fail("Аккаунт заблокирован")
        if email == ADMIN_EMAIL and user.role != "admin":
            user.role = "admin"
            await session.commit()
        if not user.name and name:
            user.name = name[:100]
            await session.commit()
    frag = {"token": make_token(user)}
    if first_key:
        frag["key"] = first_key
    r = RedirectResponse("/#/oauth?" + urllib.parse.urlencode(frag), status_code=302)
    r.delete_cookie("oauth_state", path="/api/auth/oauth")
    r.delete_cookie("ref", path="/")
    return r
