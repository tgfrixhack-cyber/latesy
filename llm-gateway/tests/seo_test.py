"""Run after e2e.py against the same server: crawler files, server-rendered landing and model pages."""
import json
import re
import xml.etree.ElementTree as ET

import httpx

B = "http://127.0.0.1:8000"
c = httpx.Client(base_url=B, timeout=30)


def ok(r, ctype="text/html"):
    assert r.status_code == 200, (r.request.url, r.status_code, r.text[:300])
    assert r.headers["content-type"].startswith(ctype), r.headers["content-type"]
    return r.text


def lds(page):
    return [json.loads(x) for x in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S)]


adm = c.post("/api/auth/login", json={"email": "admin@test.io", "password": "adminpass123"}).json()
A = {"Authorization": "Bearer " + adm["token"]}
public = {m["id"]: m for m in c.get("/api/public/models").json()}
rate = c.get("/api/public/config").json()["usd_rub_rate"]
assert "gpt-4o-mini" in public and "text-embedding-3-small" in public

robots = ok(c.get("/robots.txt"), "text/plain")
assert "Disallow: /api/" in robots and "Allow: /api/public/" in robots and "Disallow: /v1/" in robots
assert f"Sitemap: {B}/sitemap.xml" in robots

locs = [u.text for u in ET.fromstring(ok(c.get("/sitemap.xml"), "application/xml")).iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
assert f"{B}/" in locs and f"{B}/models" in locs and f"{B}/terms" in locs
assert {f"{B}/models/{m}" for m in public} <= set(locs), locs

home = ok(c.get("/"))
assert "{{" not in home and 'class="lp lp-ssr"' in home and "<h1" in home
assert f'<link rel="canonical" href="{B}/">' in home and f"{B}/static/og.png" in home
assert 'href="/models/gpt-4o-mini"' in home and home.count("<dt>") >= 6  # facts + FAQ
assert {d["@type"] for d in lds(home)} == {"WebSite", "Organization"}
assert c.get("/static/og.png").headers["content-type"] == "image/png"

catalog = ok(c.get("/models"))
for mid in public:
    assert f'href="/models/{mid}"' in catalog, mid
items = next(d for d in lds(catalog) if d["@type"] == "ItemList")["itemListElement"]
assert len(items) == len(public) and all(i["url"].startswith(B + "/models/") for i in items)

m = public["gpt-4o-mini"]
page = ok(c.get("/models/gpt-4o-mini"))
fmt = lambda usd: (f"{usd * rate:,.2f}".rstrip("0").rstrip(".").replace(",", "\u00a0").replace(".", ",")) + "\u00a0₽"
assert f'<link rel="canonical" href="{B}/models/gpt-4o-mini">' in page
assert fmt(m["price_in"]) in page and fmt(m["price_out"]) in page, (fmt(m["price_in"]), fmt(m["price_out"]))
assert "chat.completions.create" in page and f'base_url=&quot;{B}/v1&quot;' in page
product = next(d for d in lds(page) if d["@type"] == "Product")
assert product["offers"]["priceCurrency"] == "RUB" and abs(product["offers"]["price"] - round(m["price_in"] * rate, 2)) < 1e-9
assert [x["@type"] for x in product["offers"]["priceSpecification"]] == ["UnitPriceSpecification"] * 2

emb = ok(c.get("/models/text-embedding-3-small"))
assert "embeddings.create" in emb and "Выход, ₽/1M</dt>" not in emb

r = c.get("/models/no-such-model")
assert r.status_code == 404 and 'content="noindex"' in r.text and "canonical" not in r.text
assert c.get("/models/", follow_redirects=False).headers["location"].endswith("/models")

# admin-controlled text is escaped in HTML and cannot break out of JSON-LD
ms = c.get("/api/admin/models", headers=A).json()
row = next(x for x in ms if x["public_id"] == "gpt-4o-mini")
keys = ["public_id", "display_name", "description", "family", "kind", "context_length", "max_output", "supports_vision",
        "supports_tools", "is_enabled", "cost_in", "cost_out", "price_in", "price_out", "routes"]
body = {k: row[k] for k in keys}
evil = dict(body, display_name='Mini</script><img src=x onerror=alert(1)>', description='<b>"bold"</b> & more')
assert c.put(f"/api/admin/models/{row['id']}", headers=A, json=evil).status_code == 200
try:
    page = ok(c.get("/models/gpt-4o-mini"))
    assert "<img src=x" not in page and "Mini&lt;/script&gt;&lt;img src=x" in page
    assert "&lt;b&gt;&quot;bold&quot;&lt;/b&gt; &amp; more" in page
    assert next(d for d in lds(page) if d["@type"] == "Product")["name"].startswith("Mini</script>")
finally:
    assert c.put(f"/api/admin/models/{row['id']}", headers=A, json=body).status_code == 200

print("SEO OK")
