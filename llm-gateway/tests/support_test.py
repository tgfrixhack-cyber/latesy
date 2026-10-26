"""Run after e2e.py: support tickets with attachments."""
import struct
import zlib

import httpx

c = httpx.Client(base_url="http://127.0.0.1:8000", timeout=30)


def ok(r):
    assert r.status_code < 400, (r.status_code, r.text)
    return r.json()


def login(e, p):
    return {"Authorization": "Bearer " + ok(c.post("/api/auth/login", json={"email": e, "password": p}))["token"]}


def png(w=4, h=3):
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * w for _ in range(h))
    ch = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(raw)) + ch(b"IEND", b"")


A, U = login("admin@test.io", "adminpass123"), login("user@test.io", "userpass123")
o = ok(c.post("/api/auth/register", json={"email": "other@test.io", "password": "password123"}))
O = {"Authorization": "Bearer " + o["token"]}
up = lambda h, data, name: c.post("/api/support/upload", headers={**h, "X-Filename": name, "Content-Type": "application/octet-stream"}, content=data)

img = ok(up(U, png(), "%D1%81%D0%BA%D1%80%D0%B8%D0%BD.png"))
assert img["mime"] == "image/png" and img["kind"] == "image" and img["filename"] == "скрин.png", img
vid = ok(up(U, b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 2000, "rec.mp4"))
assert vid["kind"] == "video"
log = ok(up(U, b"error 502 at 10:00\n", "app.log"))
assert log["mime"] == "text/plain"
assert up(U, b"<html><script>alert(1)</script></html>", "x.png").status_code == 415   # disguised HTML rejected
assert up(U, b"", "e.png").status_code == 415
foreign = ok(up(O, png(), "o.png"))

# validation
assert c.post("/api/support/tickets", headers=U, json={"subject": "a", "body": "x"}).status_code == 400
assert c.post("/api/support/tickets", headers=U, json={"subject": "Проблема", "body": ""}).status_code == 400
assert c.post("/api/support/tickets", headers=U, json={"subject": "Проблема", "body": "x", "attachments": [foreign["id"]]}).status_code == 400

t = ok(c.post("/api/support/tickets", headers=U, json={"subject": "  Ошибка   502 на gpt-4o ", "body": "Падает каждый 3-й запрос",
                                                        "category": "api", "attachments": [img["id"], vid["id"], log["id"]]}))
assert t["subject"] == "Ошибка 502 на gpt-4o" and t["status"] == "open" and t["category_name"] == "API и ошибки"
# attachment can't be reused
assert c.post("/api/support/tickets", headers=U, json={"subject": "Ещё", "body": "x", "attachments": [img["id"]]}).status_code == 400
assert c.get(f"/api/support/tickets/{t['id']}", headers=O).status_code == 404      # чужой тикет
assert c.get(f"/api/admin/support/tickets", headers=U).status_code == 403            # не админ

d = ok(c.get(f"/api/support/tickets/{t['id']}", headers=U))
a0 = d["thread"][0]["attachments"]
assert len(a0) == 3
f = c.get(a0[0]["url"]); assert f.status_code == 200 and f.content[:4] == b"\x89PNG" and f.headers["x-content-type-options"] == "nosniff"
assert "inline" in f.headers["content-disposition"]
assert c.get(a0[0]["url"].replace("sig=", "sig=0")).status_code == 403
rng = c.get(a0[1]["url"], headers={"Range": "bytes=0-99"}); assert rng.status_code == 206 and len(rng.content) == 100
assert "attachment" in c.get(a0[2]["url"]).headers["content-disposition"]

# admin side
lst = ok(c.get("/api/admin/support/tickets?status=open", headers=A))
assert any(x["id"] == t["id"] and x["unread"] and x["user_email"] == "user@test.io" for x in lst["tickets"]), lst
assert ok(c.get("/api/support/unread", headers=A))["admin_waiting"] >= 1
assert ok(c.get(f"/api/admin/support/tickets?q=%23{t['id']}&status=all", headers=A))["tickets"][0]["id"] == t["id"]
ad = ok(c.get(f"/api/admin/support/tickets/{t['id']}", headers=A)); assert ad["user"]["email"] == "user@test.io"
shot = ok(up(A, png(8, 8), "answer.png"))
ok(c.post(f"/api/admin/support/tickets/{t['id']}/messages", headers=A, json={"body": "Исправили, проверьте", "attachments": [shot["id"]]}))
assert ok(c.get("/api/support/unread", headers=U))["count"] == 1
d = ok(c.get(f"/api/support/tickets/{t['id']}", headers=U))
assert d["status"] == "answered" and d["thread"][-1]["author"] == "admin" and len(d["thread"][-1]["attachments"]) == 1
assert ok(c.get("/api/support/unread", headers=U))["count"] == 0
# user marks solved -> closed; reply reopens
assert ok(c.post(f"/api/support/tickets/{t['id']}/cancel", headers=U))["status"] == "closed"
ok(c.post(f"/api/support/tickets/{t['id']}/messages", headers=U, json={"body": "Снова падает"}))
d = ok(c.get(f"/api/support/tickets/{t['id']}", headers=U)); assert d["status"] == "open"
assert [m["author"] for m in d["thread"]] == ["user", "admin", "system", "system", "user"], [m["author"] for m in d["thread"]]
# admin closes with reply, reopens
ok(c.post(f"/api/admin/support/tickets/{t['id']}/messages", headers=A, json={"body": "Готово", "close": True}))
assert ok(c.get(f"/api/support/tickets/{t['id']}", headers=U))["status"] == "closed"
assert ok(c.post(f"/api/admin/support/tickets/{t['id']}/status", headers=A, json={"status": "open"}))["status"] == "open"
# cancel a fresh ticket
t2 = ok(c.post("/api/support/tickets", headers=U, json={"subject": "Вопрос по оплате", "body": "Не пришли деньги", "category": "payment"}))
assert ok(c.post(f"/api/support/tickets/{t2['id']}/cancel", headers=U))["status"] == "canceled"
# limit of active tickets
for i in range(10):
    r = c.post("/api/support/tickets", headers=O, json={"subject": f"Тикет {i}", "body": "x"})
    if r.status_code == 429:
        break
assert i == 5 and r.status_code == 429, (i, r.text)
print("my tickets:", [(x["id"], x["status"], x["messages"]) for x in ok(c.get("/api/support/tickets", headers=U))])
print("SUPPORT OK")
