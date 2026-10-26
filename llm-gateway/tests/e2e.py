import json, sys, time, httpx
B = "http://127.0.0.1:8000"; U = "http://127.0.0.1:9001"
c = httpx.Client(base_url=B, timeout=30)
def ok(r):
    assert r.status_code < 400, (r.status_code, r.text); return r.json()
adm = ok(c.post("/api/auth/login", json={"email": "admin@test.io", "password": "adminpass123"}))
A = {"Authorization": "Bearer " + adm["token"]}
assert adm["user"]["role"] == "admin"
# providers
p_bad = ok(c.post("/api/admin/providers", headers=A, json={"name": "Bad", "preset": "openai", "type": "openai", "base_url": U + "/bad/v1", "priority": 1, "api_keys": ["sk-up-bad"]}))
p_oa = ok(c.post("/api/admin/providers", headers=A, json={"name": "OpenAI", "preset": "openai", "type": "openai", "base_url": U + "/oa/v1", "priority": 10, "api_keys": ["sk-up-1", "sk-up-2"]}))
p_an = ok(c.post("/api/admin/providers", headers=A, json={"name": "Anthropic", "preset": "anthropic", "type": "anthropic", "base_url": U + "/an/v1", "api_keys": ["sk-up-anthropic"]}))
assert ok(c.post(f"/api/admin/providers/{p_oa['id']}/test", headers=A))["ok"]
assert not ok(c.post(f"/api/admin/providers/{p_bad['id']}/test", headers=A))["ok"]
rm = ok(c.get(f"/api/admin/providers/{p_oa['id']}/remote-models", headers=A)); print("remote", [m["id"] for m in rm])
print(ok(c.post(f"/api/admin/providers/{p_oa['id']}/import", headers=A, json={"models": ["gpt-4o-mini", "gpt-4o", "text-embedding-3-small"]})))
print(ok(c.post(f"/api/admin/providers/{p_an['id']}/import", headers=A, json={"models": ["claude-sonnet-4-5-20250929"]})))
ms = ok(c.get("/api/admin/models", headers=A)); mm = {m["public_id"]: m for m in ms}
# make gpt-4o route bad provider first -> fallback
g4 = mm["gpt-4o"]
body = {k: g4[k] for k in ["public_id","display_name","description","family","kind","context_length","max_output","supports_vision","supports_tools","is_enabled","cost_in","cost_out","price_in","price_out"]}
body["routes"] = [{"provider_id": p_bad["id"], "upstream_model": "gpt-4o"}, {"provider_id": p_oa["id"], "upstream_model": "gpt-4o"}]
ok(c.put(f"/api/admin/models/{g4['id']}", headers=A, json=body))
# rename claude public id
cl = mm["claude-sonnet-4-5-20250929"]; b2 = {k: cl[k] for k in body if k != "routes"}; b2["public_id"] = "claude-sonnet-4-5"; b2["routes"] = [{"provider_id": p_an["id"], "upstream_model": "claude-sonnet-4-5-20250929"}]
ok(c.put(f"/api/admin/models/{cl['id']}", headers=A, json=b2))
# user
u = ok(c.post("/api/auth/register", json={"email": "user@test.io", "password": "userpass123"}))
UH = {"Authorization": "Bearer " + u["token"]}; key = u["first_key"]; K = {"Authorization": "Bearer " + key}
r = c.post("/v1/chat/completions", headers=K, json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]})
assert r.status_code == 402, r.text; print("402 ok:", r.json()["error"]["message"])
ok(c.post(f"/api/admin/users/{u['user']['id']}/balance", headers=A, json={"amount": 10, "description": "test"}))
r = ok(c.post("/v1/chat/completions", headers=K, json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]}))
print("chat:", r["choices"][0]["message"]["content"], r["model"], r["usage"])
r = c.post("/v1/chat/completions", headers=K, json={"model": "gpt-4o", "messages": [{"role": "user", "content": "hi"}]})
print("fallback:", r.status_code, r.json()["choices"][0]["message"]["content"], "X-Cost", r.headers.get("x-cost"))
# stream openai
with c.stream("POST", "/v1/chat/completions", headers=K, json={"model": "gpt-4o-mini", "stream": True, "messages": [{"role": "user", "content": "hi"}]}) as s:
    lines = [l for l in s.iter_lines() if l.startswith("data:")]
print("oa stream:", len(lines), lines[-1], "usage chunk leaked?", any('"usage"' in l for l in lines))
# anthropic via openai format
r = ok(c.post("/v1/chat/completions", headers=K, json={"model": "claude-sonnet-4-5", "messages": [{"role": "system", "content": "be nice"}, {"role": "user", "content": "weather?"}],
          "tools": [{"type": "function", "function": {"name": "get_weather", "parameters": {"type": "object", "properties": {"city": {"type": "string"}}}}}]}))
