"""Auth + client cabinet API."""
import datetime as dt
import json
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from . import errors, growth, keys, payments, receipts, settings_store
from .billing import cache_mults, sale_prices, to_nano, usd
from .db import get_session
from .models import ApiKey, Model, Payment, Provider, Referral, RequestLog, Transaction, User, now
from .security import current_user, hash_password, make_token, new_api_key, verify_password

router = APIRouter(prefix="/api")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_login_fails: dict[str, list] = {}


def user_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "role": u.role, "balance": usd(u.balance),
            "is_blocked": u.is_blocked, "markup": u.markup, "has_password": bool(u.password_hash),
            "created_at": u.created_at.isoformat()}


class AuthIn(BaseModel):
    email: str
    password: str
    name: str = ""
    ref: str = ""


@router.get("/public/config")
async def public_config(session: AsyncSession = Depends(get_session)):
    g = await settings_store.get(session, "general")
    from .oauth import enabled_providers
    rf = await settings_store.get(session, "referral")
    b = await settings_store.get(session, "billing")
    return {"site_name": g["site_name"], "registration_enabled": g["registration_enabled"],
            "support_contact": g["support_contact"], "oauth": await enabled_providers(session),
            "status_page": g.get("status_page", True),
            "topup_bonus": growth.parse_tiers(b.get("topup_bonus", "")), "usd_rub_rate": b["usd_rub_rate"],
            "pay_methods": [{"id": m["id"], "currency": m["currency"], "min": m["min"]} for m in await payments.methods(session)],
            "referral": {"enabled": rf["enabled"], "friend_bonus": rf["friend_bonus_usd"],
                         "inviter_bonus": rf["inviter_bonus_usd"], "require_topup": rf["require_topup"]}}


async def public_catalog(session: AsyncSession, popular: bool = True) -> list[dict]:
    """Enabled models with a route, at sale prices. `popular` (top-3 by requests in 7 days) costs a scan of the
    request log, so pages that only need prices skip it."""
    g = await settings_store.get(session, "general")
    rows = (await session.execute(select(Model).where(Model.is_enabled == True).order_by(Model.family,
                                                                                         Model.public_id))).scalars()
    top = (await session.execute(
        select(RequestLog.model, func.count()).where(RequestLog.created_at >= now() - dt.timedelta(days=7),
                                                     RequestLog.status_code < 400)
        .group_by(RequestLog.model).order_by(desc(func.count())).limit(3))).all() if popular else []
    popular = {m for m, c in top if c > 0}
    types = {p.id: p.type for p in (await session.execute(select(Provider).where(Provider.is_enabled == True))).scalars()}
    out = []
    for m in rows:
        if not m.routes:
            continue
        pin, pout = sale_prices(m, g["default_markup"])
        # cache prices follow the primary route; shown where the provider is known to cache or the admin set them
        ptype = next((types[r.provider_id] for r in sorted(m.routes, key=lambda r: r.priority) if r.provider_id in types), None)
        rm, wm = cache_mults(m, ptype)
        chat = m.kind == "chat" and pin > 0
        cr = round(pin * rm, 6) if chat and (m.cache_read_mult is not None or ptype in ("anthropic", "openai")) else None
        cw = round(pin * wm, 6) if chat and (m.cache_write_mult is not None or ptype == "anthropic") else None
        out.append({"id": m.public_id, "name": m.display_name or m.public_id, "family": m.family, "kind": m.kind,
                    "description": m.description, "context_length": m.context_length,
                    "max_output": m.max_output, "vision": m.supports_vision, "tools": m.supports_tools,
                    "price_in": pin, "price_out": pout, "price_cache_read": cr, "price_cache_write": cw,
                    "popular": m.public_id in popular})
    return out


@router.get("/public/models")
async def public_models(session: AsyncSession = Depends(get_session)):
    return await public_catalog(session)


