"""Admin panel API."""
import datetime as dt
import json

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from . import settings_store
from .api_user import key_out, log_out, payment_out, usage_stats, user_out
from .billing import sale_prices, to_nano, usd
from .catalog import PRESETS, lookup
from .db import SessionLocal, get_session
from .models import (ApiKey, Model, ModelRoute, Payment, Provider, ProviderKey, RequestLog, Transaction, User,
                     now)
from .payments import sync_status, test_cryptobot
from .security import admin_user, check_public_url, decrypt, encrypt, mask

router = APIRouter(prefix="/api/admin", dependencies=[Depends(admin_user)])
http = httpx.AsyncClient(timeout=30)


# ------------------------------------------------------------------ dashboard
@router.get("/stats")
async def stats(days: int = 30, session: AsyncSession = Depends(get_session)):
    days = min(max(days, 1), 365)
    st = await usage_stats(session, days)
    since = now() - dt.timedelta(days=days)
    prev = await usage_stats_range(session, since - dt.timedelta(days=days), since)
    st["prev"] = prev
    by_provider = (await session.execute(
        select(RequestLog.provider_id, func.count(), func.coalesce(func.sum(RequestLog.price), 0),
               func.coalesce(func.sum(RequestLog.cost), 0), func.coalesce(func.avg(RequestLog.latency_ms), 0))
        .where(RequestLog.created_at >= since).group_by(RequestLog.provider_id))).all()
    errs = dict((await session.execute(
        select(RequestLog.provider_id, func.count()).where(RequestLog.created_at >= since, RequestLog.status_code >= 400)
        .group_by(RequestLog.provider_id))).all())
    names = {p.id: p.name for p in (await session.execute(select(Provider))).scalars()}
    st["by_provider"] = [{"provider": names.get(pid, "—" if pid is None else f"#{pid}"), "requests": c,
                          "revenue": usd(r), "cost": usd(co), "avg_latency_ms": int(lat or 0),
                          "errors": errs.get(pid, 0)} for pid, c, r, co, lat in by_provider]
    top = (await session.execute(
        select(User.email, func.count(), func.coalesce(func.sum(RequestLog.price), 0), func.coalesce(func.sum(RequestLog.cost), 0))
        .join(User, User.id == RequestLog.user_id).where(RequestLog.created_at >= since)
        .group_by(User.email).order_by(desc(func.sum(RequestLog.price))).limit(10))).all()
    st["top_users"] = [{"email": e, "requests": c, "revenue": usd(r), "profit": usd(r - co)} for e, c, r, co in top]
    st["users_total"] = (await session.execute(select(func.count()).select_from(User))).scalar()
    st["users_new"] = (await session.execute(select(func.count()).select_from(User).where(User.created_at >= since))).scalar()
    st["balances_total"] = usd((await session.execute(select(func.coalesce(func.sum(User.balance), 0)))).scalar())
    st["payments_sum"] = usd((await session.execute(select(func.coalesce(func.sum(Payment.amount_usd), 0))
                                                    .where(Payment.status == "paid", Payment.paid_at >= since))).scalar())
    errors = (await session.execute(select(RequestLog).where(RequestLog.status_code >= 400)
                                    .order_by(desc(RequestLog.id)).limit(8))).scalars()
    st["recent_errors"] = [log_out(r, True) for r in errors]
    provs = (await session.execute(select(Provider).order_by(Provider.priority))).scalars().all()
    st["providers"] = [{"id": p.id, "name": p.name, "preset": p.preset, "status": p.status,
                        "is_enabled": p.is_enabled,
                        "keys_active": sum(1 for k in p.keys if k.is_enabled and k.status == "active"),
                        "keys_total": len(p.keys)} for p in provs]
    return st


async def usage_stats_range(session, start, end):
    r = (await session.execute(select(func.count(), func.coalesce(func.sum(RequestLog.price), 0),
                                      func.coalesce(func.sum(RequestLog.cost), 0),
                                      func.coalesce(func.sum(RequestLog.prompt_tokens + RequestLog.completion_tokens), 0))
                               .where(RequestLog.created_at >= start, RequestLog.created_at < end))).one()
    return {"requests": r[0], "revenue": usd(r[1]), "cost": usd(r[2]), "profit": usd(r[1] - r[2]), "tokens": r[3]}


