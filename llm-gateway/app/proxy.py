"""Public client API: OpenAI- and Anthropic-compatible endpoints with routing, fallback and billing."""
import collections
import datetime as dt
import json
import secrets
import time

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import select, update

from . import errors, keys, settings_store
from .adapters import (AnthropicStreamToOpenAI, Usage, anthropic_to_openai, anthropic_usage_of, estimate_tokens,
                       openai_to_anthropic, openai_usage_of)
from .billing import cache_mults, calc_usage, record, record_bg, sale_prices, usd
from .db import SessionLocal
from .models import NANO, ApiKey, Model, Provider, ProviderKey, User, now
from .responses import ResponsesError, ResponseStream, chat_to_response, responses_to_chat, sse_event
from .security import decrypt, hash_key

router = APIRouter(prefix="/v1")
http = httpx.AsyncClient(timeout=httpx.Timeout(300, connect=15),
                         limits=httpx.Limits(max_connections=2000, max_keepalive_connections=200))

_rr = collections.defaultdict(int)
_rate: dict[int, collections.deque] = collections.defaultdict(collections.deque)
MAX_ATTEMPTS = 6
BAD_JSON = ("Тело запроса не является корректным JSON. Проверьте кавычки и запятые и передайте заголовок "
            "«Content-Type: application/json».")


async def read_body(request: Request) -> dict:
    try:
        body = await request.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise GatewayError(400, BAD_JSON, code="invalid_json")
    if not isinstance(body, dict):
        raise GatewayError(400, "Тело запроса должно быть JSON-объектом: {\"model\": ..., ...}", code="invalid_json")
    return body


def check_messages(body: dict):
    msgs = body.get("messages")
    if not isinstance(msgs, list) or not msgs:
        raise GatewayError(400, "Поле \"messages\" обязательно и должно быть непустым списком, например "
                                "[{\"role\": \"user\", \"content\": \"Привет\"}].", code="messages_required")


class GatewayError(Exception):
    def __init__(self, status, message, type_="invalid_request_error", code=None, headers=None):
        self.status, self.message, self.type, self.code = status, message, type_, code
        self.headers = headers or {}


def error_response(e: GatewayError, rid: str = "", anthropic=False):
    if anthropic:
        body = {"type": "error", "error": {"type": e.type, "message": e.message}}
    else:
        body = {"error": {"message": e.message, "type": e.type, "code": e.code}}
    h = dict(e.headers)
    if rid:
        h["X-Request-ID"] = rid
    return JSONResponse(body, status_code=e.status, headers=h or None)


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "")


class Ctx:
    """Everything resolved before calling upstream."""

    def __init__(self, user, key, model, markup, rid, ip, endpoint):
        self.user, self.key, self.model, self.rid, self.ip, self.endpoint = user, key, model, rid, ip, endpoint
        self.price_in, self.price_out = sale_prices(model, markup)
        self.t0 = time.perf_counter()
        self.fwd = {}  # anthropic-version / anthropic-beta from the client, passed on to Anthropic upstreams

    def charge(self, u: Usage, p: Provider | None, cost=False) -> int:
        rm, wm = cache_mults(self.model, p.type if p else None)
        if cost:
            return calc_usage(u, self.model.cost_in, self.model.cost_out, rm, wm)
        return calc_usage(u, self.price_in, self.price_out, rm, wm)

    def bill_kwargs(self, p, provider_key_id, u: Usage | None, stream, status=200, error="", attempts=1):
        u, ok = u or Usage(), status < 400
        return dict(request_id=self.rid, user_id=self.user.id, api_key_id=self.key.id,
                    model_name=self.model.public_id, provider_id=p.id if p else None, provider_key_id=provider_key_id,
                    endpoint=self.endpoint, stream=stream, tokens_in=u.tin, tokens_out=u.tout,
                    cache_read=u.cache_read, cache_write=u.cache_write + u.cache_write_1h,
                    cost=self.charge(u, p, cost=True) if ok else 0, price=self.charge(u, p) if ok else 0,
                    latency_ms=int((time.perf_counter() - self.t0) * 1000), status_code=status, error=error,
                    ip=self.ip, attempts=attempts)

    def headers(self, u: Usage | None = None, p: Provider | None = None):
        h = {"X-Request-ID": self.rid}
        if u and (u.tin or u.tout):
            h["X-Cost"] = f"{usd(self.charge(u, p)):.9f}"
        return h