@router.post("/auth/register")
async def register(data: AuthIn, session: AsyncSession = Depends(get_session)):
    import os
    if os.getenv("ALLOW_PASSWORD_SIGNUP") != "1":
        raise HTTPException(403, "Регистрация доступна только через GitHub или Google")
    g = await settings_store.get(session, "general")
    if not g["registration_enabled"]:
        raise HTTPException(403, "Регистрация временно закрыта")
    email = data.email.lower().strip()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Некорректный email")
    if len(data.password) < 8:
        raise HTTPException(400, "Пароль должен быть не короче 8 символов")
    if (await session.execute(select(User).where(User.email == email))).scalar_one_or_none():
        raise HTTPException(400, "Пользователь с таким email уже существует")
    bonus = to_nano(g["signup_bonus_usd"]) if g["signup_bonus_usd"] > 0 else 0
    u = User(email=email, name=data.name.strip()[:100], password_hash=hash_password(data.password), balance=bonus)
    session.add(u)
    await session.flush()
    if bonus:
        session.add(Transaction(user_id=u.id, type="bonus", amount=bonus, description="Бонус за регистрацию"))
    await growth.on_signup(session, u, data.ref)
    raw, h, disp = new_api_key()
    session.add(ApiKey(user_id=u.id, name="default", key_hash=h, display=disp))
    await session.commit()
    return {"token": make_token(u), "user": user_out(u), "first_key": raw}


@router.post("/auth/login")
async def login(data: AuthIn, request: Request, session: AsyncSession = Depends(get_session)):
    email = data.email.lower().strip()
    ip = request.client.host if request.client else ""
    k = f"{email}|{ip}"
    t = now()
    fails = [x for x in _login_fails.get(k, []) if x > t - dt.timedelta(minutes=15)]
    if len(fails) >= 8:
        raise HTTPException(429, "Слишком много попыток. Попробуйте через 15 минут")
    u = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not u or not verify_password(data.password, u.password_hash):
        fails.append(t)
        _login_fails[k] = fails
        raise HTTPException(400, "Неверный email или пароль")
    if u.is_blocked:
        raise HTTPException(403, "Аккаунт заблокирован")
    _login_fails.pop(k, None)
    return {"token": make_token(u), "user": user_out(u)}


@router.get("/me")
async def me(user: User = Depends(current_user)):
    return user_out(user)


class PasswordIn(BaseModel):
    old_password: str
    new_password: str


@router.post("/me/password")
async def change_password(data: PasswordIn, user: User = Depends(current_user),
                          session: AsyncSession = Depends(get_session)):
    if not verify_password(data.old_password, user.password_hash):
        raise HTTPException(400, "Текущий пароль неверен")
    if len(data.new_password) < 8:
        raise HTTPException(400, "Пароль должен быть не короче 8 символов")
    u = await session.get(User, user.id)
    u.password_hash = hash_password(data.new_password)
    await session.commit()
    return {"ok": True}


# ---------------- API keys
class KeyIn(BaseModel):
    name: str = "default"
    spend_limit: float | None = Field(None, ge=0)  # USD; the cabinet converts from rubles
    limit_period: Literal["total", "day", "month"] = "total"
    allowed_models: list[str] = []
    expires_on: dt.date | None = None  # last day the key works (Moscow time)
    rpm_limit: int | None = Field(None, ge=1, le=100_000)


class KeyPatch(BaseModel):
    """Only the fields that are sent change; null clears spend_limit, expires_on and rpm_limit."""
    name: str | None = None
    is_active: bool | None = None
    spend_limit: float | None = Field(None, ge=0)
    clear_limit: bool = False
    limit_period: Literal["total", "day", "month"] | None = None
    allowed_models: list[str] | None = None
    expires_on: dt.date | None = None
    rpm_limit: int | None = Field(None, ge=1, le=100_000)


