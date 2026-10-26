import asyncio, os, urllib.parse
os.environ.update(DATA_DIR="./data_oauth", ADMIN_EMAIL="boss@x.io", GITHUB_CLIENT_ID="a", GITHUB_CLIENT_SECRET="b")
import httpx
from app import oauth
from app.main import app, lifespan

async def fake(provider, code, cid, sec):
    return {"c1": ("new@user.io", "New"), "c2": ("boss@x.io", "Boss"), "c3": ("friend@user.io", "Friend")}[code]
oauth.fetch_profile = fake

async def login(c, code, ref=""):
    if ref: c.cookies.set("ref", ref)
    r = await c.get("/api/auth/oauth/github/start"); st = urllib.parse.parse_qs(urllib.parse.urlparse(r.headers["location"]).query)["state"][0]
    bad = await c.get(f"/api/auth/oauth/github/callback?code={code}&state=wrong", cookies={"oauth_state": st}); assert "error" in bad.headers["location"]
    r = await c.get(f"/api/auth/oauth/github/callback?code={code}&state={st}", cookies={"oauth_state": st})
    print(" ->", r.headers["location"][:90]); q = urllib.parse.parse_qs(r.headers["location"].split("?", 1)[1]); return q

async def main():
    async with lifespan(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            q = await login(c, "c1"); assert "key" in q
            me = (await c.get("/api/me", headers={"Authorization": "Bearer " + q["token"][0]})).json()
            print("user:", me["email"], me["role"], me["has_password"])
            q2 = await login(c, "c1"); assert "key" not in q2  # повторный вход — без нового ключа
            q3 = await login(c, "c2"); t = q3["token"][0]
            me = (await c.get("/api/me", headers={"Authorization": "Bearer " + t})).json(); print("boss:", me["role"])
            H = {"Authorization": "Bearer " + t}
            await c.put("/api/admin/settings", headers=H, json={"oauth": {"google_client_id": "g", "google_client_secret": "gs"}})
            s = (await c.get("/api/admin/settings", headers=H)).json()
            print("secret hidden:", s["oauth"]["google_client_secret"] == "", s["oauth"]["google_client_secret_set"], s["webhooks"]["google"])
            print((await c.get("/api/public/config")).json()["oauth"])
            r = await c.post("/api/auth/register", json={"email": "z@z.io", "password": "12345678"}); print("register:", r.status_code)
            U1 = {"Authorization": "Bearer " + q2["token"][0]}
            code = (await c.get("/api/me/referral", headers=U1)).json()["code"]
            qf = await login(c, "c3", ref=code)
            fme = (await c.get("/api/me", headers={"Authorization": "Bearer " + qf["token"][0]})).json()
            rf = (await c.get("/api/me/referral", headers=U1)).json()
            assert abs(fme["balance"] - 0.5) < 1e-9 and rf["invited"] == 1, (fme, rf); print("oauth referral OK")
asyncio.run(main())
