"""Run after e2e.py against the same server: friendly errors, usage by key, CSV, receipts."""
import httpx
B = "http://127.0.0.1:8000"
c = httpx.Client(base_url=B, timeout=30)
def ok(r):
    assert r.status_code < 400, (r.status_code, r.text); return r
u = ok(c.post("/api/auth/login", json={"email": "user@test.io", "password": "userpass123"})).json()
UH = {"Authorization": "Bearer " + u["token"]}
key = ok(c.post("/api/me/keys", headers=UH, json={"name": "test-bot"})).json()["key"]
K = {"Authorization": "Bearer " + key}
ok(c.post("/v1/chat/completions", headers=K, json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]}))
def err(path, **kw):
    r = c.post(path, **kw); j = r.json(); m = j.get("error", {}).get("message"); print(r.status_code, "|", m); return r
assert err("/v1/chat/completions", headers=K, json={"model": "gpt4o-mini", "messages": [{"role": "user", "content": "x"}]}).status_code == 404
err("/v1/chat/completions", headers=K, json={"model": "sonnet", "messages": [{"role": "user", "content": "x"}]})
err("/v1/chat/completions", headers=K, json={"messages": [{"role": "user", "content": "x"}]})
err("/v1/chat/completions", headers=K, json={"model": "gpt-4o-mini"})
err("/v1/chat/completions", headers=K, json={"model": "text-embedding-3-small", "messages": [{"role": "user", "content": "x"}]})
err("/v1/chat/completions", headers=K, content=b"{bad json", )
err("/v1/chat/completions", headers=K, json=[1, 2])
err("/v1/chat/completions", headers={"Authorization": "Bearer sk-gw-wrong"}, json={"model": "gpt-4o-mini", "messages": []})
err("/v1/chat/completions", json={"model": "gpt-4o-mini", "messages": []})
from app.errors import upstream_bad_request
class M: public_id = "gpt-4o"; context_length = 128000; max_output = 16384
print(upstream_bad_request("This model's maximum context length is 128000 tokens", M))
print(upstream_bad_request("max_tokens is too large: 50000", M))
print(upstream_bad_request("Something else odd", M))
assert c.get("/api/me/usage?date_from=2020-01-01&date_to=2030-01-01", headers=UH).status_code == 400
st = ok(c.get("/api/me/usage?days=30", headers=UH)).json()
print("by_key:", st["by_key"], "range:", st["range"])
print("bad range:", c.get("/api/me/usage?date_from=2026-13-01", headers=UH).json())
csv = ok(c.get("/api/me/usage.csv?days=30", headers=UH))
print(csv.headers["content-disposition"]); print(csv.text[:400])
pays = ok(c.get("/api/me/payments", headers=UH)).json()
paid = [p for p in pays if p["status"] == "paid"]
for p in paid:
    r = ok(c.get(f"/api/me/payments/{p['id']}/receipt.pdf", headers=UH)); open(f"/tmp/receipt_{p['method']}.pdf", "wb").write(r.content)
    print("pdf", p["method"], len(r.content), r.content[:5])
print("models popular:", [(m["id"], m["popular"]) for m in ok(c.get("/api/public/models")).json()])
logs = ok(c.get("/api/me/logs", headers=UH)).json(); print("user log err:", [l.get("error") for l in logs if l["status_code"] >= 400][:3])
print("FEATURES OK")
