"""Format conversion between OpenAI Chat Completions and Anthropic Messages."""
import json
import time
import uuid
from dataclasses import dataclass

STOP_MAP = {"end_turn": "stop", "stop_sequence": "stop", "max_tokens": "length",
            "tool_use": "tool_calls", "pause_turn": "stop", "refusal": "content_filter"}


def _image_block(url: str) -> dict:
    if url.startswith("data:"):
        header, _, data = url.partition(",")
        media = header[5:].split(";")[0] or "image/png"
        return {"type": "image", "source": {"type": "base64", "media_type": media, "data": data}}
    return {"type": "image", "source": {"type": "url", "url": url}}


def _content_to_blocks(content) -> list:
    if content is None:
        return []
    if isinstance(content, str):
        return [{"type": "text", "text": content}] if content else []
    blocks = []
    for part in content:
        t = part.get("type")
        if t == "text":
            blocks.append({"type": "text", "text": part.get("text", "")})
        elif t == "image_url":
            iu = part.get("image_url")
            url = iu.get("url") if isinstance(iu, dict) else iu
            blocks.append(_image_block(url))
    return blocks


def _text_of(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(p.get("text", "") for p in content if p.get("type") == "text")
    return ""


def openai_to_anthropic(body: dict, upstream_model: str, default_max: int = 4096) -> dict:
    system_parts, msgs = [], []

    def push(role, blocks):
        if not blocks:
            return
        if msgs and msgs[-1]["role"] == role:
            msgs[-1]["content"].extend(blocks)
        else:
            msgs.append({"role": role, "content": list(blocks)})

    for m in body.get("messages", []):
        role = m.get("role")
        if role in ("system", "developer"):
            system_parts.append(_text_of(m.get("content")))
        elif role == "user":
            push("user", _content_to_blocks(m.get("content")))
        elif role == "assistant":
            blocks = _content_to_blocks(m.get("content"))
            for tc in m.get("tool_calls") or []:
                fn = tc.get("function", {})
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except json.JSONDecodeError:
                    args = {"_raw": fn.get("arguments")}
                blocks.append({"type": "tool_use", "id": tc.get("id") or f"toolu_{uuid.uuid4().hex[:20]}",
                               "name": fn.get("name", ""), "input": args})
            push("assistant", blocks)
        elif role == "tool":
            push("user", [{"type": "tool_result", "tool_use_id": m.get("tool_call_id", ""),
                           "content": _text_of(m.get("content"))}])

    out = {"model": upstream_model, "messages": msgs,
           "max_tokens": body.get("max_completion_tokens") or body.get("max_tokens") or default_max}
    if system_parts:
        out["system"] = "\n\n".join(p for p in system_parts if p)
    for k in ("temperature", "top_p", "top_k", "stream"):
        if body.get(k) is not None:
            out[k] = body[k]
    stop = body.get("stop")
    if stop:
        out["stop_sequences"] = [stop] if isinstance(stop, str) else list(stop)
    tools = body.get("tools")
    if tools:
        out["tools"] = [{"name": t["function"]["name"], "description": t["function"].get("description", ""),
                         "input_schema": t["function"].get("parameters") or {"type": "object", "properties": {}}}
                        for t in tools if t.get("type") == "function"]
        tc = body.get("tool_choice")
        if tc == "required":
            out["tool_choice"] = {"type": "any"}
        elif tc == "none":
            out["tool_choice"] = {"type": "none"}
        elif isinstance(tc, dict) and tc.get("function"):
            out["tool_choice"] = {"type": "tool", "name": tc["function"]["name"]}
    if body.get("user"):
        out["metadata"] = {"user_id": str(body["user"])[:200]}
    return out


@dataclass
class Usage:
    """Token counts of one request. tin includes the cached part; cache_* tell how much of it was cached."""
    tin: int = 0
    tout: int = 0
    cache_read: int = 0
    cache_write: int = 0     # written to the cache with the default 5-minute lifetime
    cache_write_1h: int = 0  # written with the 1-hour lifetime (Anthropic), priced higher


def anthropic_usage_of(u: dict | None) -> Usage:
    """Anthropic reports cached input apart from input_tokens."""
    u = u or {}
    cr, cw = u.get("cache_read_input_tokens") or 0, u.get("cache_creation_input_tokens") or 0
    cc = u.get("cache_creation")
    w1h = min(cw, (cc.get("ephemeral_1h_input_tokens") or 0) if isinstance(cc, dict) else 0)
    return Usage((u.get("input_tokens") or 0) + cr + cw, u.get("output_tokens") or 0, cr, cw - w1h, w1h)


def openai_usage_of(u: dict | None) -> Usage:
    """Chat Completions or Responses usage; cached tokens are already counted in the input."""
    u = u or {}
    tin = u.get("prompt_tokens") or u.get("input_tokens") or 0
    det = u.get("prompt_tokens_details") or u.get("input_tokens_details")
    cached = (det.get("cached_tokens") if isinstance(det, dict) else 0) or u.get("prompt_cache_hit_tokens") or 0  # DeepSeek
    return Usage(tin, u.get("completion_tokens") or u.get("output_tokens") or 0, min(cached, tin))


def chat_usage(u: Usage) -> dict:
    return {"prompt_tokens": u.tin, "completion_tokens": u.tout, "total_tokens": u.tin + u.tout,
            "prompt_tokens_details": {"cached_tokens": u.cache_read}}


def anthropic_usage(u: dict | None) -> tuple[int, int]:
    x = anthropic_usage_of(u)
    return x.tin, x.tout


def anthropic_to_openai(data: dict, public_model: str) -> dict:
    text, tool_calls = [], []
    for b in data.get("content", []):
        if b.get("type") == "text":
            text.append(b.get("text", ""))
        elif b.get("type") == "tool_use":
            tool_calls.append({"id": b["id"], "type": "function",
                               "function": {"name": b["name"], "arguments": json.dumps(b.get("input", {}),
                                                                                       ensure_ascii=False)}})
    msg = {"role": "assistant", "content": "".join(text) if text or not tool_calls else None}
    if tool_calls:
        msg["tool_calls"] = tool_calls
    return {"id": "chatcmpl-" + (data.get("id") or uuid.uuid4().hex), "object": "chat.completion",
            "created": int(time.time()), "model": public_model,
            "choices": [{"index": 0, "message": msg,
                         "finish_reason": STOP_MAP.get(data.get("stop_reason"), "stop")}],
            "usage": chat_usage(anthropic_usage_of(data.get("usage")))}


class AnthropicStreamToOpenAI:
    """Feed Anthropic SSE data objects, get OpenAI chat.completion.chunk dicts."""

    def __init__(self, public_model: str, include_usage: bool):
        self.id = "chatcmpl-" + uuid.uuid4().hex
        self.model = public_model
        self.created = int(time.time())
        self.include_usage = include_usage
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.in_usage = {}  # input part of Anthropic usage: message_start, updated by message_delta
        self.text_chars = 0
        self.tool_index = {}  # anthropic block index -> openai tool index
        self.finish = None
        self.done = False

    def _chunk(self, delta: dict, finish=None) -> dict:
        return {"id": self.id, "object": "chat.completion.chunk", "created": self.created, "model": self.model,
                "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}

    def feed(self, ev: dict) -> list[dict]:
        t = ev.get("type")
        out = []
        if t == "message_start":
            self.in_usage = dict(ev.get("message", {}).get("usage") or {})
            self.prompt_tokens, self.completion_tokens = anthropic_usage(self.in_usage)
            out.append(self._chunk({"role": "assistant", "content": ""}))
        elif t == "content_block_start":
            cb = ev.get("content_block", {})
            if cb.get("type") == "tool_use":
                idx = len(self.tool_index)
                self.tool_index[ev.get("index")] = idx
                out.append(self._chunk({"tool_calls": [{"index": idx, "id": cb.get("id"), "type": "function",
                                                        "function": {"name": cb.get("name"), "arguments": ""}}]}))
        elif t == "content_block_delta":
            d = ev.get("delta", {})
            if d.get("type") == "text_delta":
                self.text_chars += len(d.get("text", ""))
                out.append(self._chunk({"content": d.get("text", "")}))
            elif d.get("type") == "input_json_delta":
                idx = self.tool_index.get(ev.get("index"), 0)
                self.text_chars += len(d.get("partial_json", ""))
                out.append(self._chunk({"tool_calls": [{"index": idx,
                                                        "function": {"arguments": d.get("partial_json", "")}}]}))
        elif t == "message_delta":
            u = ev.get("usage") or {}
            if u.get("output_tokens") is not None:
                self.completion_tokens = u["output_tokens"]
            inp = {k: u[k] for k in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens",
                                     "cache_creation") if u.get(k) is not None}
            if inp:  # message_delta usage is cumulative
                self.in_usage.update(inp)
                self.prompt_tokens = anthropic_usage(self.in_usage)[0]
            self.finish = STOP_MAP.get((ev.get("delta") or {}).get("stop_reason"), "stop")
        elif t == "message_stop":
            out.append(self._chunk({}, self.finish or "stop"))
            if self.include_usage:
                out.append({"id": self.id, "object": "chat.completion.chunk", "created": self.created,
                            "model": self.model, "choices": [],
                            "usage": chat_usage(self.usage)})
            self.done = True
        elif t == "error":
            err = ev.get("error", {})
            out.append({"error": {"message": err.get("message", "upstream error"), "type": err.get("type", "api_error")}})
        return out


    @property
    def usage(self) -> Usage:
        return anthropic_usage_of({**self.in_usage, "output_tokens": self.completion_tokens})


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 3) if text else 0
