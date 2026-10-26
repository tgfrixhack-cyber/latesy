"""Key/value settings editable from the admin panel. Secret fields are stored encrypted."""
import copy
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Setting
from .security import decrypt, encrypt, mask

DEFAULTS: dict = {
    "general": {
        "site_name": "kvotum",
        "registration_enabled": True,
        "default_markup": 30.0,       # % поверх себестоимости, если цена продажи не задана
        "signup_bonus_usd": 0.0,
        "rate_limit_rpm": 120,        # запросов в минуту на ключ
        "support_contact": "",
        "status_page": True,          # публичная страница статуса моделей /#/status
        "legal_info": "",             # реквизиты продавца для PDF-квитанций (ИП/ООО, ИНН, адрес)
    },
    "billing": {
        "usd_rub_rate": 95.0,         # сколько рублей зачисляется за $1 (курс продажи)
        "min_topup_rub": 100.0,
        "min_topup_usd": 1.0,
        "topup_bonus": "50:5, 200:10",  # бонус к пополнению: "от $:процент", через запятую; пусто — выкл.
    },
    "referral": {
        "enabled": True,
        "inviter_bonus_usd": 1.0,     # пригласившему
        "friend_bonus_usd": 0.5,      # приглашённому другу при регистрации
        "require_topup": True,        # бонус пригласившему — только после первого пополнения друга (защита от накруток)
    },
    "platega": {
        "enabled": False,
        "merchant_id": "",
        "secret": "",
        "base_url": "https://app.platega.io",
        "payment_method": 2,          # 2 СБП QR, 11 карты, 12 международная, 13 крипта, 14 SberPay
        "title": "СБП / Карта (Platega)",
    },
    "oauth": {
        "github_client_id": "",
        "github_client_secret": "",
        "google_client_id": "",
        "google_client_secret": "",
    },
    "cryptobot": {
        "enabled": False,
        "token": "",
        "testnet": False,
        "assets": "USDT,TON,BTC,ETH,LTC,BNB,TRX,USDC",
        "title": "Криптовалюта (CryptoBot)",
    },
}

SECRET_FIELDS = {("platega", "secret"), ("cryptobot", "token"), ("oauth", "github_client_secret"),
                 ("oauth", "google_client_secret")}

_cache: dict | None = None


async def load_all(session: AsyncSession) -> dict:
    global _cache
    if _cache is not None:
        return _cache
    data = copy.deepcopy(DEFAULTS)
    rows = (await session.execute(select(Setting))).scalars().all()
    for r in rows:
        if r.key in data:
            try:
                data[r.key].update(json.loads(r.value))
            except Exception:
                pass
    for sec, field in SECRET_FIELDS:
        v = data[sec].get(field) or ""
        if v.startswith("enc:"):
            try:
                data[sec][field] = decrypt(v[4:])
            except Exception:
                data[sec][field] = ""
    _cache = data
    return data


async def get(session: AsyncSession, section: str) -> dict:
    return (await load_all(session))[section]


def public_view(data: dict) -> dict:
    out = copy.deepcopy(data)
    for sec, field in SECRET_FIELDS:
        v = out[sec].get(field) or ""
        out[sec][field] = ""
        out[sec][field + "_set"] = bool(v)
        out[sec][field + "_mask"] = mask(v)
    return out


async def save(session: AsyncSession, patch: dict):
    global _cache
    current = await load_all(session)
    for section, values in patch.items():
        if section not in DEFAULTS or not isinstance(values, dict):
            continue
        merged = dict(current[section])
        for k, v in values.items():
            if k not in DEFAULTS[section]:
                continue
            if (section, k) in SECRET_FIELDS and (v is None or v == ""):
                continue  # empty = keep existing secret
            default = DEFAULTS[section][k]
            if isinstance(default, bool):
                v = bool(v)
            elif isinstance(default, float):
                v = float(v)
            elif isinstance(default, int):
                v = int(v)
            else:
                v = str(v).strip()
            merged[k] = v
        stored = dict(merged)
        for sec, field in SECRET_FIELDS:
            if sec == section and stored.get(field):
                stored[field] = "enc:" + encrypt(stored[field])
        row = await session.get(Setting, section)
        if row:
            row.value = json.dumps(stored)
        else:
            session.add(Setting(key=section, value=json.dumps(stored)))
    await session.commit()
    _cache = None


def invalidate():
    global _cache
    _cache = None
