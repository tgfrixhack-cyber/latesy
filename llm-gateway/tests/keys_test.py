"""Run after e2e.py (DATA_DIR=data_test): key restrictions — limit per day/month, allowed models, expiry, own rate
limit — plus /v1/balance readiness and amounts in rubles."""
import datetime as dt
import sqlite3
import uuid

import httpx

B = "http://127.0.0.1:8000"
c = httpx.Client(base_url=B, timeout=30)
db = sqlite3.connect("data_test/gateway.db")


def ok(r):
    assert r.status_code < 400, (r.request.url, r.status_code, r.text)
    return r.json()


def chat(key, model="gpt-4o-mini"):
    return c.post("/v1/chat/completions", headers={"Authorization": f"Bearer {key}"},
                  json={"model": model, "messages": [{"role": "user", "content": "hi"}]})


A = {"Authorization": "Bearer " + ok(c.post("/api/auth/login", json={"email": "admin@test.io", "password": "adminpass123"}))["token"]}
UH = {"Authorization": "Bearer " + ok(c.post("/api/auth/login", json={"email": "user@test.io", "password": "userpass123"}))["token"]}
rate = ok(c.get("/api/public/config"))["usd_rub_rate"]
tomorrow = (dt.datetime.utcnow() + dt.timedelta(hours=3) + dt.timedelta(days=1)).date().isoformat()

# ---------------------------------------------------------------- create with every restriction
k = ok(c.post("/api/me/keys", headers=UH, json={"name": "restricted", "spend_limit": 0.0000001, "limit_period": "day",
                                                 "allowed_models": ["gpt-4o-mini", "gpt-4o-mini"], "expires_on": tomorrow, "rpm_limit": 3}))
key, kid = k["key"], k["id"]
assert (k["limit_period"], k["allowed_models"], k["expires_on"], k["rpm_limit"], k["period_spent"], k["expired"]) == \
    ("day", ["gpt-4o-mini"], tomorrow, 3, 0, False), k
assert k["limit_resets_at"] and k["limit_resets_at"].endswith("21:00:00"), k["limit_resets_at"]  # midnight in Moscow
for bad in ({"allowed_models": ["no-such-model"]}, {"expires_on": "2020-01-01"}, {"limit_period": "week"}, {"rpm_limit": 0}):
    r = c.post("/api/me/keys", headers=UH, json={"name": "bad", **bad})
    assert r.status_code in (400, 422), (bad, r.status_code, r.text)

# allowed models: other models refused, /v1/models filtered for this key only
r = chat(key, "gpt-4o")
assert r.status_code == 403 and r.json()["error"]["code"] == "model_not_allowed" and "gpt-4o-mini" in r.json()["error"]["message"], r.text
assert [m["id"] for m in ok(c.get("/v1/models", headers={"Authorization": f"Bearer {key}"}))["data"]] == ["gpt-4o-mini"]
assert len(ok(c.get("/v1/models"))["data"]) > 1

# day limit: the first request may cross it, the next one is refused until the next Moscow midnight
assert chat(key).status_code == 200
r = chat(key)
e = r.json()["error"]
assert r.status_code == 402 and e["code"] == "key_limit_reached" and "дневной лимит" in e["message"] and "по Москве" in e["message"], r.text
assert "₽" in e["message"] and "$" not in e["message"], e["message"]
b = ok(c.get("/v1/balance", headers={"Authorization": f"Bearer {key}"}))
assert b["ready"] is False and "дневной лимит" in b["problem"] and b["key_period_spent_usd"] > 0 and b["key_allowed_models"] == ["gpt-4o-mini"]
assert abs(b["balance_rub"] - round(b["balance_usd"] * rate, 2)) < 0.01
row = next(x for x in ok(c.get("/api/me/keys", headers=UH)) if x["id"] == kid)
assert row["period_spent"] == row["spent"] > 0

# yesterday's spend does not count: the period rolls over on the next request
db.execute("update api_keys set period_start = ? where id = ?", ((dt.datetime.utcnow() - dt.timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S.%f"), kid)); db.commit()
row = next(x for x in ok(c.get("/api/me/keys", headers=UH)) if x["id"] == kid)
assert row["period_spent"] == 0, row
assert chat(key).status_code == 200

# switching to a monthly limit counts what was already spent this month
r = ok(c.patch(f"/api/me/keys/{kid}", headers=UH, json={"limit_period": "month", "spend_limit": 1}))
assert r["limit_period"] == "month" and abs(r["period_spent"] - r["spent"]) < 1e-9 and r["spent"] > 0, r
# a partial update leaves the other restrictions alone
r = ok(c.patch(f"/api/me/keys/{kid}", headers=UH, json={"is_active": True}))
assert (r["spend_limit"], r["allowed_models"], r["expires_on"], r["rpm_limit"]) == (1, ["gpt-4o-mini"], tomorrow, 3), r

# own rate limit: 3 per minute for this key (2 requests above were in the same minute)
codes = [chat(key).status_code for _ in range(3)]
assert 429 in codes, codes
r = ok(c.patch(f"/api/me/keys/{kid}", headers=UH, json={"rpm_limit": None, "allowed_models": [], "spend_limit": None, "expires_on": None}))
assert (r["rpm_limit"], r["allowed_models"], r["spend_limit"], r["expires_on"]) == (None, [], None, None), r
assert chat(key, "gpt-4o").status_code == 200

# expiry: refused after the last day, with the date in Moscow time
db.execute("update api_keys set expires_at = ? where id = ?", ((dt.datetime.utcnow() - dt.timedelta(minutes=1)).strftime("%Y-%m-%d %H:%M:%S.%f"), kid)); db.commit()
r = chat(key)
assert r.status_code == 401 and r.json()["error"]["code"] == "key_expired" and "по Москве" in r.json()["error"]["message"], r.text
assert next(x for x in ok(c.get("/api/me/keys", headers=UH)) if x["id"] == kid)["expired"] is True
assert c.patch(f"/api/me/keys/{kid}", headers=UH, json={"expires_on": "2020-01-01"}).status_code == 400

# ---------------------------------------------------------------- amounts in rubles for an empty balance
email = f"keys-{uuid.uuid4().hex[:6]}@test.io"
u = ok(c.post("/api/auth/register", json={"email": email, "password": "keyspass123"}))
k2 = ok(c.post("/api/me/keys", headers={"Authorization": "Bearer " + u["token"]}, json={"name": "empty"}))["key"]
r = chat(k2)
assert r.status_code == 402 and "на балансе 0 ₽" in r.json()["error"]["message"], r.text
b = ok(c.get("/v1/balance", headers={"Authorization": f"Bearer {k2}"}))
assert b["ready"] is False and b["balance_rub"] == 0 and "Недостаточно средств" in b["problem"]

csv = c.get("/api/me/usage.csv?days=30", headers=UH)
assert csv.status_code == 200 and "Стоимость, ₽" in csv.text.splitlines()[0]
print("KEYS OK")