async def resolve(request: Request, body: dict, endpoint: str, kinds=("chat",), metered=True) -> Ctx:
    auth = request.headers.get("authorization", "")
    raw = auth[7:].strip() if auth.lower().startswith("bearer ") else request.headers.get("x-api-key", "").strip()
    if not raw:
        raise GatewayError(401, "Не передан API-ключ. Добавьте заголовок «Authorization: Bearer sk-gw-…». "
                                f"Создать ключ: {errors.KEYS_URL}", "authentication_error", "missing_api_key")
    async with SessionLocal() as s:
        key = (await s.execute(select(ApiKey).where(ApiKey.key_hash == hash_key(raw)))).scalar_one_or_none()
        if not key:
            raise GatewayError(401, "API-ключ не найден. Проверьте, что он скопирован полностью, или создайте "
                                    f"новый: {errors.KEYS_URL}", "authentication_error", "invalid_api_key")
        user = await s.get(User, key.user_id)
        rate = float((await settings_store.get(s, "billing")).get("usd_rub_rate") or 95)
        if bad := keys.problem(key, user, rate, await keys.roll_period(s, key)):
            raise GatewayError(*bad)
        general = await settings_store.get(s, "general")
        rpms = [x for x in (int(general.get("rate_limit_rpm") or 0), key.rpm_limit or 0) if x > 0]
        rpm = min(rpms) if rpms else 0  # the service-wide limit and the key's own, whichever is stricter
        if rpm > 0 and metered:
            q, t = _rate[key.id], time.monotonic()
            while q and q[0] < t - 60:
                q.popleft()
            if len(q) >= rpm:
                wait = max(1, int(q[0] + 60 - t) + 1)
                raise GatewayError(429, f"Слишком много запросов: не больше {rpm} в минуту на один ключ. "
                                        f"Повторите через {wait} с.", "rate_limit_error", "rate_limit_exceeded",
                                   headers={"Retry-After": str(wait)})
            q.append(t)
        name = body.get("model")
        if not name or not isinstance(name, str):
            raise GatewayError(400, "Не указана модель. Добавьте в запрос поле \"model\", например "
                                    f"\"gpt-4o-mini\". Список моделей: {errors.MODELS_URL}", code="model_required")
        model = (await s.execute(select(Model).where(Model.public_id == name))).scalar_one_or_none()
        if model and model.is_enabled and model.kind not in kinds:
            hint = "/v1/embeddings" if model.kind == "embedding" else "/v1/chat/completions"
            raise GatewayError(400, f"Модель «{name}» нельзя использовать в {request.url.path}. "
                                    f"Отправьте запрос на {hint}.", code="wrong_endpoint")
        if model and not model.is_enabled:
            raise GatewayError(404, f"Модель «{name}» временно отключена. Выберите другую: {errors.MODELS_URL}",
                               code="model_disabled")
        if not model:
            ids = (await s.execute(select(Model.public_id).where(Model.is_enabled == True,
                                                                 Model.kind.in_(kinds)))).scalars().all()
            raise GatewayError(404, errors.model_not_found(name, list(ids)), "invalid_request_error",
                               "model_not_found")
        allowed = keys.models_of(key)
        if allowed and model.public_id not in allowed:
            raise GatewayError(403, f"Ключ «{key.name}» не открывает модель «{name}». Ему доступны: "
                                    f"{', '.join(allowed[:10])}{' и другие' if len(allowed) > 10 else ''}. Изменить список: "
                                    f"{errors.KEYS_URL}", "permission_error", "model_not_allowed")
        markup = user.markup if user.markup is not None else general.get("default_markup", 0)
        ctx = Ctx(user, key, model, markup, "req_" + secrets.token_hex(12), client_ip(request), endpoint)
        ctx.fwd = {h: v for h in ("anthropic-version", "anthropic-beta") if (v := request.headers.get(h))}
        return ctx