# ------------------------------------------------------------------ providers
class ProviderIn(BaseModel):
    name: str
    preset: str = "custom"
    type: str = "openai_compatible"
    base_url: str
    is_enabled: bool = True
    priority: int = 100
    timeout: int = 300
    extra_headers: dict = {}
    api_keys: list[str] = []


class ProviderPatch(BaseModel):
    name: str | None = None
    type: str | None = None
    base_url: str | None = None
    is_enabled: bool | None = None
    priority: int | None = None
    timeout: int | None = None
    extra_headers: dict | None = None


def provider_out(p: Provider) -> dict:
    return {"id": p.id, "name": p.name, "preset": p.preset, "type": p.type, "base_url": p.base_url,
            "is_enabled": p.is_enabled, "priority": p.priority, "timeout": p.timeout,
            "extra_headers": json.loads(p.extra_headers or "{}"), "status": p.status, "last_error": p.last_error,
            "last_check_at": p.last_check_at.isoformat() if p.last_check_at else None,
            "keys": [pkey_out(k) for k in p.keys]}


def pkey_out(k: ProviderKey) -> dict:
    return {"id": k.id, "label": k.label, "display": k.display, "is_enabled": k.is_enabled, "status": k.status,
            "paused_until": k.paused_until.isoformat() if k.paused_until else None, "last_error": k.last_error,
            "uses": k.uses, "spent": usd(k.spent), "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None}


@router.get("/presets")
async def presets():
    return PRESETS


@router.get("/providers")
async def list_providers(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Provider).order_by(Provider.priority, Provider.id))).scalars()
    return [provider_out(p) for p in rows]


def _valid_type(t):
    if t not in ("openai", "anthropic", "openai_compatible"):
        raise HTTPException(400, "Тип должен быть openai, anthropic или openai_compatible")


@router.post("/providers")
async def create_provider(data: ProviderIn, session: AsyncSession = Depends(get_session)):
    _valid_type(data.type)
    url = data.base_url.strip().rstrip("/")
    check_public_url(url)
    p = Provider(name=data.name.strip(), preset=data.preset, type=data.type, base_url=url, is_enabled=data.is_enabled,
                 priority=data.priority, timeout=data.timeout, extra_headers=json.dumps(data.extra_headers))
    for raw in data.api_keys:
        raw = raw.strip()
        if raw:
            p.keys.append(ProviderKey(key_enc=encrypt(raw), display=mask(raw)))
    session.add(p)
    await session.commit()
    await session.refresh(p)
    return provider_out(p)


@router.patch("/providers/{pid}")
async def patch_provider(pid: int, data: ProviderPatch, session: AsyncSession = Depends(get_session)):
    p = await session.get(Provider, pid)
    if not p:
        raise HTTPException(404)
    d = data.model_dump(exclude_none=True)
    if "type" in d:
        _valid_type(d["type"])
    if "base_url" in d:
        d["base_url"] = d["base_url"].strip().rstrip("/")
        check_public_url(d["base_url"])
    if "extra_headers" in d:
        d["extra_headers"] = json.dumps(d["extra_headers"])
    for k, v in d.items():
        setattr(p, k, v)
    await session.commit()
    return provider_out(p)


@router.delete("/providers/{pid}")
async def delete_provider(pid: int, session: AsyncSession = Depends(get_session)):
    p = await session.get(Provider, pid)
    if p:
        for r in (await session.execute(select(ModelRoute).where(ModelRoute.provider_id == pid))).scalars():
            await session.delete(r)
        await session.delete(p)
        await session.commit()
    return {"ok": True}


class KeyIn(BaseModel):
    key: str
    label: str = ""


class KeyPatch(BaseModel):
    label: str | None = None
    is_enabled: bool | None = None
    reset_status: bool = False


@router.post("/providers/{pid}/keys")
async def add_key(pid: int, data: KeyIn, session: AsyncSession = Depends(get_session)):
    p = await session.get(Provider, pid)
    if not p or not data.key.strip():
        raise HTTPException(400, "Провайдер не найден или ключ пуст")
    k = ProviderKey(provider_id=pid, key_enc=encrypt(data.key.strip()), display=mask(data.key.strip()),
                    label=data.label.strip())
    session.add(k)
    await session.commit()
    return pkey_out(k)


