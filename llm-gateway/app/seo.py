"""Public HTML that search engines and link previews can read without JavaScript: the landing with a
server-rendered fallback, a page per model, legal pages, robots.txt and sitemap.xml.

Pages are written in Russian; in English mode static/i18n.js translates their static phrases in the browser,
so every new phrase here needs an entry in its DICT."""
import html
import json
import math
import pathlib
from urllib.parse import quote, urlsplit

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from . import settings_store
from .api_user import public_catalog
from .config import PUBLIC_URL
from .db import get_session
from .models import now

router = APIRouter(include_in_schema=False)
STATIC = pathlib.Path(__file__).resolve().parent.parent / "static"
ASSET_V = "27"  # ?v= suffix of /static assets on every page; bump after changing CSS/JS
# Self-hosted (static/fonts): no third-party requests; the two Onest files cover the first paint of Russian text.
FONTS = ('<link rel="preload" href="/static/fonts/Onest-cyrillic.woff2" as="font" type="font/woff2" crossorigin>'
         '<link rel="preload" href="/static/fonts/Onest-latin.woff2" as="font" type="font/woff2" crossorigin>'
         f'<link rel="stylesheet" href="/static/fonts/fonts.css?v={ASSET_V}">')
LOGO = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true">'
        '<path d="M7.1 4.5v15M7.1 14.5l7.2-6.2M10.8 11.3l4.3 6.2"/><circle cx="16.2" cy="6.7" r="2.2" fill="currentColor" stroke="none"/><circle cx="16.4" cy="18.6" r="2.2" fill="currentColor" stroke="none"/></svg>')  # same mark as LOGO in static/app.js
ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="%s">%s</svg>'
SUN = ICON % ("th-d", '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>')
MOON = ICON % ("th-l", '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>')
EX_IN, EX_OUT = 1200, 400  # the worked example of LP_EX in static/landing.js
# Same questions as the FAQ in landingPage() (static/landing.js): keep both lists in sync.
FAQ = [
    ('Нужно ли менять код?', 'Нет. Достаточно заменить адрес API и ключ. Подходят официальные SDK OpenAI и любые инструменты, где можно указать свой адрес.'),
    ('Как считается стоимость запроса?', 'Число входных и выходных токенов умножается на тариф модели. Стоимость каждого запроса видна в истории в кабинете.'),
    ('Можно ли ограничить расходы?', 'Да, для каждого ключа задаётся лимит. Когда он исчерпан, этот ключ перестаёт принимать запросы, остальные работают дальше.'),
    ('Что будет, если модель недоступна?', 'Если у модели несколько провайдеров, запрос автоматически уйдёт на работающий. Текущее состояние видно в разделе «Статус».'),
    ('Какие модели принимают изображения?', 'Те, у которых в таблице цен указано «изображения». Вызов инструментов отмечен там же.'),
    ('Нужен ли отдельный баланс для каждого ключа?', 'Нет, баланс один на все ключи и модели.'),
]
PRICES_NOTE = ('Цена указана за 1 млн токенов, отдельно для входа и выхода. Списываем по полю <code>usage</code> '
               'из ответа модели, без округлений до тысяч.')
e = html.escape
NB = "\u00a0"


# ------------------------------------------------------------------ formatting (mirrors static/landing.js)
def base_url(request: Request) -> str:
    """Absolute site URL for canonical links and the sitemap. PUBLIC_URL wins; the request is the fallback when it
    was left at the localhost default (uvicorn runs with --proxy-headers, so scheme and host are the public ones)."""
    if (urlsplit(PUBLIC_URL).hostname or "") not in ("localhost", "127.0.0.1", "0.0.0.0"):
        return PUBLIC_URL
    return str(request.base_url).rstrip("/")


def num(x: float, d: int = 2) -> str:
    """Number.toLocaleString('ru-RU', {maximumFractionDigits: d})."""
    s = f"{x:,.{d}f}"
    if d:
        s = s.rstrip("0").rstrip(".")
    return s.replace(",", NB).replace(".", ",")