async def candidates(model: Model, types=None):
    """Ordered (route, provider, key_id, secret) list honoring route priority, provider state and key rotation."""
    out = []
    async with SessionLocal() as s:
        for route in sorted(model.routes, key=lambda r: r.priority):
            p = await s.get(Provider, route.provider_id)
            if not p or not p.is_enabled or (types and p.type not in types):
                continue
            t = now()
            keys = [k for k in p.keys if k.is_enabled and (k.status == "active" or
                    (k.status == "paused" and (k.paused_until is None or k.paused_until <= t)))]
            if not keys:
                continue
            start = _rr[p.id] % len(keys)
            _rr[p.id] += 1
            for k in keys[start:] + keys[:start]:
                out.append((route, p, k.id, decrypt(k.key_enc)))
    return out[:MAX_ATTEMPTS]


async def mark_key(key_id: int, status: str, error: str, pause_seconds: int = 0):
    async with SessionLocal() as s:
        vals = {"status": status, "last_error": error[:1000]}
        if pause_seconds:
            vals["paused_until"] = now() + dt.timedelta(seconds=pause_seconds)
        await s.execute(update(ProviderKey).where(ProviderKey.id == key_id).values(**vals))
        await s.commit()


async def mark_key_ok(key_id: int):
    async with SessionLocal() as s:
        await s.execute(update(ProviderKey).where(ProviderKey.id == key_id, ProviderKey.status == "paused")
                        .values(status="active", paused_until=None))
        await s.commit()


def upstream_headers(p: Provider, secret: str, fwd: dict | None = None) -> dict:
    if p.type == "anthropic":
        h = {"x-api-key": secret, "anthropic-version": "2023-06-01"}
        # Claude Code pairs body fields (thinking, context_management, …) with anthropic-beta values: pass them as is
        h.update(fwd or {})
    else:
        h = {"Authorization": f"Bearer {secret}"}
    try:
        h.update(json.loads(p.extra_headers or "{}"))
    except json.JSONDecodeError:
        pass
    return h


async def send_with_fallback(ctx: Ctx, cands, build):
    """Try candidates in order. build(route, provider) -> (url, payload). Returns (resp, route, provider, key_id, n)."""
    if not cands:
        raise GatewayError(503, f"Модель {ctx.model.public_id} сейчас недоступна. Попробуйте позже или выберите "
                                f"другую модель: {errors.MODELS_URL}", "api_error", "no_providers")
    last = "unknown error"
    last_status = 502
    for n, (route, p, key_id, secret) in enumerate(cands, 1):
        url, payload = build(route, p)
        try:
            req = http.build_request("POST", url, json=payload, headers=upstream_headers(p, secret, ctx.fwd),
                                     timeout=httpx.Timeout(p.timeout, connect=15))
            resp = await http.send(req, stream=True)
        except httpx.HTTPError as e:
            last = f"{p.name}: {type(e).__name__} {e}"
            await mark_key(key_id, "paused", last, 30)
            continue
        if resp.status_code < 400:
            await mark_key_ok(key_id)
            return resp, route, p, key_id, n
        text = (await resp.aread()).decode(errors="replace")[:1500]
        await resp.aclose()
        last, last_status = f"{p.name} HTTP {resp.status_code}: {text}", resp.status_code
        if resp.status_code in (401, 403):
            await mark_key(key_id, "error", last)
        elif resp.status_code == 429 or "quota" in text.lower() or "credit balance" in text.lower():
            await mark_key(key_id, "paused", last, 60)
        elif resp.status_code in (400, 413, 422):
            # client's fault: don't fall back, return provider message (without leaking provider identity)
            msg = text
            try:
                j = json.loads(text)
                msg = (j.get("error") or {}).get("message") or text
            except Exception:
                pass
            await record(**ctx.bill_kwargs(p, key_id, None, False, resp.status_code, last, n))
            raise GatewayError(resp.status_code, errors.upstream_bad_request(str(msg), ctx.model),
                               "invalid_request_error", "upstream_bad_request")
    await record(**ctx.bill_kwargs(None, None, None, False, 502, last, len(cands)))
    raise GatewayError(502, f"Модель {ctx.model.public_id} временно не отвечает. Повторите запрос через минуту "
                            "или выберите другую модель.", "api_error", "upstream_unavailable",
                       headers={"Retry-After": "30"})


