"""Referral program and top-up bonus tiers."""
import hashlib
import hmac
import re

from sqlalchemy import select, update

from . import settings_store
from .billing import to_nano
from .config import SECRET_KEY
from .models import Payment, Referral, Transaction, User, now

_B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def _b36(n: int) -> str:
    s = ""
    while True:
        n, r = divmod(n, 36)
        s = _B36[r] + s
        if not n:
            return s


def _sig(uid: int) -> str:
    return hmac.new(SECRET_KEY.encode(), f"ref:{uid}".encode(), hashlib.sha256).hexdigest()[:6]


def ref_code(uid: int) -> str:
    """Short public code: base36(id) + signature, so ids can't be enumerated."""
    return f"{_b36(uid)}{_sig(uid)}"


def parse_ref(code: str | None) -> int | None:
    code = (code or "").strip().lower()
    if not re.fullmatch(r"[0-9a-z]{1,10}[0-9a-f]{6}", code):
        return None
    try:
        uid = int(code[:-6], 36)
    except ValueError:
        return None
    return uid if hmac.compare_digest(_sig(uid), code[-6:]) else None


# ------------------------------------------------------------------ top-up bonus
def parse_tiers(spec: str) -> list[tuple[float, float]]:
    """'50:5, 200:10' -> [(50, 5), (200, 10)] sorted by threshold."""
    out = []
    for part in re.split(r"[,;\n]+", spec or ""):
        m = re.fullmatch(r"\s*\$?\s*(\d+(?:[.,]\d+)?)\s*[:=]\s*(\d+(?:[.,]\d+)?)\s*%?\s*", part)
        if m:
            a, p = float(m[1].replace(",", ".")), float(m[2].replace(",", "."))
            if a > 0 and 0 < p <= 100:
                out.append((a, p))
    return sorted(out)


def tier_for(amount_usd_nano: int, tiers) -> float:
    pct = 0.0
    for a, p in tiers:
        if amount_usd_nano >= to_nano(a):
            pct = p
    return pct


def bonus_tag(pid: str) -> str:
    return f"№{pid[:8].upper()}"


async def topup_bonus(s, p: Payment) -> int:
    """Called inside credit() transaction. Returns credited bonus (nano)."""
    tiers = parse_tiers((await settings_store.get(s, "billing")).get("topup_bonus", ""))
    pct = tier_for(p.amount_usd, tiers)
    if not pct:
        return 0
    bonus = p.amount_usd * pct / 100
    bonus = int(bonus)
    await s.execute(update(User).where(User.id == p.user_id).values(balance=User.balance + bonus))
    s.add(Transaction(user_id=p.user_id, type="bonus", amount=bonus,
                      description=f"Бонус +{pct:g}% к пополнению {bonus_tag(p.id)}"))
    return bonus


async def find_topup_bonus(s, p: Payment) -> int:
    rows = (await s.execute(select(Transaction.amount).where(
        Transaction.user_id == p.user_id, Transaction.type == "bonus",
        Transaction.description.like(f"%к пополнению {bonus_tag(p.id)}")))).scalars().all()
    return int(sum(rows))


# ------------------------------------------------------------------ referrals
async def on_signup(s, user: User, code: str | None) -> int:
    """Link a freshly created user (already flushed) to its referrer. Returns friend bonus (nano)."""
    cfg = await settings_store.get(s, "referral")
    rid = parse_ref(code)
    if not cfg["enabled"] or not rid or rid == user.id:
        return 0
    ref = await s.get(User, rid)
    if not ref or ref.is_blocked:
        return 0
    fb = to_nano(cfg["friend_bonus_usd"]) if cfg["friend_bonus_usd"] > 0 else 0
    s.add(Referral(user_id=user.id, referrer_id=rid, friend_bonus=fb))
    if fb:
        user.balance = (user.balance or 0) + fb
        s.add(Transaction(user_id=user.id, type="bonus", amount=fb, description="Бонус за регистрацию по приглашению"))
    await s.flush()
    if not cfg["require_topup"]:
        await reward_inviter(s, user.id)
    return fb


async def reward_inviter(s, friend_id: int) -> int:
    """Idempotently pay the inviter once per invited friend."""
    cfg = await settings_store.get(s, "referral")
    if not cfg["enabled"] or cfg["inviter_bonus_usd"] <= 0:
        return 0
    bonus = to_nano(cfg["inviter_bonus_usd"])
    res = await s.execute(update(Referral).where(Referral.user_id == friend_id, Referral.rewarded_at.is_(None))
                          .values(rewarded_at=now(), inviter_bonus=bonus))
    if res.rowcount != 1:
        return 0
    r = await s.get(Referral, friend_id)
    inviter = await s.get(User, r.referrer_id)
    if not inviter or inviter.is_blocked:
        return 0
    friend = await s.get(User, friend_id)
    await s.execute(update(User).where(User.id == r.referrer_id).values(balance=User.balance + bonus))
    s.add(Transaction(user_id=r.referrer_id, type="bonus", amount=bonus,
                      description=f"Бонус за приглашённого друга ({mask_email(friend.email if friend else '')})"))
    return bonus


def mask_email(e: str) -> str:
    if "@" not in e:
        return "—"
    name, dom = e.split("@", 1)
    return (name[:2] + "•••" if len(name) > 2 else name[:1] + "•••") + "@" + dom
