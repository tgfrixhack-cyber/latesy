"""Public status page: is each model working now, latency and error rate for the last 24 hours."""
import datetime as dt
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from . import settings_store
from .db import get_session
from .models import Model, Provider, RequestLog, now

router = APIRouter(prefix="/api/public", tags=["status"])

_cache: dict = {"t": 0.0, "data": None}
TTL = 60          # секунд кэша — страница публичная
RECENT_MIN = 30   # «сейчас» = последние 30 минут
# Ошибки сервиса — только 5xx (сбой провайдера/шлюза). 4xx — ошибки клиента (нет денег, неверный ключ, лимит) — не считаем.
IS_ERR = case((RequestLog.status_code >= 500, 1), else_=0)


def _hour_expr(dialect: str):
    if dialect == "postgresql":
        return func.to_char(RequestLog.created_at, "YYYY-MM-DD HH24")
    if dialect in ("mysql", "mariadb"):
        return func.date_format(RequestLog.created_at, "%Y-%m-%d %H")
    return func.strftime("%Y-%m-%d %H", RequestLog.created_at)


def _level(n: int, err: int) -> str:
    if not n:
        return "none"
    r = err / n
    return "down" if r >= 0.5 else "degraded" if r >= 0.1 else "ok"


async def build(session: AsyncSession) -> dict:
    t = now()
    since = (t - dt.timedelta(hours=23)).replace(minute=0, second=0, microsecond=0)
    hours = [(since + dt.timedelta(hours=i)).strftime("%Y-%m-%d %H") for i in range(24)]
    hx = _hour_expr(session.bind.dialect.name)

    models = (await session.execute(select(Model).where(Model.is_enabled == True).order_by(Model.public_id))).scalars().all()
    provs = {p.id: p for p in (await session.execute(select(Provider))).scalars().all()}
    names = [m.public_id for m in models]

    hourly = (await session.execute(
        select(RequestLog.model, hx, func.count(), func.sum(IS_ERR))
        .where(RequestLog.created_at >= since, RequestLog.model.in_(names))
        .group_by(RequestLog.model, hx))).all()
    day = (await session.execute(
        select(RequestLog.model, func.count(), func.sum(IS_ERR),
               func.avg(case((RequestLog.status_code < 400, RequestLog.latency_ms))))
        .where(RequestLog.created_at >= t - dt.timedelta(hours=24), RequestLog.model.in_(names))
        .group_by(RequestLog.model))).all()
    recent = (await session.execute(
        select(RequestLog.model, func.count(), func.sum(IS_ERR))
        .where(RequestLog.created_at >= t - dt.timedelta(minutes=RECENT_MIN), RequestLog.model.in_(names))
        .group_by(RequestLog.model))).all()

    hmap: dict = {}
    for m, h, n, e in hourly:
        hmap.setdefault(m, {})[h] = (n, int(e or 0))
    dmap = {m: (n, int(e or 0), lat) for m, n, e, lat in day}
    rmap = {m: (n, int(e or 0)) for m, n, e in recent}

    out = []
    for m in models:
        live = [provs[r.provider_id] for r in m.routes if r.provider_id in provs and provs[r.provider_id].is_enabled
                and any(k.is_enabled for k in provs[r.provider_id].keys)]
        n24, e24, lat = dmap.get(m.public_id, (0, 0, None))
        rn, re_ = rmap.get(m.public_id, (0, 0))
        if not live:
            status = "down"
        elif rn >= 3:
            status = _level(rn, re_)
        elif all(p.status == "error" for p in live):
            status = "degraded"  # фоновая проверка провайдера не прошла, а живых запросов мало
        else:
            status = "ok"
        bars = []
        for h in hours:
            n, e = hmap.get(m.public_id, {}).get(h, (0, 0))
            bars.append({"hour": h.replace(" ", "T") + ":00:00Z", "requests": n, "errors": e, "level": _level(n, e)})
        out.append({"id": m.public_id, "kind": m.kind, "status": status, "requests_24h": n24, "errors_24h": e24,
                    "error_rate": round(e24 / n24 * 100, 2) if n24 else None,
                    "uptime": round(100 - e24 / n24 * 100, 2) if n24 else None,
                    "latency_ms": int(lat) if lat is not None else None, "hours": bars})
    rank = {"down": 2, "degraded": 1, "ok": 0}
    worst = max((rank[x["status"]] for x in out), default=0)
    return {"overall": ["ok", "degraded", "down"][worst], "updated_at": t.isoformat() + "Z",
            "window_hours": 24, "models": out}


@router.get("/status")
async def public_status(session: AsyncSession = Depends(get_session)):
    g = await settings_store.get(session, "general")
    if not g.get("status_page", True):
        raise HTTPException(404, "Страница статуса отключена")
    if _cache["data"] is None or time.time() - _cache["t"] > TTL:
        _cache["data"], _cache["t"] = await build(session), time.time()
    return _cache["data"]