@router.patch("/provider-keys/{kid}")
async def patch_key(kid: int, data: KeyPatch, session: AsyncSession = Depends(get_session)):
    k = await session.get(ProviderKey, kid)
    if not k:
        raise HTTPException(404)
    if data.label is not None:
        k.label = data.label
    if data.is_enabled is not None:
        k.is_enabled = data.is_enabled
    if data.reset_status:
        k.status, k.paused_until, k.last_error = "active", None, ""
    await session.commit()
    return pkey_out(k)


@router.delete("/provider-keys/{kid}")
async def delete_key(kid: int, session: AsyncSession = Depends(get_session)):
    k = await session.get(ProviderKey, kid)
    if k:
        await session.delete(k)
        await session.commit()
    return {"ok": True}


async def fetch_remote_models(p: Provider, secret: str) -> list[dict]:
    if p.type == "anthropic":
        headers = {"x-api-key": secret, "anthropic-version": "2023-06-01"}
        params = {"limit": 1000}
    else:
        headers, params = {"Authorization": f"Bearer {secret}"}, None
    try:
        headers.update(json.loads(p.extra_headers or "{}"))
    except Exception:
        pass
    r = await http.get(p.base_url.rstrip("/") + "/models", headers=headers, params=params)
    if r.status_code >= 400:
        raise HTTPException(400, f"HTTP {r.status_code}: {r.text[:400]}")
    items = r.json().get("data") or r.json().get("models") or []
    out = []
    for it in items:
        mid = (it.get("id") or it.get("name") or "").removeprefix("models/")
        if mid:
            out.append({"id": mid, "name": it.get("display_name") or it.get("name") or mid})
    return sorted(out, key=lambda x: x["id"])


async def test_provider(p: Provider, key: ProviderKey | None = None) -> dict:
    keys = [key] if key else [k for k in p.keys if k.is_enabled]
    if not keys:
        raise HTTPException(400, "У провайдера нет активных ключей")
    k = keys[0]
    try:
        models = await fetch_remote_models(p, decrypt(k.key_enc))
        result = {"ok": True, "models": len(models), "key_id": k.id}
        status, err = "ok", ""
    except HTTPException as e:
        result, status, err = {"ok": False, "error": e.detail, "key_id": k.id}, "error", e.detail
    except httpx.HTTPError as e:
        result, status, err = {"ok": False, "error": str(e) or type(e).__name__, "key_id": k.id}, "error", str(e)
    async with SessionLocal() as s:
        pp = await s.get(Provider, p.id)
        pp.status, pp.last_error, pp.last_check_at = status, err[:1000], now()
        kk = await s.get(ProviderKey, k.id)
        if status == "ok":
            kk.status, kk.last_error, kk.paused_until = "active", "", None
        elif "401" in err or "403" in err:
            kk.status, kk.last_error = "error", err[:1000]
        await s.commit()
    return result


@router.post("/providers/{pid}/test")
async def test(pid: int, key_id: int | None = None, session: AsyncSession = Depends(get_session)):
    p = await session.get(Provider, pid)
    if not p:
        raise HTTPException(404)
    key = await session.get(ProviderKey, key_id) if key_id else None
    return await test_provider(p, key)


@router.get("/providers/{pid}/remote-models")
async def remote_models(pid: int, session: AsyncSession = Depends(get_session)):
    p = await session.get(Provider, pid)
    keys = [k for k in (p.keys if p else []) if k.is_enabled]
    if not keys:
        raise HTTPException(400, "Добавьте API-ключ провайдеру")
    try:
        items = await fetch_remote_models(p, decrypt(keys[0].key_enc))
    except httpx.HTTPError as e:
        raise HTTPException(400, f"Не удалось подключиться: {e}")
    existing = {(r.upstream_model) for r in (await session.execute(
        select(ModelRoute).where(ModelRoute.provider_id == pid))).scalars()}
    for it in items:
        ref = lookup(it["id"])
        it["imported"] = it["id"] in existing
        it["cost_in"], it["cost_out"] = (ref[0], ref[1]) if ref else (None, None)
    return items


class ImportIn(BaseModel):
    models: list[str]


