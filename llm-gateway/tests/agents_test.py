"""Run after e2e.py against the same server: what Claude Code and Codex CLI need from the gateway —
anthropic-* headers and body fields passed through, count_tokens, prompt-cache billing, /v1/responses."""
import json
import time
from decimal import ROUND_CEILING, Decimal

import httpx

B, U = "http://127.0.0.1:8000", "http://127.0.0.1:9001"
NANO = 10 ** 9
c = httpx.Client(base_url=B, timeout=30)


def ok(r):
    assert r.status_code < 400, (r.request.url, r.status_code, r.text)
    return r


def last(name):
    return httpx.get(f"{U}/_last/{name}").json()


def nano(m, tin, tout, cr=0, cw=0, cw1h=0, rm=1, wm=1):
    """Expected charge, same rule as billing.calc_usage."""
    d = lambda x: Decimal(str(x))
    w = d(tin - cr - cw - cw1h) + d(cr) * d(rm) + d(cw) * d(wm) + d(cw1h) * d(2.0)
    v = (w * d(m["eff_price_in"]) + d(tout) * d(m["eff_price_out"])) / Decimal(1_000_000) * NANO
    return int(v.to_integral_value(rounding=ROUND_CEILING))


def xcost(n):
    return f"{round(n / NANO, 9):.9f}"


def log_of(rid):
    for _ in range(30):  # streamed requests are billed in the background
        for row in ok(c.get("/api/me/logs?limit=50", headers=UH)).json():
            if row["request_id"] == rid:
                return row
        time.sleep(0.1)
    raise AssertionError(f"no log for {rid}")


def events(lines):
    """SSE lines -> payloads; every data line must follow an event line of the same type."""
    out, ev = [], None
    for line in lines:
        if line.startswith("event:"):
            ev = line[6:].strip()
        elif line.startswith("data:"):
            d = json.loads(line[5:])
            assert d["type"] == ev, (ev, d["type"])
            out.append(d)
    return out


A = {"Authorization": "Bearer " + ok(c.post("/api/auth/login", json={"email": "admin@test.io", "password": "adminpass123"})).json()["token"]}
UH = {"Authorization": "Bearer " + ok(c.post("/api/auth/login", json={"email": "user@test.io", "password": "userpass123"})).json()["token"]}
key = ok(c.post("/api/me/keys", headers=UH, json={"name": "agents"})).json()["key"]
K = {"Authorization": f"Bearer {key}"}
models = lambda: {m["public_id"]: m for m in ok(c.get("/api/admin/models", headers=A)).json()}
M = models()
cl, mini = M["claude-sonnet-4-5"], M["gpt-4o-mini"]

# ---------------------------------------------------------------- Claude Code
beta = "interleaved-thinking-2025-05-14,context-management-2025-06-27"
cc = {"model": "claude-sonnet-4-5", "max_tokens": 64, "thinking": {"type": "enabled", "budget_tokens": 1024},
      "system": [{"type": "text", "text": "CACHE me", "cache_control": {"type": "ephemeral"}}],
      "messages": [{"role": "user", "content": [{"type": "text", "text": "hi", "cache_control": {"type": "ephemeral", "ttl": "1h"}}]}]}
r = ok(c.post("/v1/messages?beta=true", headers={"x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-beta": beta}, json=cc))
up = last("an")
assert up["headers"]["anthropic-beta"] == beta and up["headers"]["anthropic-version"] == "2023-06-01", up["headers"]
assert up["headers"]["x-api-key"] == "sk-up-anthropic" and up["body"]["model"] == "claude-sonnet-4-5-20250929"
assert all(up["body"][k] == cc[k] for k in ("thinking", "system", "messages")), up["body"]
# 100 plain + 9000 read (10%) + 600 written for 5 min (125%) + 400 written for 1 h (200%)
want, full = nano(cl, 10100, 50, cr=9000, cw=600, cw1h=400, rm=0.1, wm=1.25), nano(cl, 10100, 50)
assert r.headers["x-cost"] == xcost(want) and want * 3 < full, (r.headers["x-cost"], xcost(want), xcost(full))
row = log_of(r.headers["x-request-id"])
assert (row["prompt_tokens"], row["cached_tokens"], row["cache_write_tokens"]) == (10100, 9000, 1000), row
assert abs(row["price"] - want / NANO) < 1e-9
print("claude code: headers and body passed through, cache billed", xcost(want), "instead of", xcost(full))

