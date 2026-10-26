"""Payment gateways: Platega (СБП/карты) and Crypto Pay (@CryptoBot / @send). Configured in admin panel."""
import hashlib
import hmac
import json

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from . import growth, settings_store
from .billing import to_nano, usd
from .config import PUBLIC_URL
from .db import SessionLocal, get_session
from .models import Payment, Transaction, User, now
from .security import current_user

router = APIRouter(prefix="/api/pay")
http = httpx.AsyncClient(timeout=30)


def cryptobot_base(cfg):
    return "https://testnet-pay.crypt.bot/api" if cfg.get("testnet") else "https://pay.crypt.bot/api"


async def methods(session) -> list[dict]:
    all_ = await settings_store.load_all(session)
    b = all_["billing"]
    out = []
    pl = all_["platega"]
    if pl["enabled"] and pl["merchant_id"] and pl["secret"]:
        out.append({"id": "platega", "title": pl["title"], "currency": "RUB", "min": b["min_topup_rub"],
                    "rate": b["usd_rub_rate"], "presets": [300, 500, 1000, 3000, 5000]})
    cb = all_["cryptobot"]
    if cb["enabled"] and cb["token"]:
        out.append({"id": "cryptobot", "title": cb["title"], "currency": "USD", "min": b["min_topup_usd"],
                    "rate": 1, "presets": [5, 10, 25, 50, 100]})
    return out


async def credit(payment_id: str, note: str = "") -> bool:
    """Idempotently mark payment paid and credit balance."""
    async with SessionLocal() as s:
        res = await s.execute(update(Payment).where(Payment.id == payment_id, Payment.status == "pending")
                              .values(status="paid", paid_at=now()))
        if res.rowcount != 1:
            await s.rollback()
            return False
        p = await s.get(Payment, payment_id)
        await s.execute(update(User).where(User.id == p.user_id).values(balance=User.balance + p.amount_usd))
        s.add(Transaction(user_id=p.user_id, type="topup", amount=p.amount_usd,
                          description=f"Пополнение {p.amount:g} {p.currency} ({p.method}) {note}".strip()))
        await growth.topup_bonus(s, p)
        await growth.reward_inviter(s, p.user_id)
        await s.commit()
        return True


async def cancel(payment_id: str):
    async with SessionLocal() as s:
        await s.execute(update(Payment).where(Payment.id == payment_id, Payment.status == "pending")
                        .values(status="canceled"))
        await s.commit()


async def chargeback(payment_id: str):
    async with SessionLocal() as s:
        res = await s.execute(update(Payment).where(Payment.id == payment_id, Payment.status == "paid")
                              .values(status="refunded"))
        if res.rowcount == 1:
            p = await s.get(Payment, payment_id)
            bonus = await growth.find_topup_bonus(s, p)
            await s.execute(update(User).where(User.id == p.user_id).values(balance=User.balance - p.amount_usd - bonus))
            if bonus:
                s.add(Transaction(user_id=p.user_id, type="refund", amount=-bonus,
                                  description=f"Отмена бонуса к пополнению {growth.bonus_tag(p.id)}"))
            s.add(Transaction(user_id=p.user_id, type="refund", amount=-p.amount_usd,
                              description=f"Возврат платежа {p.method} {p.external_id}"))
        await s.commit()


class CreateIn(BaseModel):
    method: str
    amount: float