@router.post("/providers/{pid}/import")
async def import_models(pid: int, data: ImportIn, session: AsyncSession = Depends(get_session)):
    p = await session.get(Provider, pid)
    if not p:
        raise HTTPException(404)
    created = linked = 0
    for mid in data.models:
        m = (await session.execute(select(Model).where(Model.public_id == mid))).scalar_one_or_none()
        if not m:
            ref = lookup(mid)
            low = mid.lower()
            m = Model(public_id=mid, display_name=mid, family=PRESETS.get(p.preset, {}).get("name", p.name),
                      kind="embedding" if "embed" in low else "chat",
                      cost_in=ref[0] if ref else 0, cost_out=ref[1] if ref else 0,
                      context_length=ref[2] if ref else 128000, supports_vision=ref[3] if ref else False,
                      max_output=8192 if p.type == "anthropic" else 16384,
                      is_enabled=bool(ref))  # without known price: disabled until you set a price
            session.add(m)
            await session.flush()
            created += 1
        rts = (await session.execute(select(ModelRoute).where(ModelRoute.model_id == m.id))).scalars().all()
        if not any(r.provider_id == pid for r in rts):
            session.add(ModelRoute(model_id=m.id, provider_id=pid, upstream_model=mid, priority=len(rts)))
            linked += 1
    await session.commit()
    return {"created": created, "linked": linked}


# ------------------------------------------------------------------ models
class RouteIn(BaseModel):
    provider_id: int
    upstream_model: str


class ModelIn(BaseModel):
    public_id: str
    display_name: str = ""
    description: str = ""
    family: str = ""
    kind: str = "chat"
    context_length: int = 128000
    max_output: int = 4096
    supports_vision: bool = False
    supports_tools: bool = True
    is_enabled: bool = True
    cost_in: float = 0
    cost_out: float = 0
    price_in: float | None = None
    price_out: float | None = None
    cache_read_mult: float | None = Field(None, ge=0, le=10)
    cache_write_mult: float | None = Field(None, ge=0, le=10)
    routes: list[RouteIn] = []


async def model_out(m: Model, markup: float, names: dict) -> dict:
    pin, pout = sale_prices(m, markup)
    return {"id": m.id, "public_id": m.public_id, "display_name": m.display_name, "description": m.description,
            "family": m.family, "kind": m.kind, "context_length": m.context_length, "max_output": m.max_output,
            "supports_vision": m.supports_vision, "supports_tools": m.supports_tools, "is_enabled": m.is_enabled,
            "cost_in": m.cost_in, "cost_out": m.cost_out, "price_in": m.price_in, "price_out": m.price_out,
            "eff_price_in": pin, "eff_price_out": pout,
            "cache_read_mult": m.cache_read_mult, "cache_write_mult": m.cache_write_mult,
            "routes": [{"provider_id": r.provider_id, "provider": names.get(r.provider_id, "?"),
                        "upstream_model": r.upstream_model, "priority": r.priority} for r in m.routes]}


@router.get("/models")
async def list_models(session: AsyncSession = Depends(get_session)):
    g = await settings_store.get(session, "general")
    names = {p.id: p.name for p in (await session.execute(select(Provider))).scalars()}
    rows = (await session.execute(select(Model).order_by(Model.family, Model.public_id))).scalars().all()
    return [await model_out(m, g["default_markup"], names) for m in rows]


async def _apply_model(m: Model, data: ModelIn, session):
    for f in ("public_id", "display_name", "description", "family", "kind", "context_length", "max_output",
              "supports_vision", "supports_tools", "is_enabled", "cost_in", "cost_out", "price_in", "price_out",
              "cache_read_mult", "cache_write_mult"):
        setattr(m, f, getattr(data, f))
    m.public_id = m.public_id.strip()
    if not m.public_id:
        raise HTTPException(400, "ID модели обязателен")
    for r in (await session.execute(select(ModelRoute).where(ModelRoute.model_id == m.id))).scalars().all():
        await session.delete(r)
    await session.flush()
    for i, r in enumerate(data.routes):
        session.add(ModelRoute(model_id=m.id, provider_id=r.provider_id, upstream_model=r.upstream_model.strip(),
                               priority=i))


@router.post("/models")
async def create_model(data: ModelIn, session: AsyncSession = Depends(get_session)):
    if (await session.execute(select(Model).where(Model.public_id == data.public_id.strip()))).scalar_one_or_none():
        raise HTTPException(400, "Модель с таким ID уже есть")
    m = Model(public_id=data.public_id)
    session.add(m)
    await session.flush()
    await _apply_model(m, data, session)
    await session.commit()
    return {"id": m.id}


@router.put("/models/{mid}")
async def update_model(mid: int, data: ModelIn, session: AsyncSession = Depends(get_session)):
    m = await session.get(Model, mid)
    if not m:
        raise HTTPException(404)
    await _apply_model(m, data, session)
    await session.commit()
    return {"ok": True}