async def models_json(session, ids: list[str]) -> str:
    ids = list(dict.fromkeys(i.strip() for i in ids if i and i.strip()))
    if len(ids) > 200:
        raise HTTPException(400, "Можно выбрать не больше 200 моделей")
    if ids:
        known = set((await session.execute(select(Model.public_id).where(Model.public_id.in_(ids)))).scalars())
        if bad := [i for i in ids if i not in known]:
            raise HTTPException(400, f"Таких моделей нет в каталоге: {', '.join(bad[:5])}")
    return json.dumps(ids, ensure_ascii=False) if ids else ""


def expiry(day: dt.date | None) -> dt.datetime | None:
    if day is None:
        return None
    at = keys.expires_at_of(day)
    if at <= now():
        raise HTTPException(400, "Дата окончания уже прошла")
    return at


async def set_period(session, k: ApiKey, period: str):
    """Switching the period counts what the key has already spent in the new day or month."""
    k.limit_period = period
    k.period_start = keys.period_start(period)
    k.period_spent = await keys.spent_since(session, k.id, k.period_start) if k.id else 0


def key_out(k: ApiKey) -> dict:
    reset = keys.next_reset(k.limit_period)
    return {"id": k.id, "name": k.name, "display": k.display, "is_active": k.is_active,
            "spend_limit": usd(k.spend_limit) if k.spend_limit is not None else None, "spent": usd(k.spent),
            "limit_period": k.limit_period, "period_spent": usd(keys.current_spent(k)),
            "limit_resets_at": reset.isoformat() if reset else None, "allowed_models": keys.models_of(k),
            "expires_on": keys.expires_on_of(k.expires_at), "expired": bool(k.expires_at and k.expires_at <= now()),
            "rpm_limit": k.rpm_limit,
            "created_at": k.created_at.isoformat(), "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None}


@router.get("/me/keys")
async def list_keys(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(ApiKey).where(ApiKey.user_id == user.id).order_by(ApiKey.id))).scalars()
    return [key_out(k) for k in rows]