@router.get("/methods")
async def get_methods(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    return await methods(session)


@router.post("/create")
async def create(data: CreateIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    m = next((x for x in await methods(session) if x["id"] == data.method), None)
    if not m:
        raise HTTPException(400, "Способ оплаты недоступен")
    if data.amount < m["min"] or data.amount > 1_000_000:
        raise HTTPException(400, f"Минимальная сумма {m['min']:g} {m['currency']}")
    amount = round(data.amount, 2)
    amount_usd = to_nano(amount / m["rate"]) if m["currency"] == "RUB" else to_nano(amount)
    pay = Payment(user_id=user.id, method=data.method, amount=amount, currency=m["currency"], amount_usd=amount_usd)
    session.add(pay)
    await session.flush()
    all_ = await settings_store.load_all(session)
    site = all_["general"]["site_name"]
    return_url = f"{PUBLIC_URL}/#/billing?payment={pay.id}"
    try:
        if data.method == "platega":
            cfg = all_["platega"]
            r = await http.post(cfg["base_url"].rstrip("/") + "/transaction/process",
                                headers={"X-MerchantId": cfg["merchant_id"], "X-Secret": cfg["secret"]},
                                json={"paymentMethod": int(cfg["payment_method"]),
                                      "paymentDetails": {"amount": amount, "currency": "RUB"},
                                      "description": f"Пополнение баланса {site} ({user.email})",
                                      "return": return_url, "failedUrl": return_url,
                                      "payload": pay.id, "orderId": pay.id,
                                      "metadata": {"userId": str(user.id), "userName": user.email}})
            j = r.json() if r.content else {}
            if r.status_code >= 400 or not j.get("redirect"):
                raise HTTPException(502, f"Platega: {r.status_code} {r.text[:300]}")
            pay.external_id, pay.pay_url = str(j.get("transactionId", "")), j["redirect"]
        else:
            cfg = all_["cryptobot"]
            r = await http.post(cryptobot_base(cfg) + "/createInvoice",
                                headers={"Crypto-Pay-API-Token": cfg["token"]},
                                json={"currency_type": "fiat", "fiat": "USD", "amount": f"{amount:.2f}",
                                      "accepted_assets": cfg["assets"],
                                      "description": f"Пополнение баланса {site}"[:1024],
                                      "payload": pay.id, "paid_btn_name": "callback",
                                      "paid_btn_url": return_url, "expires_in": 3600})
            j = r.json()
            if not j.get("ok"):
                raise HTTPException(502, f"CryptoBot: {j.get('error')}")
            res = j["result"]
            pay.external_id = str(res["invoice_id"])
            pay.pay_url = res.get("bot_invoice_url") or res.get("web_app_invoice_url") or res.get("pay_url")
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Платёжная система недоступна: {e}")
    await session.commit()
    return {"payment_id": pay.id, "pay_url": pay.pay_url, "amount_usd": usd(amount_usd)}


async def sync_status(pay: Payment, session) -> str:
    """Poll provider for payment status (fallback when webhook didn't arrive)."""
    if pay.status != "pending" or not pay.external_id:
        return pay.status
    all_ = await settings_store.load_all(session)
    try:
        if pay.method == "platega":
            cfg = all_["platega"]
            r = await http.get(cfg["base_url"].rstrip("/") + f"/transaction/{pay.external_id}",
                               headers={"X-MerchantId": cfg["merchant_id"], "X-Secret": cfg["secret"]})
            st = (r.json() or {}).get("status", "") if r.status_code == 200 else ""
            if st == "CONFIRMED":
                await credit(pay.id, "(проверка статуса)")
                return "paid"
            if st == "CANCELED":
                await cancel(pay.id)
                return "canceled"
        elif pay.method == "cryptobot":
            cfg = all_["cryptobot"]
            r = await http.get(cryptobot_base(cfg) + "/getInvoices",
                               headers={"Crypto-Pay-API-Token": cfg["token"]},
                               params={"invoice_ids": pay.external_id})
            items = ((r.json() or {}).get("result") or {}).get("items") or []
            st = items[0]["status"] if items else ""
            if st == "paid":
                await credit(pay.id, "(проверка статуса)")
                return "paid"
            if st == "expired":
                await cancel(pay.id)
                return "canceled"
    except Exception:
        pass
    return "pending"


@router.get("/{payment_id}/check")
async def check(payment_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    pay = await session.get(Payment, payment_id)
    if not pay or pay.user_id != user.id:
        raise HTTPException(404, "Платёж не найден")
    status = await sync_status(pay, session)
    return {"status": status}


# ------------------------------------------------------------------ webhooks
@router.post("/webhook/platega")
async def webhook_platega(request: Request, session: AsyncSession = Depends(get_session)):
    cfg = await settings_store.get(session, "platega")
    mid, sec = request.headers.get("x-merchantid", ""), request.headers.get("x-secret", "")
    if not cfg["secret"] or not (hmac.compare_digest(mid, cfg["merchant_id"]) and hmac.compare_digest(sec, cfg["secret"])):
        raise HTTPException(401, "bad signature")
    body = await request.json()
    low = {k.lower(): v for k, v in body.items()}
    ext, status, payload = str(low.get("id") or low.get("transactionid") or ""), str(low.get("status", "")).upper(), \
        str(low.get("payload") or "")
    pay = None
    if payload:
        pay = await session.get(Payment, payload)
    if not pay and ext:
        pay = (await session.execute(select(Payment).where(Payment.external_id == ext))).scalar_one_or_none()
    if not pay:
        return {"ok": True, "note": "unknown payment"}
    if status == "CONFIRMED":
        await credit(pay.id, "(webhook)")
    elif status == "CANCELED":
        await cancel(pay.id)
    elif status == "CHARGEBACKED":
        await chargeback(pay.id)
    return {"ok": True}


@router.post("/webhook/cryptobot")
async def webhook_cryptobot(request: Request, session: AsyncSession = Depends(get_session)):
    cfg = await settings_store.get(session, "cryptobot")
    raw = await request.body()
    sig = request.headers.get("crypto-pay-api-signature", "")
    if not cfg["token"]:
        raise HTTPException(401, "not configured")
    secret = hashlib.sha256(cfg["token"].encode()).digest()
    expected = hmac.new(secret, raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(401, "bad signature")
    data = json.loads(raw)
    if data.get("update_type") == "invoice_paid":
        inv = data.get("payload") or {}
        pid = inv.get("payload") or ""
        pay = await session.get(Payment, pid) if pid else None
        if not pay:
            pay = (await session.execute(select(Payment).where(
                Payment.external_id == str(inv.get("invoice_id"))))).scalar_one_or_none()
        if pay and inv.get("status") == "paid":
            await credit(pay.id, "(webhook)")
    return {"ok": True}


async def test_cryptobot(cfg) -> dict:
    r = await http.get(cryptobot_base(cfg) + "/getMe", headers={"Crypto-Pay-API-Token": cfg["token"]})
    j = r.json()
    if not j.get("ok"):
        raise HTTPException(400, f"CryptoBot: {j.get('error')}")
    return {"ok": True, "info": j["result"]}