def rub(usd: float, rate: float, d: int = 2) -> str:  # lpUsd()
    x = usd * rate
    if abs(x - round(x)) < 0.005:
        x = round(x)
    return num(x, d) + NB + "₽"


def cost(usd: float, rate: float) -> str:  # lpSum()
    return rub(usd, rate, 0 if usd * rate >= 100 else 2)


def tokens(n: int | None) -> str:  # lpCtx()
    if not n:
        return "—"
    if n >= 1e6:
        return num(math.floor(n / 1e5 + 0.5) / 10, 1) + "M"
    return f"{math.floor(n / 1e3 + 0.5)}K"


def caps(m: dict) -> str:  # lpCaps()
    c = []
    if m["vision"]:
        c.append("изображения")
    if m["tools"]:
        c.append("инструменты")
    if m["kind"] == "image":
        c.append("генерация изображений")
    if m["kind"] == "embedding":
        c.append("эмбеддинги")
    return ", ".join(c) or "—"


def listed(ms: list[dict]) -> list[dict]:
    """Models shown to visitors: same filter and order as the landing price table."""
    ms = [m for m in ms if m["kind"] != "embedding" or m["price_in"] > 0]
    return sorted(ms, key=lambda m: (not m["popular"], (m["family"] or "").lower(), m["id"].lower()))


def mpath(mid: str) -> str:
    return "/models/" + quote(mid, safe="/")


def ld(data) -> str:
    """JSON-LD block; '<' is escaped so a model name can never close the script tag."""
    return '<script type="application/ld+json">%s</script>' % json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")


def crumbs_ld(base: str, items: list[tuple[str, str]]) -> dict:
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": name, "item": base + path} for i, (name, path) in enumerate(items)]}


# ------------------------------------------------------------------ shared page parts
class Ctx:
    """Everything a page needs from settings and the catalog, loaded once per request."""

    def __init__(self, request: Request, general: dict, billing: dict, models: list[dict]):
        self.base = base_url(request)
        self.site = general.get("site_name") or "kvotum"
        self.support = general.get("support_contact") or ""
        self.status_on = general.get("status_page", True) is not False
        self.rate = float(billing.get("usd_rub_rate") or 95)
        self.models = listed(models)


async def load(request: Request, session: AsyncSession, popular: bool = False, catalog: bool = True) -> Ctx:
    all_ = await settings_store.load_all(session)
    ms = await public_catalog(session, popular=popular) if catalog else []
    return Ctx(request, all_["general"], all_["billing"], ms)


def header(c: Ctx, cur: str = "") -> str:
    nav = [("/models", "Цены"), ("/#/?go=connect", "Подключение"), ("/#/?go=pay", "Оплата")]
    nav += [("/#/status", "Статус")] if c.status_on else []
    nav += [("/#/?go=faq", "Вопросы")]
    links = "".join(f'<a href="{h}"{" class=on" if h == cur else ""}>{t}</a>' for h, t in nav)
    return (f'<header class="lp-top scrolled"><div class="lp-w lp-top-in">'
            f'<a class="brand lp-brand" href="/"><div class="logo">{LOGO}</div><span>{e(c.site)}</span></a>'
            f'<nav class="lp-nav">{links}</nav><div class="row lp-act">'
            '<div class="lang-sw" role="group" aria-label="Language" data-noi18n>'
            '<button type="button" data-lang="ru">RU</button><button type="button" data-lang="en">EN</button></div>'
            f'<button class="btn sm icon ghost lp-th" type="button" title="Тема">{SUN}{MOON}</button>'
            '<a class="lp-in" href="/#/login">Войти</a><a class="btn pri sm lp-key" href="/#/login">Получить ключ</a></div></div></header>')