@router.post("/me/keys")
async def create_key(data: KeyIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    count = (await session.execute(select(func.count()).select_from(ApiKey).where(ApiKey.user_id == user.id))).scalar()
    if count >= 50:
        raise HTTPException(400, "Максимум 50 ключей")
    raw, h, disp = new_api_key()
    k = ApiKey(user_id=user.id, name=(data.name or "key").strip()[:100], key_hash=h, display=disp,
               spend_limit=to_nano(data.spend_limit) if data.spend_limit else None,
               allowed_models=await models_json(session, data.allowed_models), expires_at=expiry(data.expires_on),
               rpm_limit=data.rpm_limit)
    await set_period(session, k, data.limit_period)
    session.add(k)
    await session.commit()
    return {**key_out(k), "key": raw}


@router.patch("/me/keys/{key_id}")
async def patch_key(key_id: int, data: KeyPatch, user: User = Depends(current_user),
                    session: AsyncSession = Depends(get_session)):
    k = await session.get(ApiKey, key_id)
    if not k or k.user_id != user.id:
        raise HTTPException(404, "Ключ не найден")
    if data.name is not None:
        k.name = data.name.strip()[:100]
    if data.is_active is not None:
        k.is_active = data.is_active
    sent = data.model_fields_set
    if data.clear_limit:
        k.spend_limit = None
    elif "spend_limit" in sent:
        k.spend_limit = to_nano(data.spend_limit) if data.spend_limit else None
    if data.limit_period is not None and data.limit_period != k.limit_period:
        await set_period(session, k, data.limit_period)
    if data.allowed_models is not None:
        k.allowed_models = await models_json(session, data.allowed_models)
    if "expires_on" in sent:
        k.expires_at = expiry(data.expires_on)
    if "rpm_limit" in sent:
        k.rpm_limit = data.rpm_limit
    await session.commit()
    return key_out(k)


@router.delete("/me/keys/{key_id}")
async def delete_key(key_id: int, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    k = await session.get(ApiKey, key_id)
    if not k or k.user_id != user.id:
        raise HTTPException(404, "Ключ не найден")
    await session.delete(k)
    await session.commit()
    return {"ok": True}


# ---------------- usage / logs / transactions / payments
def parse_range(days: int, date_from: str = "", date_to: str = "") -> tuple[dt.datetime, dt.datetime | None]:
    """Explicit YYYY-MM-DD range (inclusive, UTC) or last N days."""
    try:
        if date_from:
            since = dt.datetime.strptime(date_from, "%Y-%m-%d")
            until = dt.datetime.strptime(date_to, "%Y-%m-%d") + dt.timedelta(days=1) if date_to else None
            if until and until <= since:
                raise HTTPException(400, "Дата «по» должна быть не раньше даты «с»")
            if (until or now()) - since > dt.timedelta(days=366):
                raise HTTPException(400, "Период не может быть больше года")
            return since, until
    except ValueError:
        raise HTTPException(400, "Дата должна быть в формате ГГГГ-ММ-ДД")
    return now() - dt.timedelta(days=min(max(days, 1), 365)), None


async def usage_stats(session, days: int, user_id: int | None = None, since: dt.datetime | None = None,
                      until: dt.datetime | None = None) -> dict:
    since = since or now() - dt.timedelta(days=days)
    cond = [RequestLog.created_at >= since]
    if until:
        cond.append(RequestLog.created_at < until)
    if user_id:
        cond.append(RequestLog.user_id == user_id)
    day = func.date(RequestLog.created_at)
    daily = (await session.execute(
        select(day, func.count(), func.coalesce(func.sum(RequestLog.price), 0), func.coalesce(func.sum(RequestLog.cost), 0),
               func.coalesce(func.sum(RequestLog.prompt_tokens + RequestLog.completion_tokens), 0))
        .where(*cond).group_by(day).order_by(day))).all()
    by_model = (await session.execute(
        select(RequestLog.model, func.count(), func.coalesce(func.sum(RequestLog.price), 0),
               func.coalesce(func.sum(RequestLog.cost), 0),
               func.coalesce(func.sum(RequestLog.prompt_tokens + RequestLog.completion_tokens), 0))
        .where(*cond).group_by(RequestLog.model).order_by(desc(func.sum(RequestLog.price))).limit(10))).all()
    tot = (await session.execute(
        select(func.count(), func.coalesce(func.sum(RequestLog.price), 0), func.coalesce(func.sum(RequestLog.cost), 0),
               func.coalesce(func.sum(RequestLog.prompt_tokens), 0),
               func.coalesce(func.sum(RequestLog.completion_tokens), 0),
               func.coalesce(func.avg(RequestLog.latency_ms), 0))
        .where(*cond))).one()
    errors = (await session.execute(select(func.count()).where(*cond, RequestLog.status_code >= 400))).scalar()
    return {
        "totals": {"requests": tot[0], "revenue": usd(tot[1]), "cost": usd(tot[2]), "profit": usd(tot[1] - tot[2]),
                   "prompt_tokens": tot[3], "completion_tokens": tot[4], "errors": errors,
                   "avg_latency_ms": int(tot[5] or 0)},
        "daily": [{"date": str(d), "requests": c, "revenue": usd(p), "cost": usd(co), "tokens": t}
                  for d, c, p, co, t in daily],
        "by_model": [{"model": m, "requests": c, "revenue": usd(p), "cost": usd(co), "profit": usd(p - co), "tokens": t}
                     for m, c, p, co, t in by_model],
    }


@router.get("/me/usage")
async def my_usage(days: int = 30, date_from: str = "", date_to: str = "", user: User = Depends(current_user),
                   session: AsyncSession = Depends(get_session)):
    since, until = parse_range(days, date_from, date_to)
    st = await usage_stats(session, days, user.id, since, until)
    cond = [RequestLog.user_id == user.id, RequestLog.created_at >= since]
    if until:
        cond.append(RequestLog.created_at < until)
    by_key = (await session.execute(
        select(RequestLog.api_key_id, func.count(), func.coalesce(func.sum(RequestLog.price), 0),
               func.coalesce(func.sum(RequestLog.prompt_tokens + RequestLog.completion_tokens), 0))
        .where(*cond).group_by(RequestLog.api_key_id).order_by(desc(func.sum(RequestLog.price))))).all()
    names = dict((await session.execute(select(ApiKey.id, ApiKey.name).where(ApiKey.user_id == user.id))).all())
    st["by_key"] = [{"key_id": k, "name": names.get(k, "Удалённый ключ"), "requests": c, "revenue": usd(p),
                     "tokens": t} for k, c, p, t in by_key]
    st["range"] = {"from": since.date().isoformat(),
                   "to": ((until - dt.timedelta(days=1)) if until else now()).date().isoformat()}
    for row in st["by_model"]:
        row.pop("cost"), row.pop("profit")
    st["totals"] = {k: v for k, v in st["totals"].items() if k not in ("cost", "profit")}
    for d in st["daily"]:
        d.pop("cost")
    today = (await session.execute(select(func.coalesce(func.sum(RequestLog.price), 0)).where(
        RequestLog.user_id == user.id, RequestLog.created_at >= now().replace(hour=0, minute=0, second=0)))).scalar()
    st["today_spent"] = usd(today)
    return st


def log_out(r: RequestLog, admin=False) -> dict:
    d = {"id": r.id, "request_id": r.request_id, "model": r.model, "endpoint": r.endpoint, "stream": r.stream,
         "prompt_tokens": r.prompt_tokens, "completion_tokens": r.completion_tokens, "price": usd(r.price),
         "cached_tokens": r.cache_read_tokens, "cache_write_tokens": r.cache_write_tokens,
         "latency_ms": r.latency_ms, "status_code": r.status_code, "created_at": r.created_at.isoformat()}
    if admin:
        d.update(cost=usd(r.cost), profit=usd(r.price - r.cost), provider_id=r.provider_id,
                 provider_key_id=r.provider_key_id, user_id=r.user_id, api_key_id=r.api_key_id, ip=r.ip,
                 error=r.error, attempts=r.attempts)
    elif r.status_code >= 400:
        d["error"] = errors.STATUS_TEXT.get(r.status_code, "Ошибка запроса")
    return d


@router.get("/me/logs")
async def my_logs(limit: int = 50, offset: int = 0, user: User = Depends(current_user),
                  session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(RequestLog).where(RequestLog.user_id == user.id)
                                  .order_by(desc(RequestLog.id)).limit(min(limit, 200)).offset(offset))).scalars()
    return [log_out(r) for r in rows]


@router.get("/me/transactions")
async def my_transactions(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Transaction).where(Transaction.user_id == user.id)
                                  .order_by(desc(Transaction.id)).limit(200))).scalars()
    return [{"id": t.id, "type": t.type, "amount": usd(t.amount), "description": t.description,
             "created_at": t.created_at.isoformat()} for t in rows]