class ModelPatch(BaseModel):
    is_enabled: bool | None = None
    price_in: float | None = None
    price_out: float | None = None


@router.patch("/models/{mid}")
async def patch_model(mid: int, data: ModelPatch, session: AsyncSession = Depends(get_session)):
    m = await session.get(Model, mid)
    if not m:
        raise HTTPException(404)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    await session.commit()
    return {"ok": True}


@router.delete("/models/{mid}")
async def delete_model(mid: int, session: AsyncSession = Depends(get_session)):
    m = await session.get(Model, mid)
    if m:
        await session.delete(m)
        await session.commit()
    return {"ok": True}


class BulkMarkup(BaseModel):
    ids: list[int]
    markup: float | None = None  # null => reset to default markup


@router.post("/models/bulk-markup")
async def bulk_markup(data: BulkMarkup, session: AsyncSession = Depends(get_session)):
    for mid in data.ids:
        m = await session.get(Model, mid)
        if not m:
            continue
        if data.markup is None:
            m.price_in = m.price_out = None
        else:
            k = 1 + data.markup / 100
            m.price_in, m.price_out = round(m.cost_in * k, 6), round(m.cost_out * k, 6)
    await session.commit()
    return {"ok": True}


# ------------------------------------------------------------------ users
class UserPatch(BaseModel):
    name: str | None = None
    role: str | None = None
    is_blocked: bool | None = None
    markup: float | None = None
    clear_markup: bool = False


class BalanceIn(BaseModel):
    amount: float
    description: str = ""


@router.get("/users")
async def list_users(q: str = "", offset: int = 0, limit: int = 50, session: AsyncSession = Depends(get_session)):
    stmt = select(User)
    if q:
        stmt = stmt.where(or_(User.email.ilike(f"%{q}%"), User.name.ilike(f"%{q}%")))
    total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar()
    rows = (await session.execute(stmt.order_by(desc(User.id)).offset(offset).limit(min(limit, 200)))).scalars().all()
    ids = [u.id for u in rows]
    spent = dict((await session.execute(select(RequestLog.user_id, func.sum(RequestLog.price))
                                        .where(RequestLog.user_id.in_(ids)).group_by(RequestLog.user_id))).all()) if ids else {}
    return {"total": total, "items": [{**user_out(u), "spent": usd(spent.get(u.id, 0))} for u in rows]}


@router.get("/users/{uid}")
async def get_user(uid: int, session: AsyncSession = Depends(get_session)):
    u = await session.get(User, uid)
    if not u:
        raise HTTPException(404)
    keys = (await session.execute(select(ApiKey).where(ApiKey.user_id == uid))).scalars()
    tx = (await session.execute(select(Transaction).where(Transaction.user_id == uid)
                                .order_by(desc(Transaction.id)).limit(100))).scalars()
    pays = (await session.execute(select(Payment).where(Payment.user_id == uid)
                                  .order_by(desc(Payment.created_at)).limit(100))).scalars()
    st = await usage_stats(session, 30, uid)
    return {"user": user_out(u), "keys": [key_out(k) for k in keys], "usage": st,
            "transactions": [{"id": t.id, "type": t.type, "amount": usd(t.amount), "description": t.description,
                              "created_at": t.created_at.isoformat()} for t in tx],
            "payments": [payment_out(p) for p in pays]}


@router.patch("/users/{uid}")
async def patch_user(uid: int, data: UserPatch, admin: User = Depends(admin_user),
                     session: AsyncSession = Depends(get_session)):
    u = await session.get(User, uid)
    if not u:
        raise HTTPException(404)
    if uid == admin.id and (data.is_blocked or (data.role and data.role != "admin")):
        raise HTTPException(400, "Нельзя заблокировать или разжаловать самого себя")
    if data.name is not None:
        u.name = data.name
    if data.role in ("user", "admin"):
        u.role = data.role
    if data.is_blocked is not None:
        u.is_blocked = data.is_blocked
    if data.clear_markup:
        u.markup = None
    elif data.markup is not None:
        u.markup = data.markup
    await session.commit()
    return user_out(u)


