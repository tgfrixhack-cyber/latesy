import asyncio
import datetime as dt
from decimal import ROUND_CEILING, Decimal

from sqlalchemy import update

from .adapters import Usage
from .db import SessionLocal
from .models import NANO, ApiKey, Model, ProviderKey, RequestLog, User, now


def to_nano(usd) -> int:
    return int((Decimal(str(usd)) * NANO).to_integral_value(rounding=ROUND_CEILING))


def usd(n: int | None) -> float:
    return round(int(n or 0) / NANO, 9)


def sale_prices(model: Model, markup: float) -> tuple[float, float]:
    k = 1 + (markup or 0) / 100
    pin = model.price_in if model.price_in is not None else model.cost_in * k
    pout = model.price_out if model.price_out is not None else model.cost_out * k
    return round(pin, 6), round(pout, 6)


def calc(tokens_in: int, tokens_out: int, per_in: float, per_out: float) -> int:
    v = (Decimal(tokens_in) * Decimal(str(per_in)) + Decimal(tokens_out) * Decimal(str(per_out))) \
        / Decimal(1_000_000) * NANO
    return int(v.to_integral_value(rounding=ROUND_CEILING))


CACHE_MULTS = {"anthropic": (0.1, 1.25)}  # Anthropic: cache reads cost 10% of the input price, 5-minute writes 125%
# Others: the smallest discount among them (OpenAI 50–90%, DeepSeek and Gemini 75–90%), so the recorded cost of
# cached tokens is never below what the provider charges. Admins can set exact shares per model.
DEFAULT_CACHE_MULTS = (0.5, 1.0)
CACHE_WRITE_1H = 2.0  # Anthropic 1-hour cache writes, share of the input price


def cache_mults(model: Model, provider_type: str | None) -> tuple[float, float]:
    r, w = CACHE_MULTS.get(provider_type or "", DEFAULT_CACHE_MULTS)
    return (model.cache_read_mult if model.cache_read_mult is not None else r,
            model.cache_write_mult if model.cache_write_mult is not None else w)


def calc_usage(u: Usage, per_in: float, per_out: float, read_mult: float = 1.0, write_mult: float = 1.0) -> int:
    """calc() with cached input tokens priced at their share of the input price."""
    d = lambda x: Decimal(str(x))
    plain = max(0, u.tin - u.cache_read - u.cache_write - u.cache_write_1h)
    tin = d(plain) + d(u.cache_read) * d(read_mult) + d(u.cache_write) * d(write_mult) + d(u.cache_write_1h) * d(CACHE_WRITE_1H)
    v = (tin * d(per_in) + d(u.tout) * d(per_out)) / Decimal(1_000_000) * NANO
    return int(v.to_integral_value(rounding=ROUND_CEILING))


_bg: set = set()


async def record(*, request_id, user_id, api_key_id, model_name, provider_id, provider_key_id, endpoint,
                 stream, tokens_in, tokens_out, cost, price, latency_ms, status_code, error="", ip="",
                 attempts=1, cache_read=0, cache_write=0):
    """Persist request log and atomically charge balance."""
    async with SessionLocal() as s:
        s.add(RequestLog(request_id=request_id, user_id=user_id, api_key_id=api_key_id, model=model_name,
                         provider_id=provider_id, provider_key_id=provider_key_id, endpoint=endpoint,
                         stream=stream, prompt_tokens=tokens_in, completion_tokens=tokens_out,
                         cache_read_tokens=cache_read, cache_write_tokens=cache_write, cost=cost,
                         price=price, latency_ms=latency_ms, status_code=status_code, error=error[:2000],
                         ip=ip, attempts=attempts))
        if price and user_id:
            await s.execute(update(User).where(User.id == user_id).values(balance=User.balance - price))
        if api_key_id:
            await s.execute(update(ApiKey).where(ApiKey.id == api_key_id)
                            .values(spent=ApiKey.spent + price, period_spent=ApiKey.period_spent + price,
                                    last_used_at=now()))
        if provider_key_id and status_code < 400:
            await s.execute(update(ProviderKey).where(ProviderKey.id == provider_key_id)
                            .values(uses=ProviderKey.uses + 1, spent=ProviderKey.spent + cost,
                                    last_used_at=now()))
        await s.commit()


def record_bg(**kw):
    """Fire-and-forget (survives client disconnects)."""
    t = asyncio.get_running_loop().create_task(record(**kw))
    _bg.add(t)
    t.add_done_callback(_bg.discard)