def payment_out(p: Payment) -> dict:
    return {"id": p.id, "user_id": p.user_id, "method": p.method, "amount": p.amount, "currency": p.currency,
            "amount_usd": usd(p.amount_usd), "status": p.status, "external_id": p.external_id, "pay_url": p.pay_url,
            "created_at": p.created_at.isoformat(), "paid_at": p.paid_at.isoformat() if p.paid_at else None}


@router.get("/me/referral")
async def my_referral(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    from .config import PUBLIC_URL
    rf = await settings_store.get(session, "referral")
    rows = (await session.execute(select(Referral, User.email).join(User, User.id == Referral.user_id)
                                  .where(Referral.referrer_id == user.id)
                                  .order_by(Referral.created_at.desc()).limit(200))).all()
    code = growth.ref_code(user.id)
    return {"enabled": rf["enabled"], "code": code, "link": f"{PUBLIC_URL}/?ref={code}",
            "inviter_bonus": rf["inviter_bonus_usd"], "friend_bonus": rf["friend_bonus_usd"],
            "require_topup": rf["require_topup"],
            "invited": len(rows), "rewarded": sum(1 for r, _ in rows if r.rewarded_at),
            "earned": usd(sum(r.inviter_bonus for r, _ in rows if r.rewarded_at)),
            "friends": [{"email": growth.mask_email(e), "created_at": r.created_at.isoformat(),
                         "rewarded": bool(r.rewarded_at), "bonus": usd(r.inviter_bonus)} for r, e in rows]}


@router.get("/me/payments")
async def my_payments(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Payment).where(Payment.user_id == user.id)
                                  .order_by(desc(Payment.created_at)).limit(100))).scalars()
    return [payment_out(p) for p in rows]