@router.post("/users/{uid}/balance")
async def adjust_balance(uid: int, data: BalanceIn, admin: User = Depends(admin_user),
                         session: AsyncSession = Depends(get_session)):
    u = await session.get(User, uid)
    if not u or not data.amount:
        raise HTTPException(400, "Пользователь не найден или сумма 0")
    n = to_nano(abs(data.amount)) * (1 if data.amount > 0 else -1)
    u.balance += n
    session.add(Transaction(user_id=uid, type="adjust", amount=n,
                            description=(data.description or "Корректировка администратором") + f" ({admin.email})"))
    await session.commit()
    return user_out(u)


# ------------------------------------------------------------------ payments / transactions / logs
@router.get("/payments")
async def list_payments(status: str = "", offset: int = 0, session: AsyncSession = Depends(get_session)):
    stmt = select(Payment, User.email).join(User, User.id == Payment.user_id)
    if status:
        stmt = stmt.where(Payment.status == status)
    rows = (await session.execute(stmt.order_by(desc(Payment.created_at)).offset(offset).limit(100))).all()
    return [{**payment_out(p), "email": e} for p, e in rows]


@router.post("/payments/{pid}/check")
async def admin_check_payment(pid: str, session: AsyncSession = Depends(get_session)):
    p = await session.get(Payment, pid)
    if not p:
        raise HTTPException(404)
    return {"status": await sync_status(p, session)}


@router.get("/payments/{pid}/receipt.pdf")
async def admin_receipt(pid: str, session: AsyncSession = Depends(get_session)):
    from .api_user import receipt_response
    p = await session.get(Payment, pid)
    if not p:
        raise HTTPException(404, "Платёж не найден")
    return await receipt_response(session, p, await session.get(User, p.user_id))


@router.post("/payments/{pid}/mark-paid")
async def admin_mark_paid(pid: str):
    from .payments import credit
    ok = await credit(pid, "(вручную админом)")
    return {"ok": ok}


@router.get("/logs")
async def list_logs(q: str = "", model: str = "", status: str = "", provider_id: int | None = None,
                    offset: int = 0, limit: int = 100, session: AsyncSession = Depends(get_session)):
    stmt = select(RequestLog, User.email).outerjoin(User, User.id == RequestLog.user_id)
    if q:
        stmt = stmt.where(or_(User.email.ilike(f"%{q}%"), RequestLog.request_id == q))
    if model:
        stmt = stmt.where(RequestLog.model == model)
    if status == "ok":
        stmt = stmt.where(RequestLog.status_code < 400)
    elif status == "error":
        stmt = stmt.where(RequestLog.status_code >= 400)
    if provider_id:
        stmt = stmt.where(RequestLog.provider_id == provider_id)
    rows = (await session.execute(stmt.order_by(desc(RequestLog.id)).offset(offset).limit(min(limit, 500)))).all()
    names = {p.id: p.name for p in (await session.execute(select(Provider))).scalars()}
    return [{**log_out(r, True), "email": e, "provider": names.get(r.provider_id, "—")} for r, e in rows]


@router.get("/transactions")
async def list_transactions(offset: int = 0, session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Transaction, User.email).join(User, User.id == Transaction.user_id)
                                  .order_by(desc(Transaction.id)).offset(offset).limit(100))).all()
    return [{"id": t.id, "email": e, "user_id": t.user_id, "type": t.type, "amount": usd(t.amount),
             "description": t.description, "created_at": t.created_at.isoformat()} for t, e in rows]


# ------------------------------------------------------------------ settings
@router.get("/settings")
async def get_settings(session: AsyncSession = Depends(get_session)):
    from .config import PUBLIC_URL
    return {**settings_store.public_view(await settings_store.load_all(session)),
            "webhooks": {"platega": f"{PUBLIC_URL}/api/pay/webhook/platega",
                         "cryptobot": f"{PUBLIC_URL}/api/pay/webhook/cryptobot",
                         "github": f"{PUBLIC_URL}/api/auth/oauth/github/callback",
                         "google": f"{PUBLIC_URL}/api/auth/oauth/google/callback",
                         "site": PUBLIC_URL}}


@router.put("/settings")
async def put_settings(patch: dict, session: AsyncSession = Depends(get_session)):
    await settings_store.save(session, patch)
    return settings_store.public_view(await settings_store.load_all(session))


@router.post("/settings/test/cryptobot")
async def settings_test_cryptobot(session: AsyncSession = Depends(get_session)):
    cfg = await settings_store.get(session, "cryptobot")
    if not cfg["token"]:
        raise HTTPException(400, "Сначала сохраните токен")
    return await test_cryptobot(cfg)