def end_band() -> str:
    """Closing call to action, same as the end of landingPage() in static/landing.js."""
    return ('<section class="lp-end"><div class="lp-w lp-end-in"><h2>Попробуйте на своём коде</h2>'
            '<div><p>Нужно заменить только адрес API и ключ.</p><div class="lp-cta">'
            '<a class="btn lg" href="/#/login">Получить ключ</a><a class="lp-more" href="/models">Посмотреть цены</a></div></div></div></section>')


def footer(c: Ctx) -> str:
    sup = f'<span data-noi18n>{e(c.support)}</span>' if c.support else ""
    st = '<a href="/#/status">Статус</a>' if c.status_on else ""
    return (f'<footer class="lp-foot"><div class="lp-w lp-foot-in">'
            f'<div class="lp-foot-b"><a class="brand lp-brand" href="/"><div class="logo">{LOGO}</div><span>{e(c.site)}</span></a>'
            '<p class="small muted">OpenAI-совместимый доступ к языковым моделям с оплатой по токенам.</p></div>'
            f'<div><div class="lp-foot-h">Сервис</div><a href="/models">Цены</a><a href="/#/?go=connect">Подключение</a>{st}<a href="/#/login">Войти</a></div>'
            '<div><div class="lp-foot-h">Документы</div><a href="/privacy">Политика конфиденциальности</a><a href="/terms">Пользовательское соглашение</a></div>'
            f'<div><div class="lp-foot-h">Поддержка</div>{sup}<a href="/#/login">Чат в личном кабинете</a><a href="/#/?go=faq">Вопросы и ответы</a></div>'
            f'</div><div class="lp-w"><div class="lp-foot-c small dim">© {now().year} {e(c.site)}</div></div></footer>')


def price_table(c: Ctx, ms: list[dict], groups: bool = False) -> str:
    rows, fam = [], None
    for m in ms:
        if groups and m["family"] != fam:
            fam = m["family"]
            rows.append(f'<tr class="mp-grp"><th colspan="5">{e(fam) if fam else "Другие"}</th></tr>')
        name = m["name"] or m["id"]
        sub = f'<span class="mono dim" data-noi18n>{e(m["id"])}</span>' if name != m["id"] else ""
        pin = rub(m["price_in"], c.rate) if m["price_in"] else "—"
        pout = rub(m["price_out"], c.rate) if m["price_out"] else "—"
        rows.append(f'<tr><td><div class="lp-mn"><a href="{mpath(m["id"])}"><b data-noi18n>{e(name)}</b></a>{sub}</div></td>'
                    f'<td class="r num">{tokens(m["context_length"])}</td><td class="r num">{pin}</td><td class="r num">{pout}</td>'
                    f'<td class="muted">{caps(m)}</td></tr>')
    return ('<table><thead><tr><th>Модель</th><th class="r">Контекст</th><th class="r">Вход, ₽/1M</th>'
            f'<th class="r">Выход, ₽/1M</th><th>Возможности</th></tr></thead><tbody>{"".join(rows)}</tbody></table>')


def shell(c: Ctx, path: str, title: str, desc: str, body: str, data: list[dict] = (), status: int = 200,
          noindex: bool = False) -> HTMLResponse:
    url = c.base + path
    robots = '<meta name="robots" content="noindex">' if noindex else f'<link rel="canonical" href="{e(url)}">'
    return HTMLResponse(f'''<!doctype html>
<html lang="ru" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
{robots}
<meta name="theme-color" content="#F3F1EB">
<meta property="og:type" content="website">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="{e(c.site)}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(url)}">
<meta property="og:image" content="{e(c.base)}/static/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/static/favicon.svg?v={ASSET_V}" type="image/svg+xml">
{FONTS}
<link rel="stylesheet" href="/static/style.css?v={ASSET_V}">
<link rel="stylesheet" href="/static/fx.css?v={ASSET_V}">
<link rel="stylesheet" href="/static/landing.css?v={ASSET_V}">
<script>document.documentElement.dataset.theme = localStorage.getItem('theme') || 'light'</script>
{"".join(ld(d) for d in data)}
</head>
<body>
<div class="lp">{header(c, "/models" if path.startswith("/models") else "")}
<main class="lp-w mp">{body}</main>
{end_band()}
{footer(c)}</div>
<script src="/static/i18n.js?v={ASSET_V}" defer></script>
<script>
document.querySelector('.lp-th').onclick = () => {{ const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t; localStorage.setItem('theme', t); }};
addEventListener('DOMContentLoaded', () => document.querySelectorAll('.lang-sw [data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === I18N.lang)));
</script>
</body>
</html>''', status_code=status)