def sse(obj) -> bytes:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n".encode()


async def iter_sse_data(resp):
    async for line in resp.aiter_lines():
        if line.startswith("data:"):
            yield line[5:].strip()


# --------------------------------------------------------------------------- /v1/chat/completions
@router.post("/chat/completions")
async def chat_completions(request: Request):
    rid = ""
    try:
        body = await read_body(request)
        ctx = await resolve(request, body, "chat")
        check_messages(body)
        rid = ctx.rid
        stream = bool(body.get("stream"))
        want_usage = bool((body.get("stream_options") or {}).get("include_usage"))
        cands = await candidates(ctx.model)

        def build(route, p):
            base = p.base_url.rstrip("/")
            if p.type == "anthropic":
                return base + "/messages", openai_to_anthropic(body, route.upstream_model, ctx.model.max_output)
            payload = dict(body)
            payload["model"] = route.upstream_model
            if stream:
                payload["stream_options"] = {"include_usage": True}
            return base + "/chat/completions", payload

        resp, route, p, key_id, n = await send_with_fallback(ctx, cands, build)
    except GatewayError as e:
        return error_response(e, rid)
    except json.JSONDecodeError:
        return error_response(GatewayError(400, BAD_JSON, code="invalid_json"))

    prompt_est = estimate_tokens(json.dumps(body.get("messages", []), ensure_ascii=False))

    if not stream:
        try:
            data = json.loads(await resp.aread())
        finally:
            await resp.aclose()
        if p.type == "anthropic":
            u = anthropic_usage_of(data.get("usage"))
            data = anthropic_to_openai(data, ctx.model.public_id)
        else:
            u = openai_usage_of(data.get("usage"))
            data["model"] = ctx.model.public_id
        u.tin = u.tin or prompt_est
        await record(**ctx.bill_kwargs(p, key_id, u, False, attempts=n))
        return JSONResponse(data, headers=ctx.headers(u, p))

    async def gen():
        u, chars, got_usage = Usage(), 0, False
        conv = AnthropicStreamToOpenAI(ctx.model.public_id, want_usage) if p.type == "anthropic" else None
        status, err = 200, ""
        try:
            async for data in iter_sse_data(resp):
                if not data:
                    continue
                if data == "[DONE]":
                    if conv is None:
                        yield b"data: [DONE]\n\n"
                    continue
                try:
                    obj = json.loads(data)
                except json.JSONDecodeError:
                    continue
                if conv is not None:
                    for ch in conv.feed(obj):
                        yield sse(ch)
                    u, chars = conv.usage, conv.text_chars
                    got_usage = conv.completion_tokens > 0
                    if conv.done:
                        yield b"data: [DONE]\n\n"
                    continue
                if obj.get("usage"):
                    u, got_usage = openai_usage_of(obj["usage"]), True
                for c in obj.get("choices") or []:
                    d = c.get("delta") or {}
                    chars += len(d.get("content") or "") + len(d.get("reasoning_content") or "")
                    for tc in d.get("tool_calls") or []:
                        chars += len((tc.get("function") or {}).get("arguments") or "")
                if "model" in obj:
                    obj["model"] = ctx.model.public_id
                if not obj.get("choices") and obj.get("usage") and not want_usage:
                    continue
                yield sse(obj)
        except Exception as e:  # upstream broke mid-stream
            status, err = 200, f"stream interrupted: {type(e).__name__}"
        finally:
            if not got_usage:
                u.tout = u.tout or estimate_tokens("x" * chars)
            u.tin = u.tin or prompt_est
            record_bg(**ctx.bill_kwargs(p, key_id, u, True, status, err, n))
            try:
                await resp.aclose()
            except Exception:
                pass

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={**ctx.headers(), "Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# --------------------------------------------------------------------------- /v1/messages (Anthropic)
@router.post("/messages")
async def messages(request: Request):
    rid = ""
    try:
        body = await read_body(request)
        ctx = await resolve(request, body, "messages")
        check_messages(body)
        rid = ctx.rid
        cands = await candidates(ctx.model, types=("anthropic",))
        if not cands:
            raise GatewayError(400, f"Модель {ctx.model.public_id} не работает в формате Anthropic (/v1/messages). "
                                    "Используйте /v1/chat/completions.", "invalid_request_error", "wrong_endpoint")

        def build(route, p):
            payload = dict(body)
            payload["model"] = route.upstream_model
            return p.base_url.rstrip("/") + "/messages", payload

        resp, route, p, key_id, n = await send_with_fallback(ctx, cands, build)
    except GatewayError as e:
        return error_response(e, rid, anthropic=True)
    except json.JSONDecodeError:
        return error_response(GatewayError(400, "Тело запроса должно быть JSON"), anthropic=True)

    if not body.get("stream"):
        try:
            data = json.loads(await resp.aread())
        finally:
            await resp.aclose()
        data["model"] = ctx.model.public_id
        u = anthropic_usage_of(data.get("usage"))
        await record(**ctx.bill_kwargs(p, key_id, u, False, attempts=n))
        return JSONResponse(data, headers=ctx.headers(u, p))

    async def gen():
        raw = {}  # usage as Anthropic reports it: input parts in message_start, cumulative counts in message_delta
        try:
            async for line in resp.aiter_lines():
                if line.startswith("data:"):
                    try:
                        ev = json.loads(line[5:])
                        if ev.get("type") == "message_start":
                            ev["message"]["model"] = ctx.model.public_id
                            raw.update(ev["message"].get("usage") or {})
                            line = "data: " + json.dumps(ev, ensure_ascii=False)
                        elif ev.get("type") == "message_delta":
                            raw.update({k: v for k, v in (ev.get("usage") or {}).items() if v is not None})
                    except Exception:
                        pass
                yield (line + "\n").encode()
        finally:
            record_bg(**ctx.bill_kwargs(p, key_id, anthropic_usage_of(raw), True, attempts=n))
            try:
                await resp.aclose()
            except Exception:
                pass

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={**ctx.headers(), "Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/messages/count_tokens")
async def count_tokens(request: Request):
    """Exact context size for Claude Code. Free at Anthropic, so nothing is charged and the rate limit is not used."""
    rid = ""
    try:
        body = await read_body(request)
        ctx = await resolve(request, body, "count_tokens", metered=False)
        check_messages(body)
        rid = ctx.rid
        cands = await candidates(ctx.model, types=("anthropic",))
        if not cands:
            raise GatewayError(400, f"Подсчёт токенов доступен только для моделей в формате Anthropic, "
                                    f"а {ctx.model.public_id} к ним не относится.", "invalid_request_error",
                               "wrong_endpoint")
        resp, route, p, key_id, n = await send_with_fallback(
            ctx, cands, lambda route, p: (p.base_url.rstrip("/") + "/messages/count_tokens",
                                          {**body, "model": route.upstream_model}))
    except GatewayError as e:
        return error_response(e, rid, anthropic=True)
    try:
        data = json.loads(await resp.aread())
    finally:
        await resp.aclose()
    return JSONResponse(data, headers={"X-Request-ID": rid})


# --------------------------------------------------------------------------- /v1/responses (Codex CLI)
@router.post("/responses")
async def responses(request: Request):
    rid = ""
    try:
        body = await read_body(request)
        ctx = await resolve(request, body, "responses")
        rid = ctx.rid
        stream = bool(body.get("stream"))
        try:
            chat, bad = responses_to_chat(body), None
        except ResponsesError as e:
            chat, bad = None, str(e)
        cands = await candidates(ctx.model)

        def build(route, p):
            base = p.base_url.rstrip("/")
            if p.type == "openai":  # OpenAI serves this API itself: pass the request through, nothing is lost
                return base + "/responses", {**body, "model": route.upstream_model}
            if bad:
                raise GatewayError(400, bad, code="unsupported_field")
            if p.type == "anthropic":
                return base + "/messages", openai_to_anthropic(chat, route.upstream_model, ctx.model.max_output)
            payload = {**chat, "model": route.upstream_model}
            if stream:
                payload["stream_options"] = {"include_usage": True}
            return base + "/chat/completions", payload

        resp, route, p, key_id, n = await send_with_fallback(ctx, cands, build)
    except GatewayError as e:
        return error_response(e, rid)

    public = ctx.model.public_id
    prompt_est = estimate_tokens(str(body.get("instructions") or "") + json.dumps(body.get("input"), ensure_ascii=False))

    if not stream:
        try:
            data = json.loads(await resp.aread())
        finally:
            await resp.aclose()
        if p.type == "openai":
            u = openai_usage_of(data.get("usage"))
            data["model"] = public
        elif p.type == "anthropic":
            u = anthropic_usage_of(data.get("usage"))
            u.tin = u.tin or prompt_est
            data = chat_to_response(body, anthropic_to_openai(data, public), u, public)
        else:
            u = openai_usage_of(data.get("usage"))
            u.tin = u.tin or prompt_est
            data = chat_to_response(body, data, u, public)
        u.tin = u.tin or prompt_est
        await record(**ctx.bill_kwargs(p, key_id, u, False, attempts=n))
        return JSONResponse(data, headers=ctx.headers(u, p))

    async def native():
        u, got, chars, status, err = Usage(), False, 0, 200, ""
        try:
            async for line in resp.aiter_lines():
                if line.startswith("data:"):
                    try:
                        ev = json.loads(line[5:])
                    except json.JSONDecodeError:
                        ev = None
                    if isinstance(ev, dict):
                        if ev.get("type") in ("response.output_text.delta", "response.function_call_arguments.delta"):
                            chars += len(ev.get("delta") or "")
                        r = ev.get("response")
                        if isinstance(r, dict):  # created / in_progress / completed / incomplete / failed
                            r["model"] = public
                            if r.get("usage"):
                                u, got = openai_usage_of(r["usage"]), True
                            line = "data: " + json.dumps(ev, ensure_ascii=False)
                yield (line + "\n").encode()
        except Exception as e:  # upstream broke mid-stream
            status, err = 200, f"stream interrupted: {type(e).__name__}"
        finally:
            if not got:
                u = Usage(prompt_est, estimate_tokens("x" * chars))
            record_bg(**ctx.bill_kwargs(p, key_id, u, True, status, err, n))
            try:
                await resp.aclose()
            except Exception:
                pass

    async def converted():
        conv = ResponseStream(body, public)
        anth = AnthropicStreamToOpenAI(public, False) if p.type == "anthropic" else None
        st = {"u": Usage(), "got": False}
        status, err, fail = 200, "", None

        def usage():
            u = st["u"]
            if not st["got"]:
                u = Usage(u.tin or prompt_est, u.tout or estimate_tokens("x" * conv.chars), u.cache_read,
                          u.cache_write, u.cache_write_1h)
            u.tin = u.tin or prompt_est
            return u

        try:
            for e in conv.start():
                yield sse_event(e)
            try:
                async for data in iter_sse_data(resp):
                    if not data or data == "[DONE]":
                        continue
                    try:
                        obj = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    if anth:
                        chunks = anth.feed(obj)
                        st["u"], st["got"] = anth.usage, anth.completion_tokens > 0
                    else:
                        chunks = [obj]
                        if obj.get("usage"):
                            st["u"], st["got"] = openai_usage_of(obj["usage"]), True
                    for ch in chunks:
                        if "error" in ch:
                            fail = (ch["error"] or {}).get("message") or "upstream error"
                            continue
                        for e in conv.feed(ch):
                            yield sse_event(e)
            except Exception as e:  # upstream broke mid-stream
                status, err = 200, f"stream interrupted: {type(e).__name__}"
                fail = "Соединение с моделью прервалось. Повторите запрос."
            for e in conv.finish(usage(), fail):
                yield sse_event(e)
        finally:
            record_bg(**ctx.bill_kwargs(p, key_id, usage(), True, status, err, n))
            try:
                await resp.aclose()
            except Exception:
                pass

    return StreamingResponse(native() if p.type == "openai" else converted(), media_type="text/event-stream",
                             headers={**ctx.headers(), "Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# --------------------------------------------------------------------------- /v1/embeddings
@router.post("/embeddings")
async def embeddings(request: Request):
    rid = ""
    try:
        body = await read_body(request)
        ctx = await resolve(request, body, "embeddings", kinds=("embedding",))
        rid = ctx.rid
        cands = await candidates(ctx.model, types=("openai", "openai_compatible"))

        def build(route, p):
            payload = dict(body)
            payload["model"] = route.upstream_model
            return p.base_url.rstrip("/") + "/embeddings", payload

        resp, route, p, key_id, n = await send_with_fallback(ctx, cands, build)
    except GatewayError as e:
        return error_response(e, rid)
    try:
        data = json.loads(await resp.aread())
    finally:
        await resp.aclose()
    data["model"] = ctx.model.public_id
    u = Usage((data.get("usage") or {}).get("prompt_tokens") or 0)
    await record(**ctx.bill_kwargs(p, key_id, u, False, attempts=n))
    return JSONResponse(data, headers=ctx.headers(u, p))


# --------------------------------------------------------------------------- /v1/models, /v1/balance
def raw_key(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    return auth[7:].strip() if auth.lower().startswith("bearer ") else request.headers.get("x-api-key", "").strip()


@router.get("/models")
async def list_models(request: Request):
    """Public catalog; with a key that is limited to some models, only those (Claude Code model discovery)."""
    allowed = []
    async with SessionLocal() as s:
        if raw := raw_key(request):
            key = (await s.execute(select(ApiKey).where(ApiKey.key_hash == hash_key(raw)))).scalar_one_or_none()
            allowed = keys.models_of(key) if key else []
        rows = (await s.execute(select(Model).where(Model.is_enabled == True).order_by(Model.public_id))).scalars()
        data = [{"id": m.public_id, "object": "model", "created": int(m.created_at.timestamp()),
                 "owned_by": m.family or "gateway", "display_name": m.display_name or m.public_id,
                 "context_length": m.context_length} for m in rows if not allowed or m.public_id in allowed]
    return {"object": "list", "data": data}


@router.get("/balance")
async def balance(request: Request):
    """Balance and key state; «ready» tells whether paid requests with this key would pass right now."""
    async with SessionLocal() as s:
        key = (await s.execute(select(ApiKey).where(ApiKey.key_hash == hash_key(raw_key(request))))).scalar_one_or_none()
        if not key:
            return error_response(GatewayError(401, "API-ключ не найден. Создайте ключ: " + errors.KEYS_URL,
                                               "authentication_error", "invalid_api_key"))
        user = await s.get(User, key.user_id)
        rate = float((await settings_store.get(s, "billing")).get("usd_rub_rate") or 95)
        spent = await keys.roll_period(s, key)
        bad = keys.problem(key, user, rate, spent)
        reset = keys.next_reset(key.limit_period)
        return {"balance_usd": usd(user.balance), "balance_rub": round(usd(user.balance) * rate, 2),
                "key_spent_usd": usd(key.spent),
                "key_limit_usd": usd(key.spend_limit) if key.spend_limit is not None else None,
                "key_name": key.name, "key_active": key.is_active, "key_limit_period": key.limit_period,
                "key_period_spent_usd": usd(spent), "key_limit_resets_at": reset.isoformat() + "Z" if reset else None,
                "key_expires_at": key.expires_at.isoformat() + "Z" if key.expires_at else None,
                "key_allowed_models": keys.models_of(key), "key_rpm_limit": key.rpm_limit,
                "ready": bad is None, "problem": bad[1] if bad else None}
