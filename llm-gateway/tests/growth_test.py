"""Run after e2e.py: referral program + top-up bonus tiers (uses platega webhook from e2e settings)."""
import uuid
from sqlite3 import connect

import httpx

B = "http://127.0.0.1:8000"
c = httpx.Client(base_url=B, timeout=30)
db = connect("data_test/gateway.db")


def ok(r):
    assert r.status_code < 400, (r.status_code, r.text)
    return r.json()


def login(e, p):
    return {"Authorization": "Bearer " + ok(c.post("/api/auth/login", json={"email": e, "password": p}))["token"]}


A = login("admin@test.io", "adminpass123")
UH = login("user@test.io", "userpass123")
bal = lambda h: ok(c.get("/api/me", headers=h))["balance"]
txs = lambda h: ok(c.get("/api/me/transactions", headers=h))


def pay(uid, usd_amount, ext):
    pid = str(uuid.uuid4())
    db.execute("insert into payments(id,user_id,method,amount,currency,amount_usd,status,external_id,pay_url,created_at)"
               " values(?,?,?,?,?,?,?,?,?,datetime('now'))",
               (pid, uid, "platega", usd_amount * 95, "RUB", int(usd_amount * 10**9), "pending", ext, ""))
    db.commit()
    for _ in range(2):  # idempotent
        ok(c.post("/api/pay/webhook/platega", headers={"X-MerchantId": "m-1", "X-Secret": "s3cr3t"},
                  json={"id": ext, "status": "CONFIRMED", "payload": pid}))
    return pid


cfg = ok(c.get("/api/public/config"))
assert cfg["topup_bonus"] == [[50.0, 5.0], [200.0, 10.0]] and cfg["referral"]["friend_bonus"] == 0.5, cfg
ref = ok(c.get("/api/me/referral", headers=UH))
assert ref["invited"] == 0 and ref["link"].endswith(ref["code"]), ref
inviter0 = bal(UH)

# bad / tampered codes give nothing
for i, code in enumerate(["", "zzz", ref["code"][:-1] + ("0" if ref["code"][-1] != "0" else "1")]):
    r = ok(c.post("/api/auth/register", json={"email": f"nobody{i}@test.io", "password": "password123", "ref": code}))
    assert r["user"]["balance"] == 0, (code, r["user"])

# friend via link: +$0.5 now, inviter waits for first top-up
f = ok(c.post("/api/auth/register", json={"email": "friend@test.io", "password": "password123", "ref": ref["code"].upper()}))
FH = {"Authorization": "Bearer " + f["token"]}
assert abs(bal(FH) - 0.5) < 1e-9 and bal(UH) == inviter0
ref = ok(c.get("/api/me/referral", headers=UH))
assert ref["invited"] == 1 and ref["rewarded"] == 0 and ref["friends"][0]["email"] == "fr•••@test.io", ref

# small top-up: no tier bonus, but inviter rewarded once
pay(f["user"]["id"], 10, "g-1")
assert abs(bal(FH) - 10.5) < 1e-9, bal(FH)
assert abs(bal(UH) - inviter0 - 1) < 1e-9
# $60 top-up: +5%, inviter not rewarded twice
p60 = pay(f["user"]["id"], 60, "g-2")
assert abs(bal(FH) - 73.5) < 1e-9, bal(FH)
assert abs(bal(UH) - inviter0 - 1) < 1e-9
# $200: +10%
pay(f["user"]["id"], 200, "g-3")
assert abs(bal(FH) - 293.5) < 1e-9, bal(FH)
print("friend txs:", [(t["type"], t["amount"], t["description"]) for t in txs(FH)][:4])
ref = ok(c.get("/api/me/referral", headers=UH))
assert ref["rewarded"] == 1 and ref["earned"] == 1.0, ref

# receipt shows bonus
pdf = ok_bytes = c.get(f"/api/me/payments/{p60}/receipt.pdf", headers=FH)
assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
open("/tmp/receipt_bonus.pdf", "wb").write(pdf.content)

# instant reward mode
ok(c.put("/api/admin/settings", headers=A, json={"referral": {"require_topup": False}}))
before = bal(UH)
ok(c.post("/api/auth/register", json={"email": "friend2@test.io", "password": "password123", "ref": ref["code"]}))
assert abs(bal(UH) - before - 1) < 1e-9
# disabled program
ok(c.put("/api/admin/settings", headers=A, json={"referral": {"enabled": False, "require_topup": True}}))
r = ok(c.post("/api/auth/register", json={"email": "friend3@test.io", "password": "password123", "ref": ref["code"]}))
assert r["user"]["balance"] == 0
ok(c.put("/api/admin/settings", headers=A, json={"referral": {"enabled": True}, "billing": {"topup_bonus": ""}}))
assert ok(c.get("/api/public/config"))["topup_bonus"] == []
ok(c.put("/api/admin/settings", headers=A, json={"billing": {"topup_bonus": "50:5, 200:10"}}))
print("GROWTH OK")
