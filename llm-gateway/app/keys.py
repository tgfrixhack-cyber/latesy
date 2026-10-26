"""API key restrictions: spending limit per period, allowed models, expiry date and the key's own rate limit.

Days and months follow Moscow time (UTC+3, no daylight saving), as the service's customers do."""
import datetime as dt
import json

from sqlalchemy import func, or_, select, update

from . import errors
from .models import NANO, ApiKey, RequestLog, User, now

MSK = dt.timedelta(hours=3)
PERIODS = ("total", "day", "month")
PERIOD_TEXT = {"day": "дневной", "month": "месячный"}


def period_start(period: str, t: dt.datetime | None = None) -> dt.datetime | None:
    """Start of the current day or month in naive UTC, None for a lifetime limit."""
    if period not in ("day", "month"):
        return None
    m = ((t or now()) + MSK).replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "month":
        m = m.replace(day=1)
    return m - MSK


def next_reset(period: str, t: dt.datetime | None = None) -> dt.datetime | None:
    s = period_start(period, t)
    if s is None:
        return None
    m = s + MSK
    m = m + dt.timedelta(days=1) if period == "day" else (m.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    return m - MSK


def expires_at_of(day: dt.date) -> dt.datetime:
    """A key valid «until 31.12» works through that whole day in Moscow."""
    return dt.datetime.combine(day + dt.timedelta(days=1), dt.time()) - MSK


def expires_on_of(at: dt.datetime | None) -> str | None:
    return ((at + MSK) - dt.timedelta(days=1)).date().isoformat() if at else None


def models_of(k: ApiKey) -> list[str]:
    try:
        v = json.loads(k.allowed_models or "[]")
    except ValueError:
        return []
    return [x for x in v if isinstance(x, str)] if isinstance(v, list) else []


def current_spent(k: ApiKey, t: dt.datetime | None = None) -> int:
    """Spend counted against the limit: lifetime, or the current day / month (0 if it has not been rolled yet)."""
    ps = period_start(k.limit_period, t)
    if ps is None:
        return k.spent or 0
    return 0 if k.period_start is None or k.period_start < ps else (k.period_spent or 0)


async def roll_period(s, k: ApiKey) -> int:
    """Start a new day or month for the key when the current one is over; returns current_spent()."""
    ps = period_start(k.limit_period)
    if ps is not None and (k.period_start is None or k.period_start < ps):
        # conditional, so concurrent requests reset the counter once and keep each other's charges
        await s.execute(update(ApiKey).where(ApiKey.id == k.id, or_(ApiKey.period_start.is_(None), ApiKey.period_start < ps))
                        .values(period_start=ps, period_spent=0))
        await s.commit()
        await s.refresh(k)
    return current_spent(k)


async def spent_since(s, key_id: int, since: dt.datetime | None) -> int:
    if since is None:
        return 0
    return int((await s.execute(select(func.coalesce(func.sum(RequestLog.price), 0))
                                .where(RequestLog.api_key_id == key_id, RequestLog.created_at >= since))).scalar() or 0)


def rub_text(nano: int | None, rate: float) -> str:
    """User-facing amount: balances are kept in USD and shown in rubles at the top-up rate."""
    s = f"{(nano or 0) / NANO * rate:,.2f}".replace(",", " ").replace(".", ",")
    return s.removesuffix(",00") + " ₽"


def msk_text(t: dt.datetime) -> str:
    return (t + MSK).strftime("%d.%m.%Y %H:%M")


def problem(k: ApiKey, user: User | None, rate: float, spent: int) -> tuple | None:
    """First reason the key cannot make paid requests, as GatewayError arguments (status, message, type, code)."""
    if not k.is_active:
        return (401, f"API-ключ «{k.name}» отключён. Включите его или создайте новый: {errors.KEYS_URL}",
                "authentication_error", "invalid_api_key")
    if k.expires_at and k.expires_at <= now():
        return (401, f"Срок действия ключа «{k.name}» закончился {msk_text(k.expires_at)} по Москве. Продлите его или "
                     f"создайте новый: {errors.KEYS_URL}", "authentication_error", "key_expired")
    if not user or user.is_blocked:
        return 403, "Аккаунт заблокирован. Обратитесь в поддержку.", "permission_error", "account_blocked"
    if user.balance <= 0:
        return (402, f"Недостаточно средств: на балансе {rub_text(user.balance, rate)}. Пополните баланс: "
                     f"{errors.BILLING_URL}", "insufficient_quota", "insufficient_balance")
    if k.spend_limit is not None and spent >= k.spend_limit:
        used = f"{rub_text(spent, rate)} из {rub_text(k.spend_limit, rate)}"
        if k.limit_period in PERIOD_TEXT:
            msg = (f"Ключ «{k.name}» израсходовал {PERIOD_TEXT[k.limit_period]} лимит: {used}. Лимит обновится "
                   f"{msk_text(next_reset(k.limit_period))} по Москве, увеличить его можно здесь: {errors.KEYS_URL}")
        else:
            msg = f"Ключ «{k.name}» израсходовал свой лимит: {used}. Увеличьте лимит: {errors.KEYS_URL}"
        return 402, msg, "insufficient_quota", "key_limit_reached"
    return None