with c.stream("POST", "/v1/messages", headers={"Authorization": f"Bearer {key}", "anthropic-beta": beta}, json={**cc, "stream": True}) as s:
    assert s.status_code == 200, s.read()
    rid, text = s.headers["x-request-id"], "".join(s.iter_text())
assert '"model": "claude-sonnet-4-5"' in text and "Hello" in text
row = log_of(rid)
assert (row["cached_tokens"], row["completion_tokens"]) == (9000, 5) and abs(row["price"] - nano(cl, 10100, 5, 9000, 600, 400, 0.1, 1.25) / NANO) < 1e-9, row

bal = ok(c.get("/v1/balance", headers=K)).json()["balance_usd"]
r = ok(c.post("/v1/messages/count_tokens", headers={"x-api-key": key, "anthropic-beta": beta},
              json={"model": "claude-sonnet-4-5", "messages": [{"role": "user", "content": "hi"}]}))
assert r.json() == {"input_tokens": 42} and last("an_count")["body"]["model"] == "claude-sonnet-4-5-20250929"
assert last("an_count")["headers"]["anthropic-beta"] == beta
assert ok(c.get("/v1/balance", headers=K)).json()["balance_usd"] == bal, "count_tokens must be free"
r = c.post("/v1/messages/count_tokens", headers={"x-api-key": key}, json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]})
assert r.status_code == 400 and r.json()["type"] == "error", r.text
assert any(m["id"] == "claude-sonnet-4-5" and m["display_name"] for m in ok(c.get("/v1/models?limit=1000")).json()["data"])
assert c.head("/api/hello").status_code == 200
print("claude code: count_tokens free, model discovery, connection probe")

# ---------------------------------------------------------------- OpenAI-style cache, per-model override
r = ok(c.post("/v1/chat/completions", headers=K, json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "CACHE hi"}]}))
assert r.headers["x-cost"] == xcost(nano(mini, 1000, 500, cr=800, rm=0.5)), r.headers["x-cost"]
assert r.json()["usage"]["prompt_tokens_details"]["cached_tokens"] == 800
body = {k: mini[k] for k in ("public_id", "display_name", "description", "family", "kind", "context_length", "max_output",
                             "supports_vision", "supports_tools", "is_enabled", "cost_in", "cost_out", "price_in", "price_out")}
body["routes"] = [{"provider_id": x["provider_id"], "upstream_model": x["upstream_model"]} for x in mini["routes"]]
ok(c.put(f"/api/admin/models/{mini['id']}", headers=A, json={**body, "cache_read_mult": 0.1}))
try:
    assert models()["gpt-4o-mini"]["cache_read_mult"] == 0.1
    r = ok(c.post("/v1/chat/completions", headers=K, json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "CACHE hi"}]}))
    assert r.headers["x-cost"] == xcost(nano(mini, 1000, 500, cr=800, rm=0.1)), r.headers["x-cost"]
    pub = {m["id"]: m for m in ok(c.get("/api/public/models")).json()}
    assert abs(pub["gpt-4o-mini"]["price_cache_read"] - mini["eff_price_in"] * 0.1) < 1e-6
finally:
    ok(c.put(f"/api/admin/models/{mini['id']}", headers=A, json={**body, "cache_read_mult": None}))
pub = {m["id"]: m for m in ok(c.get("/api/public/models")).json()}
assert abs(pub["claude-sonnet-4-5"]["price_cache_read"] - cl["eff_price_in"] * 0.1) < 1e-6
assert abs(pub["claude-sonnet-4-5"]["price_cache_write"] - cl["eff_price_in"] * 1.25) < 1e-6
assert pub["text-embedding-3-small"]["price_cache_read"] is None
assert "Кеш: чтение" in ok(c.get("/models/claude-sonnet-4-5")).text
r = c.put(f"/api/admin/models/{mini['id']}", headers=A, json={**body, "cache_read_mult": -1})
assert r.status_code == 422, r.status_code
print("cache: OpenAI cached_tokens at 50% by default, admin override, public cache prices")