def crumbs(items: list[tuple[str, str]], last: str) -> str:
    links = "".join(f'<a href="{h}">{t}</a><span>/</span>' for t, h in items)
    return f'<nav class="mp-crumbs small" aria-label="Breadcrumbs">{links}<span data-noi18n>{e(last)}</span></nav>'


# ------------------------------------------------------------------ landing and legal pages
def landing_ssr(c: Ctx) -> str:
    """Static copy of the landing (hero, prices, FAQ) for crawlers and the first paint. Same markup as
    landingPage() in static/landing.js, which replaces it as soon as the app boots."""
    chat = [m for m in c.models if m["price_in"] > 0 and m["kind"] not in ("embedding", "image")]
    facts = [("Моделей в каталоге", num(len(c.models), 0) if c.models else "—")]
    if chat:
        facts.append(("Вход, от", f"{rub(min(m['price_in'] for m in chat), c.rate)} / 1M"))
    facts.append(("Абонентская плата", "0" + NB + "₽"))
    top = c.models[:12]
    faq_n = 5 if c.status_on else 4  # prices · connect · pay · [status] · faq, as numbered on the landing
    more = f'<a class="lp-all" href="/models">Все модели и цены ({len(c.models)})</a>' if len(c.models) > len(top) else ""
    prices = (f'<div class="tbl-wrap lp-pr">{price_table(c, top)}{more}</div>' if top else
              '<div class="tbl-wrap lp-pr"><div class="lp-empty">Каталог пока пуст. Модели появятся здесь, когда администратор их включит.</div></div>')
    return f'''<div class="lp lp-ssr">{header(c)}
<section class="lp-hero" data-sec="top"><div class="lp-w"><div class="lp-hero-in"><div class="lp-hero-l">
<h1 class="lp-h1 lp-brandh" data-noi18n>{e(c.site)} API</h1>
<p class="lp-sig" aria-label="true ApiKey"><span class="lp-sig-k">true</span> ApiKey<i class="lp-caret" aria-hidden="true"></i></p>
<p class="lp-lead">GPT, Claude, Gemini, DeepSeek и другие модели по одному OpenAI-совместимому ключу, с оплатой в рублях. Чтобы подключиться, замените адрес API в своём коде, Claude Code, Codex или Cursor. Баланс пополняется через СБП, картой или криптовалютой.</p>
<div class="lp-cta"><a class="btn pri lg" href="/#/login">Получить ключ</a><a class="lp-more" href="/models">Посмотреть цены</a></div>
<dl class="lp-facts">{"".join(f'<div><dt>{k}</dt><dd class="num">{v}</dd></div>' for k, v in facts)}</dl>
</div><div class="lp-hero-r"><div class="lp-obj" aria-hidden="true"></div><div class="lp-hero-v"></div></div></div></div></section>
<div class="lp-brands"></div>
<section class="lp-sec" data-sec="prices"><div class="lp-w"><div class="lp-sh"><span class="lp-n">01</span><div><h2>Цены</h2><p>{PRICES_NOTE}</p></div></div>{prices}</div></section>
<section class="lp-sec" data-sec="faq"><div class="lp-w"><div class="lp-sh"><span class="lp-n">{faq_n:02d}</span><div><h2>Вопросы</h2></div></div>
<dl class="lp-faq">{"".join(f'<div><dt>{q}</dt><dd>{a}</dd></div>' for q, a in FAQ)}</dl></div></section>
{end_band()}
{footer(c)}</div>'''