# ---------------- CSV export
CSV_COLS = ["Дата (UTC)", "ID запроса", "Ключ", "Модель", "Endpoint", "Stream", "Токены вход", "Токены выход",
            "Стоимость, USD", "Стоимость, ₽", "Задержка, мс", "Статус"]


def _csv_cell(v) -> str:
    v = str(v)
    if v[:1] in ("=", "+", "-", "@") and not v.replace("-", "").replace(",", "").isdigit():
        v = "'" + v  # protect against spreadsheet formula injection
    return '"' + v.replace('"', '""') + '"' if any(c in v for c in ';"\n') else v


@router.get("/me/usage.csv")
async def export_usage(days: int = 30, date_from: str = "", date_to: str = "", user: User = Depends(current_user),
                       session: AsyncSession = Depends(get_session)):
    since, until = parse_range(days, date_from, date_to)
    cond = [RequestLog.user_id == user.id, RequestLog.created_at >= since]
    if until:
        cond.append(RequestLog.created_at < until)
    names = dict((await session.execute(select(ApiKey.id, ApiKey.name).where(ApiKey.user_id == user.id))).all())
    rate = float((await settings_store.get(session, "billing")).get("usd_rub_rate") or 95)
    rows = (await session.execute(select(RequestLog).where(*cond).order_by(RequestLog.id).limit(200_000))).scalars().all()

    def gen():
        yield "\ufeff" + ";".join(CSV_COLS) + "\r\n"  # BOM + ';' so Excel opens Cyrillic correctly
        for r in rows:
            yield ";".join(_csv_cell(x) for x in [
                r.created_at.strftime("%Y-%m-%d %H:%M:%S"), r.request_id, names.get(r.api_key_id, "Удалённый ключ"),
                r.model, r.endpoint, "да" if r.stream else "нет", r.prompt_tokens, r.completion_tokens,
                f"{usd(r.price):.9f}".replace(".", ","), f"{usd(r.price) * rate:.6f}".replace(".", ","),
                r.latency_ms, r.status_code]) + "\r\n"

    fname = f"usage_{since.date()}_{((until - dt.timedelta(days=1)) if until else now()).date()}.csv"
    return StreamingResponse(gen(), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})


# ---------------- PDF receipts
@router.get("/me/payments/{pid}/receipt.pdf")
async def my_receipt(pid: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    p = await session.get(Payment, pid)
    if not p or p.user_id != user.id:
        raise HTTPException(404, "Платёж не найден")
    return await receipt_response(session, p, user)


async def receipt_response(session, p: Payment, user: User) -> Response:
    if p.status != "paid":
        raise HTTPException(400, "Квитанция доступна только для оплаченных платежей")
    g = await settings_store.get(session, "general")
    rate = float((await settings_store.get(session, "billing")).get("usd_rub_rate") or 95)
    pdf = receipts.render(p, user, g, usd(await growth.find_topup_bonus(session, p)), rate)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="receipt_{p.id[:8]}.pdf"'})