# ---------------------------------------------------------------- Codex: /v1/responses passed through to OpenAI
r = ok(c.post("/v1/responses", headers=K, json={"model": "gpt-4o-mini", "input": "hi", "store": False, "include": ["reasoning.encrypted_content"]}))
d = r.json()
assert d["model"] == "gpt-4o-mini" and d["output"][0]["content"][0]["text"] == "resp:gpt-4o-mini", d
assert last("oa_resp")["body"]["include"] == ["reasoning.encrypted_content"] and last("oa_resp")["body"]["store"] is False
assert r.headers["x-cost"] == xcost(nano(mini, 1200, 30, cr=1000, rm=0.5)), r.headers["x-cost"]
assert ok(c.post("/v1/responses", headers=K, json={"model": "gpt-4o", "input": "hi"})).json()["output"][0]["content"][0]["text"] == "resp:gpt-4o"
with c.stream("POST", "/v1/responses", headers=K, json={"model": "gpt-4o-mini", "input": "hi", "stream": True}) as s:
    assert s.status_code == 200, s.read()
    rid, evs = s.headers["x-request-id"], events(list(s.iter_lines()))
assert evs[-1]["type"] == "response.completed" and evs[-1]["response"]["model"] == "gpt-4o-mini"
row = log_of(rid)
assert (row["endpoint"], row["prompt_tokens"], row["cached_tokens"], row["completion_tokens"]) == ("responses", 1200, 1000, 30), row
print("codex: native Responses API passthrough, fallback, streaming, cached tokens")

# ---------------------------------------------------------------- Codex: /v1/responses over Chat Completions
pc = ok(c.post("/api/admin/providers", headers=A, json={"name": "Compat", "preset": "custom", "type": "openai_compatible",
                                                       "base_url": U + "/oa/v1", "priority": 5, "api_keys": ["sk-up-compat"]})).json()
ok(c.post("/api/admin/models", headers=A, json={"public_id": "compat-chat", "display_name": "Compat chat", "family": "Compat",
                                                "cost_in": 1, "cost_out": 2, "routes": [{"provider_id": pc["id"], "upstream_model": "gpt-4o-mini"}]}))
cm = models()["compat-chat"]
codex = {"model": "compat-chat", "instructions": "You are Codex.", "store": False, "parallel_tool_calls": False, "tool_choice": "auto",
         "reasoning": {"effort": "medium", "summary": "auto"}, "include": ["reasoning.encrypted_content"], "prompt_cache_key": "s1",
         "tools": [{"type": "function", "name": "shell", "description": "Run a command", "strict": False,
                    "parameters": {"type": "object", "properties": {"command": {"type": "array", "items": {"type": "string"}}}, "required": ["command"]}},
                   {"type": "custom", "name": "apply_patch", "description": "Edit files",
                    "format": {"type": "grammar", "syntax": "lark", "definition": "start: begin_patch"}},
                   {"type": "web_search"}],
         "input": [{"type": "message", "role": "developer", "content": [{"type": "input_text", "text": "<permissions>"}]},
                   {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "list files"}]},
                   {"type": "reasoning", "summary": [], "encrypted_content": None},
                   {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "Looking."}]},
                   {"type": "function_call", "name": "shell", "arguments": "{\"command\":[\"pwd\"]}", "call_id": "call_a"},
                   {"type": "function_call_output", "call_id": "call_a", "output": "/repo"},
                   {"type": "custom_tool_call", "name": "apply_patch", "input": "*** Begin Patch", "call_id": "call_b"},
                   {"type": "custom_tool_call_output", "call_id": "call_b", "output": "Done"},
                   {"type": "function_call_output", "call_id": "call_orphan", "output": "orphan"},
                   {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "and now?"}]}]}