def template(name: str, c: Ctx, raw: dict | None = None) -> HTMLResponse:
    """static/<name> with {{SITE_NAME}}, {{DOMAIN}}, {{PUBLIC_URL}}, {{YEAR}}, {{V}} filled in (escaped) and
    `raw` placeholders inserted as HTML."""
    subs = {"SITE_NAME": c.site, "DOMAIN": urlsplit(c.base).netloc, "PUBLIC_URL": c.base, "YEAR": str(now().year), "V": ASSET_V}
    text = (STATIC / name).read_text(encoding="utf-8")
    for k, v in subs.items():
        text = text.replace("{{%s}}" % k, e(v))
    for k, v in (raw or {}).items():
        text = text.replace("{{%s}}" % k, v)
    return HTMLResponse(text)


@router.get("/")
async def index(request: Request, session: AsyncSession = Depends(get_session)):
    c = await load(request, session, popular=True)
    site_ld = [{"@context": "https://schema.org", "@type": "WebSite", "name": c.site, "url": c.base + "/"},
               {"@context": "https://schema.org", "@type": "Organization", "name": c.site, "url": c.base + "/"}]
    return template("index.html", c, {"SSR": landing_ssr(c), "LD": "".join(ld(d) for d in site_ld)})


@router.get("/privacy")
async def privacy_page(request: Request, session: AsyncSession = Depends(get_session)):
    return template("privacy.html", await load(request, session, catalog=False))


@router.get("/terms")
async def terms_page(request: Request, session: AsyncSession = Depends(get_session)):
    return template("terms.html", await load(request, session, catalog=False))