print("anth conv:", json.dumps(r["choices"][0], ensure_ascii=False), r["usage"])
with c.stream("POST", "/v1/chat/completions", headers=K, json={"model": "claude-sonnet-4-5", "stream": True, "stream_options": {"include_usage": True}, "messages": [{"role": "user", "content": "hi"}]}) as s:
    lines = [l for l in s.iter_lines() if l.startswith("data:")]
txt = "".join((json.loads(l[5:])["choices"][0]["delta"].get("content") or "") for l in lines if l != "data: [DONE]" and json.loads(l[5:])["choices"])
print("anth stream text:", repr(txt), "last:", lines[-2][:120], lines[-1])
r = ok(c.post("/v1/messages", headers={"x-api-key": key}, json={"model": "claude-sonnet-4-5", "max_tokens": 100, "messages": [{"role": "user", "content": "hi"}]}))
print("native messages:", r["model"], r["usage"])
r = ok(c.post("/v1/embeddings", headers=K, json={"model": "text-embedding-3-small", "input": "hi"})); print("emb", r["usage"])
print("models:", [m["id"] for m in ok(c.get("/v1/models"))["data"]])
time.sleep(0.5)
me = ok(c.get("/api/me", headers=UH)); print("balance after:", me["balance"])
st = ok(c.get("/api/admin/stats?days=7", headers=A)); print("stats totals:", st["totals"])
logs = ok(c.get("/api/admin/logs", headers=A)); print("logs:", [(l["model"], l["status_code"], l["attempts"], l["price"]) for l in logs][:12])
provs = ok(c.get("/api/admin/providers", headers=A)); print("bad provider key status:", [k["status"] for k in provs[0]["keys"]])
ok(c.get("/api/me/usage", headers=UH)); ok(c.get("/api/admin/users", headers=A)); ok(c.get(f"/api/admin/users/{u['user']['id']}", headers=A))
# settings
ok(c.put("/api/admin/settings", headers=A, json={"cryptobot": {"enabled": True, "token": "123:ABC"}, "platega": {"enabled": True, "merchant_id": "m-1", "secret": "s3cr3t"}}))
s = ok(c.get("/api/admin/settings", headers=A)); print("settings masked:", s["cryptobot"]["token"], s["cryptobot"]["token_mask"], s["platega"]["secret_set"])
print("methods:", ok(c.get("/api/pay/methods", headers=UH)))
# fake payment + platega webhook
from sqlite3 import connect
import uuid, hashlib, hmac
pid = str(uuid.uuid4())
db = connect("data_test/gateway.db"); db.execute("insert into payments(id,user_id,method,amount,currency,amount_usd,status,external_id,pay_url,created_at) values(?,?,?,?,?,?,?,?,?,datetime('now'))", (pid, u["user"]["id"], "platega", 950, "RUB", 10*10**9, "pending", "ext-1", "")); db.commit()
r = c.post("/api/pay/webhook/platega", headers={"X-MerchantId": "m-1", "X-Secret": "wrong"}, json={"id": "ext-1", "status": "CONFIRMED"}); assert r.status_code == 401
for _ in range(2): ok(c.post("/api/pay/webhook/platega", headers={"X-MerchantId": "m-1", "X-Secret": "s3cr3t"}, json={"id": "ext-1", "status": "CONFIRMED", "payload": pid}))
print("after platega (idempotent):", ok(c.get("/api/me", headers=UH))["balance"])
pid2 = str(uuid.uuid4())
db.execute("insert into payments(id,user_id,method,amount,currency,amount_usd,status,external_id,pay_url,created_at) values(?,?,?,?,?,?,?,?,?,datetime('now'))", (pid2, u["user"]["id"], "cryptobot", 5, "USD", 5*10**9, "pending", "777", "")); db.commit()
raw = json.dumps({"update_id": 1, "update_type": "invoice_paid", "payload": {"invoice_id": 777, "status": "paid", "payload": pid2}}).encode()
sig = hmac.new(hashlib.sha256(b"123:ABC").digest(), raw, hashlib.sha256).hexdigest()
assert c.post("/api/pay/webhook/cryptobot", content=raw, headers={"crypto-pay-api-signature": "bad", "content-type": "application/json"}).status_code == 401
ok(c.post("/api/pay/webhook/cryptobot", content=raw, headers={"crypto-pay-api-signature": sig, "content-type": "application/json"}))
print("after cryptobot:", ok(c.get("/api/me", headers=UH))["balance"])
print("ALL OK")