r = ok(c.post("/v1/responses", headers=K, json=codex))
sent, d = last("oa_chat")["body"], r.json()
assert [m["role"] for m in sent["messages"]] == ["system", "system", "user", "assistant", "tool", "assistant", "tool", "user"], sent["messages"]
assert sent["messages"][0]["content"] == "You are Codex." and sent["messages"][3]["content"] == "Looking."
assert sent["messages"][3]["tool_calls"][0]["function"] == {"name": "shell", "arguments": "{\"command\":[\"pwd\"]}"}
assert json.loads(sent["messages"][5]["tool_calls"][0]["function"]["arguments"]) == {"input": "*** Begin Patch"}
assert [t["function"]["name"] for t in sent["tools"]] == ["shell", "apply_patch"] and "start: begin_patch" in sent["tools"][1]["function"]["description"]
assert sent["model"] == "gpt-4o-mini" and not {"input", "reasoning", "store", "include", "prompt_cache_key"} & set(sent), sent.keys()
fc = d["output"][0]
assert d["object"] == "response" and d["status"] == "completed" and d["model"] == "compat-chat", d
assert (fc["type"], fc["name"], fc["call_id"], fc["arguments"]) == ("function_call", "shell", "call_1", '{"cmd":"ls"}'), fc
assert d["usage"]["input_tokens"] == 1000 and r.headers["x-cost"] == xcost(nano(cm, 1000, 500))

with c.stream("POST", "/v1/responses", headers=K, json={"model": "compat-chat", "input": "hi", "stream": True}) as s:
    evs = events(list(s.iter_lines()))
types = [e["type"] for e in evs]
assert types[:4] == ["response.created", "response.in_progress", "response.output_item.added", "response.content_part.added"], types
assert types[-4:] == ["response.output_text.done", "response.content_part.done", "response.output_item.done", "response.completed"], types
assert "".join(e["delta"] for e in evs if e["type"] == "response.output_text.delta") == "Привет, мир"
assert [e["sequence_number"] for e in evs] == list(range(1, len(evs) + 1))
done = evs[-1]["response"]
assert done["output"][0]["content"][0]["text"] == "Привет, мир" and (done["usage"]["input_tokens"], done["usage"]["output_tokens"]) == (10, 3)

with c.stream("POST", "/v1/responses", headers=K, json={**codex, "stream": True}) as s:
    rid, evs = s.headers["x-request-id"], events(list(s.iter_lines()))
assert "".join(e["delta"] for e in evs if e["type"] == "response.function_call_arguments.delta") == '{"cmd":"ls"}'
item = [e for e in evs if e["type"] == "response.output_item.done"][-1]["item"]
assert (item["type"], item["call_id"], item["arguments"]) == ("function_call", "call_1", '{"cmd":"ls"}'), item
assert evs[-1]["type"] == "response.completed" and evs[-1]["response"]["output"] == [item]
assert log_of(rid)["completion_tokens"] == 8

r = c.post("/v1/responses", headers=K, json={"model": "compat-chat", "input": "hi", "previous_response_id": "resp_old"})
assert r.status_code == 400 and r.json()["error"]["code"] == "unsupported_field", r.text
print("codex: Responses over Chat Completions — history, tools, custom tools, streaming text and tool calls")

# ---------------------------------------------------------------- Codex: /v1/responses over Anthropic
r = ok(c.post("/v1/responses", headers=K, json={"model": "claude-sonnet-4-5", "instructions": "be brief", "input": [{"role": "user", "content": "hi"}]}))
assert r.json()["output"][0]["content"][0]["text"] == "sys=be brief" and last("an")["body"]["system"] == "be brief"
d = ok(c.post("/v1/responses", headers=K, json={"model": "claude-sonnet-4-5", "input": "weather?", "tools": codex["tools"][:1]})).json()
assert [o["type"] for o in d["output"]] == ["message", "function_call"] and json.loads(d["output"][1]["arguments"]) == {"city": "Moscow"}
with c.stream("POST", "/v1/responses", headers=K, json={"model": "claude-sonnet-4-5", "input": "hi", "stream": True}) as s:
    evs = events(list(s.iter_lines()))
assert "".join(e["delta"] for e in evs if e["type"] == "response.output_text.delta") == "Hello world"
assert evs[-1]["type"] == "response.completed" and evs[-1]["response"]["usage"]["input_tokens"] == 20
print("codex: Responses over Anthropic Messages")

print("AGENTS OK")