# ------------------------------------------------------------------ model catalog pages
@router.get("/models")
async def models_page(request: Request, session: AsyncSession = Depends(get_session)):
    c = await load(request, session)
    ms = sorted(c.models, key=lambda m: ((m["family"] or "~").lower(), (m["name"] or m["id"]).lower()))
    names = ", ".join(m["name"] or m["id"] for m in c.models[:4])
    desc = (f"Цены за 1 млн входных и выходных токенов для {len(ms)} моделей" + (f": {names} и другие" if names else "") +
            ". OpenAI-совместимый API, оплата по факту, без подписки.")
    body = (crumbs([("Главная", "/")], "Модели") +
            f'<div class="mp-top"><div><h1 class="lp-h1 mp-h1">Модели и цены</h1><p class="lp-lead">{PRICES_NOTE}</p></div>'
            '<a class="btn pri lg" href="/#/login">Получить ключ</a></div>' +
            (f'<div class="tbl-wrap lp-pr">{price_table(c, ms, groups=True)}</div>' if ms else
             '<div class="tbl-wrap"><div class="lp-empty">Каталог пока пуст. Модели появятся здесь, когда администратор их включит.</div></div>'))
    items = {"@context": "https://schema.org", "@type": "ItemList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "url": c.base + mpath(m["id"]), "name": m["name"] or m["id"]} for i, m in enumerate(ms)]}
    return shell(c, "/models", f"Модели и цены API — {c.site}", desc, body,
                 [crumbs_ld(c.base, [("Главная", "/"), ("Модели", "/models")]), items])


def similar(m: dict, ms: list[dict], n: int = 6) -> list[dict]:
    """Same provider first, then the closest price of the same kind: alternatives a visitor may compare."""
    rest = [x for x in ms if x["id"] != m["id"] and (x["kind"] == m["kind"] or x["family"] == m["family"])]
    p = m["price_in"] or 0
    return sorted(rest, key=lambda x: (x["family"] != m["family"], abs((x["price_in"] or 0) - p)))[:n]


def cost_rows(m: dict, rate: float) -> list[tuple[str, str]]:
    pin, pout = m["price_in"], m["price_out"]
    if m["kind"] == "embedding":
        return [(f"{label} токенов", cost(n * pin / 1e6, rate)) for label, n in (("1 млн", 1e6), ("10 млн", 1e7), ("100 млн", 1e8))]
    one = (EX_IN * pin + EX_OUT * pout) / 1e6
    mix = lambda n: n * (3 * pin + pout) / 4 / 1e6  # «Чат-бот» 3:1, the calculator's default
    return [("Один запрос: 1 200 входных и 400 выходных токенов", cost(one, rate)),
            ("1 000 таких запросов", cost(one * 1000, rate)),
            ("1 млн токенов: 750 тыс. входных и 250 тыс. выходных", cost(mix(1e6), rate)),
            ("10 млн токенов: 7,5 млн входных и 2,5 млн выходных", cost(mix(1e7), rate))]


def code_sample(c: Ctx, m: dict) -> str:
    if m["kind"] == "embedding":
        call = f'r = client.embeddings.create(model="{m["id"]}", input="Привет!")\nprint(len(r.data[0].embedding))'
    else:
        call = (f'r = client.chat.completions.create(\n    model="{m["id"]}",\n'
                '    messages=[{"role": "user", "content": "Привет!"}],\n)\nprint(r.choices[0].message.content)')
    return f'from openai import OpenAI\n\nclient = OpenAI(\n    base_url="{c.base}/v1",\n    api_key="sk-...",\n)\n{call}'


@router.get("/models/{mid:path}")
async def model_page(mid: str, request: Request, session: AsyncSession = Depends(get_session)):
    if not mid.strip("/"):
        return RedirectResponse("/models", 301)
    c = await load(request, session)
    m = next((x for x in c.models if x["id"] == mid), None)
    if not m:
        body = (crumbs([("Главная", "/"), ("Модели", "/models")], mid) +
                '<h1 class="lp-h1 mp-h1">Модель не найдена</h1><p class="lp-lead">Возможно, её отключили или переименовали.</p>'
                '<a class="btn pri lg" href="/models">Все модели</a>')
        return shell(c, request.url.path, f"Модель не найдена — {c.site}", "Модель не найдена.", body, status=404, noindex=True)

    name, kind, pin, pout = m["name"] or m["id"], m["kind"], m["price_in"], m["price_out"]
    facts = [("Вход, ₽/1M", rub(pin, c.rate) if pin else "—")]
    if kind != "embedding":
        facts.append(("Выход, ₽/1M", rub(pout, c.rate) if pout else "—"))
    if m.get("price_cache_read") is not None:
        facts.append(("Кеш: чтение, ₽/1M", rub(m["price_cache_read"], c.rate)))
    if m.get("price_cache_write") is not None:
        facts.append(("Кеш: запись, ₽/1M", rub(m["price_cache_write"], c.rate)))
    facts.append(("Контекст", tokens(m["context_length"])))
    if kind == "chat":
        facts.append(("Макс. ответ", tokens(m["max_output"])))
    facts += [("Провайдер", e(m["family"]) if m["family"] else "—"), ("Возможности", caps(m))]
    lead = e(m["description"]) if m["description"] else \
        "Модель доступна через OpenAI-совместимый API: замените base_url, укажите ID модели и платите только за фактические токены."

    rows = cost_rows(m, c.rate) if pin and kind != "image" else []
    price_sec = (f'<section class="mp-sec"><h2>Сколько стоит</h2><div class="tbl-wrap"><table class="mp-cost"><tbody>'
                 + "".join(f'<tr><td>{k}</td><td class="r num">{v}</td></tr>' for k, v in rows) +
                 '</tbody></table></div><p class="small muted">Сумма списывается по фактическим токенам из ответа модели. '
                 '<a class="lp-more" href="/#/?go=prices">Калькулятор для всех моделей</a></p></section>') if rows else ""
    alt = similar(m, c.models)
    alt_sec = (f'<section class="mp-sec"><div class="lp-sh-row mp-sh"><h2>Похожие модели</h2><a class="lp-more" href="/models">Все модели</a></div>'
               f'<div class="tbl-wrap lp-pr">{price_table(c, alt)}</div></section>') if alt else ""
    body = (crumbs([("Главная", "/"), ("Модели", "/models")], name) +
            f'<div class="mp-head"><div><h1 class="lp-h1 mp-h1" data-noi18n>{e(name)}</h1>'
            f'<div class="mono dim mp-id" data-noi18n>{e(m["id"])}</div><p class="lp-lead">{lead}</p>'
            '<div class="row wrap lp-cta"><a class="btn pri lg" href="/#/login">Получить ключ</a><a class="lp-more" href="/models">Все модели</a></div></div>'
            f'<dl class="mp-facts">{"".join(f"<div><dt>{k}</dt><dd>{v}</dd></div>" for k, v in facts)}</dl></div>'
            f'{price_sec}'
            '<section class="mp-sec mp-two"><div><h2>Как подключить</h2><p class="muted">Подходят официальные SDK OpenAI, LangChain и любые инструменты, где можно указать свой адрес API.</p>'
            f'<dl class="lp-rows mp-rows"><div><dt>Адрес API</dt><dd class="mono" data-noi18n>{e(c.base)}/v1</dd></div>'
            f'<div><dt>ID модели</dt><dd class="mono" data-noi18n>{e(m["id"])}</dd></div></dl></div>'
            f'<pre class="mp-code">{e(code_sample(c, m))}</pre></section>'
            f'{alt_sec}')

    if pin and pout and kind != "embedding":
        price_s = f": {rub(pin, c.rate)} за 1 млн входных и {rub(pout, c.rate)} за 1 млн выходных токенов"
    else:
        price_s = f": {rub(pin, c.rate)} за 1 млн токенов" if pin else ""
    desc = (f"{name} ({m['id']}) через OpenAI-совместимый API{price_s}. Контекст {tokens(m['context_length'])} токенов. "
            "Оплата по факту, без подписки.")
    product = {"@context": "https://schema.org", "@type": "Product", "name": f"{name} API", "sku": m["id"], "description": desc,
               "url": c.base + mpath(m["id"])}
    if m["family"]:
        product["brand"] = {"@type": "Brand", "name": m["family"]}
    if pin:
        spec = lambda p, unit: {"@type": "UnitPriceSpecification", "price": round(p * c.rate, 2), "priceCurrency": "RUB",
                                "referenceQuantity": {"@type": "QuantitativeValue", "value": 1000000, "unitText": unit}}
        product["offers"] = {"@type": "Offer", "url": c.base + mpath(m["id"]), "price": round(pin * c.rate, 2), "priceCurrency": "RUB",
                             "availability": "https://schema.org/InStock",
                             "priceSpecification": [spec(pin, "входных токенов")] + ([spec(pout, "выходных токенов")] if pout and kind != "embedding" else [])}
    return shell(c, mpath(m["id"]), f"{name} API — цены в рублях | {c.site}", desc, body,
                 [crumbs_ld(c.base, [("Главная", "/"), ("Модели", "/models"), (name, mpath(m["id"]))]), product])


# ------------------------------------------------------------------ crawler files
@router.get("/robots.txt")
async def robots(request: Request):
    # /api/public/ stays open: crawlers that run JS need it to render prices on the landing.
    # Clean-param is Yandex-only: referral links (/?ref=…) are the same page.
    return Response("User-agent: *\nAllow: /api/public/\nDisallow: /api/\nDisallow: /v1/\nClean-param: ref /\n\n"
                    f"Sitemap: {base_url(request)}/sitemap.xml\n", media_type="text/plain")


@router.get("/sitemap.xml")
async def sitemap(request: Request, session: AsyncSession = Depends(get_session)):
    c = await load(request, session)
    paths = ["/", "/models"] + [mpath(m["id"]) for m in c.models] + ["/privacy", "/terms"]
    urls = "".join(f"<url><loc>{e(c.base + p)}</loc></url>" for p in paths)
    return Response(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n',
                    media_type="application/xml")
