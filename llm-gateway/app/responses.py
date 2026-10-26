"""OpenAI Responses API (/v1/responses) for providers that only speak Chat Completions or Anthropic Messages.

Codex CLI talks to custom providers only through this API. The request becomes a chat request (and, for Anthropic
routes, a Messages request via adapters.openai_to_anthropic); the answer or stream is turned back into a Response
object or Responses events. What has no chat counterpart is dropped: reasoning items sent back by the client,
built-in tools (web search, local shell), stored conversations."""
import json
import time
import uuid

from .adapters import Usage

TEXT_PARTS = ("input_text", "output_text", "text")
FINISH = {"length": ("incomplete", {"reason": "max_output_tokens"}),
          "content_filter": ("incomplete", {"reason": "content_filter"})}


class ResponsesError(ValueError):
    """Request that cannot be expressed as a chat request; the message is shown to the client."""


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:24]}"


def _text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(p.get("text") or "" for p in content if isinstance(p, dict) and p.get("type") in TEXT_PARTS)
    return ""


def _user_content(content):
    if not isinstance(content, list):
        return _text(content)
    parts = []
    for p in content:
        if not isinstance(p, dict):
            continue
        if p.get("type") in TEXT_PARTS:
            parts.append({"type": "text", "text": p.get("text") or ""})
        elif p.get("type") == "input_image" and p.get("image_url"):
            url = p["image_url"] if isinstance(p["image_url"], str) else p["image_url"].get("url")
            parts.append({"type": "image_url", "image_url": {"url": url}})
    if all(p["type"] == "text" for p in parts):
        return "\n".join(p["text"] for p in parts)
    return parts


def _output(out) -> str:
    """function_call_output.output: a string, or content parts in newer clients (images are dropped)."""
    if isinstance(out, str):
        return out
    if isinstance(out, list):
        return _text(out)
    return "" if out is None else json.dumps(out, ensure_ascii=False)


def _custom_tool(t: dict) -> dict:
    """Freeform tools (Codex apply_patch) take raw text: chat models get a function with one string argument."""
    desc, fmt = t.get("description") or "", t.get("format") or {}
    if fmt.get("type") == "grammar" and fmt.get("definition"):
        desc += f"\n\nThe input must match this {fmt.get('syntax') or ''} grammar:\n{fmt['definition']}"
    return {"type": "function", "function": {"name": t["name"], "description": desc.strip(), "parameters": {
        "type": "object", "properties": {"input": {"type": "string", "description": "Raw tool input"}},
        "required": ["input"]}}}


def responses_to_chat(body: dict) -> dict:
    """Responses request -> Chat Completions request (without "model")."""
    for k in ("previous_response_id", "conversation"):
        if body.get(k):
            raise ResponsesError(f"Поле «{k}» для этой модели не поддерживается: ответы не хранятся на сервере. "
                                 "Передавайте всю историю в «input» и store: false.")
    inp = body.get("input")
    if isinstance(inp, str):
        inp = [{"role": "user", "content": inp}]
    if not isinstance(inp, list) or not inp:
        raise ResponsesError("Поле «input» обязательно: строка или непустой список сообщений.")

    msgs, calls = [], set()
    if body.get("instructions"):
        msgs.append({"role": "system", "content": body["instructions"]})

    def call(call_id, name, args):
        if msgs and msgs[-1]["role"] == "assistant":  # tool calls of one turn belong to one assistant message
            last = msgs[-1]
        else:
            last = {"role": "assistant", "content": None}
            msgs.append(last)
        last.setdefault("tool_calls", []).append({"id": call_id, "type": "function",
                                                  "function": {"name": name, "arguments": args}})
        calls.add(call_id)

    for it in inp:
        if not isinstance(it, dict):
            continue
        t = it.get("type") or ("message" if it.get("role") else "")
        if t == "message":
            role = it.get("role")
            if role in ("system", "developer"):
                msgs.append({"role": "system", "content": _text(it.get("content"))})
            elif role == "assistant":
                if text := _text(it.get("content")):
                    msgs.append({"role": "assistant", "content": text})
            else:
                msgs.append({"role": "user", "content": _user_content(it.get("content"))})
        elif t == "function_call":
            call(it.get("call_id") or it.get("id") or _id("call"), it.get("name") or "", it.get("arguments") or "{}")
        elif t == "custom_tool_call":
            call(it.get("call_id") or _id("call"), it.get("name") or "",
                 json.dumps({"input": it.get("input") or ""}, ensure_ascii=False))
        elif t in ("function_call_output", "custom_tool_call_output") and it.get("call_id") in calls:
            msgs.append({"role": "tool", "tool_call_id": it["call_id"], "content": _output(it.get("output"))})
        # reasoning, web_search_call, local_shell_call and other built-in items have no chat counterpart

    out = {"messages": msgs}
    tools = []
    for t in body.get("tools") or []:
        if t.get("type") == "function" and t.get("name"):
            tools.append({"type": "function", "function": {
                "name": t["name"], "description": t.get("description") or "",
                "parameters": t.get("parameters") or {"type": "object", "properties": {}}}})
        elif t.get("type") == "custom" and t.get("name"):
            tools.append(_custom_tool(t))
    if tools:
        out["tools"] = tools
        tc = body.get("tool_choice")
        if tc in ("auto", "none", "required"):
            out["tool_choice"] = tc
        elif isinstance(tc, dict) and tc.get("name"):
            out["tool_choice"] = {"type": "function", "function": {"name": tc["name"]}}
    if body.get("max_output_tokens"):
        out["max_tokens"] = body["max_output_tokens"]
    for k in ("temperature", "top_p", "stream"):
        if body.get(k) is not None:
            out[k] = body[k]
    fmt = (body.get("text") or {}).get("format") or {}
    if fmt.get("type") == "json_schema":
        out["response_format"] = {"type": "json_schema", "json_schema": {
            k: fmt[k] for k in ("name", "description", "schema", "strict") if k in fmt}}
    elif fmt.get("type") == "json_object":
        out["response_format"] = {"type": "json_object"}
    return out


def usage_out(u: Usage) -> dict:
    return {"input_tokens": u.tin, "input_tokens_details": {"cached_tokens": u.cache_read},
            "output_tokens": u.tout, "output_tokens_details": {"reasoning_tokens": 0}, "total_tokens": u.tin + u.tout}


class ResponseBuilder:
    """Response object of one request."""

    def __init__(self, body: dict, public_model: str):
        self.body, self.model = body, public_model
        self.id, self.created = _id("resp"), int(time.time())
        self.custom = {t.get("name") for t in body.get("tools") or [] if t.get("type") == "custom"}

    def envelope(self, status, output, usage: Usage | None = None, error=None, incomplete=None) -> dict:
        b = self.body
        return {"id": self.id, "object": "response", "created_at": self.created, "status": status,
                "model": self.model, "output": output, "error": error, "incomplete_details": incomplete,
                "instructions": b.get("instructions"), "max_output_tokens": b.get("max_output_tokens"),
                "parallel_tool_calls": b.get("parallel_tool_calls", True), "tool_choice": b.get("tool_choice", "auto"),
                "tools": b.get("tools") or [], "temperature": b.get("temperature"), "top_p": b.get("top_p"),
                "text": b.get("text") or {"format": {"type": "text"}}, "reasoning": b.get("reasoning"),
                "store": False, "metadata": b.get("metadata") or {}, "usage": usage_out(usage) if usage else None}

    def call_item(self, call_id, name, args, status="completed", item_id=None) -> dict:
        if name in self.custom:
            try:
                inp = json.loads(args or "{}").get("input", "")
            except (ValueError, AttributeError):
                inp = args
            return {"type": "custom_tool_call", "id": item_id or _id("ctc"), "call_id": call_id, "name": name,
                    "input": inp, "status": status}
        return {"type": "function_call", "id": item_id or _id("fc"), "call_id": call_id, "name": name,
                "arguments": args or "", "status": status}


def chat_to_response(body: dict, data: dict, u: Usage, public_model: str) -> dict:
    """Chat completion -> Response object."""
    rb = ResponseBuilder(body, public_model)
    ch = (data.get("choices") or [{}])[0]
    msg = ch.get("message") or {}
    out = []
    r = msg.get("reasoning_content") or msg.get("reasoning")
    if isinstance(r, str) and r:
        out.append({"type": "reasoning", "id": _id("rs"), "summary": [{"type": "summary_text", "text": r}]})
    if text := _text(msg.get("content")):
        out.append({"type": "message", "id": _id("msg"), "status": "completed", "role": "assistant",
                    "content": [{"type": "output_text", "text": text, "annotations": []}]})
    for tc in msg.get("tool_calls") or []:
        fn = tc.get("function") or {}
        out.append(rb.call_item(tc.get("id") or _id("call"), fn.get("name") or "", fn.get("arguments") or ""))
    status, inc = FINISH.get(ch.get("finish_reason"), ("completed", None))
    return rb.envelope(status, out, u, incomplete=inc)


def sse_event(e: tuple) -> bytes:
    return f"event: {e[0]}\ndata: {json.dumps(e[1], ensure_ascii=False)}\n\n".encode()


class ResponseStream(ResponseBuilder):
    """Chat completion chunks in, Responses API events out as (type, payload)."""

    def __init__(self, body: dict, public_model: str):
        super().__init__(body, public_model)
        self.seq, self.n = 0, 0           # event sequence number, next output index
        self.items: dict[int, dict] = {}  # finished items by output index
        self.cur = None                   # open text or reasoning item
        self.calls: dict[int, dict] = {}  # open tool calls by chat tool index
        self.finish_reason, self.chars = None, 0

    def _ev(self, type_, **data):
        self.seq += 1
        return type_, {"type": type_, "sequence_number": self.seq, **data}

    def start(self) -> list:
        r = self.envelope("in_progress", [])
        return [self._ev("response.created", response=r), self._ev("response.in_progress", response=r)]

    def feed(self, chunk: dict) -> list:
        out = []
        for c in chunk.get("choices") or []:
            d = c.get("delta") or {}
            r = d.get("reasoning_content") or d.get("reasoning")
            if isinstance(r, str) and r:
                out += self._delta("reasoning", r)
            if isinstance(d.get("content"), str) and d["content"]:
                out += self._delta("text", d["content"])
            for tc in d.get("tool_calls") or []:
                out += self._tool(tc)
            if c.get("finish_reason"):
                self.finish_reason = c["finish_reason"]
        return out

    def _delta(self, kind, text):
        out = []
        if self.cur and self.cur["kind"] != kind:
            out += self._close()
        if not self.cur:
            out += self._open(kind)
        cur = self.cur
        cur["buf"].append(text)
        self.chars += len(text)
        if kind == "text":
            out.append(self._ev("response.output_text.delta", item_id=cur["id"], output_index=cur["idx"],
                                content_index=0, delta=text))
        else:
            out.append(self._ev("response.reasoning_summary_text.delta", item_id=cur["id"], output_index=cur["idx"],
                                summary_index=0, delta=text))
        return out

    def _open(self, kind):
        idx, self.n = self.n, self.n + 1
        if kind == "text":
            self.cur = {"kind": kind, "idx": idx, "id": _id("msg"), "buf": []}
            item = {"type": "message", "id": self.cur["id"], "status": "in_progress", "role": "assistant", "content": []}
            return [self._ev("response.output_item.added", output_index=idx, item=item),
                    self._ev("response.content_part.added", item_id=self.cur["id"], output_index=idx, content_index=0,
                             part={"type": "output_text", "text": "", "annotations": []})]
        self.cur = {"kind": kind, "idx": idx, "id": _id("rs"), "buf": []}
        return [self._ev("response.output_item.added", output_index=idx,
                         item={"type": "reasoning", "id": self.cur["id"], "summary": []}),
                self._ev("response.reasoning_summary_part.added", item_id=self.cur["id"], output_index=idx,
                         summary_index=0, part={"type": "summary_text", "text": ""})]

    def _close(self):
        cur, self.cur = self.cur, None
        if not cur:
            return []
        text, i, iid = "".join(cur["buf"]), cur["idx"], cur["id"]
        if cur["kind"] == "text":
            part = {"type": "output_text", "text": text, "annotations": []}
            item = {"type": "message", "id": iid, "status": "completed", "role": "assistant", "content": [part]}
            evs = [self._ev("response.output_text.done", item_id=iid, output_index=i, content_index=0, text=text),
                   self._ev("response.content_part.done", item_id=iid, output_index=i, content_index=0, part=part)]
        else:
            part = {"type": "summary_text", "text": text}
            item = {"type": "reasoning", "id": iid, "summary": [part]}
            evs = [self._ev("response.reasoning_summary_text.done", item_id=iid, output_index=i, summary_index=0, text=text),
                   self._ev("response.reasoning_summary_part.done", item_id=iid, output_index=i, summary_index=0, part=part)]
        self.items[i] = item
        return evs + [self._ev("response.output_item.done", output_index=i, item=item)]

    def _tool(self, tc):
        out, fn = [], tc.get("function") or {}
        k = tc.get("index")
        if k is None:  # some providers send whole calls without an index
            k = len(self.calls) if tc.get("id") or not self.calls else max(self.calls)
        st = self.calls.get(k)
        if st is None:
            out += self._close()  # text before the tool calls is finished
            idx, self.n = self.n, self.n + 1
            st = self.calls[k] = {"idx": idx, "id": _id("fc"), "call_id": tc.get("id") or _id("call"),
                                  "name": fn.get("name") or "", "args": []}
            out.append(self._ev("response.output_item.added", output_index=idx,
                                item=self.call_item(st["call_id"], st["name"], "", "in_progress", st["id"])))
        elif fn.get("name") and not st["name"]:
            st["name"] = fn["name"]
        if a := fn.get("arguments"):
            st["args"].append(a)
            self.chars += len(a)
            if st["name"] not in self.custom:
                out.append(self._ev("response.function_call_arguments.delta", item_id=st["id"],
                                    output_index=st["idx"], delta=a))
        return out

    def finish(self, u: Usage, error: str | None = None) -> list:
        out = self._close()
        for st in sorted(self.calls.values(), key=lambda s: s["idx"]):
            args = "".join(st["args"])
            item = self.call_item(st["call_id"], st["name"], args, "completed", st["id"])
            if item["type"] == "function_call":
                out.append(self._ev("response.function_call_arguments.done", item_id=st["id"],
                                    output_index=st["idx"], arguments=args))
            self.items[st["idx"]] = item
            out.append(self._ev("response.output_item.done", output_index=st["idx"], item=item))
        self.calls = {}
        output = [self.items[i] for i in sorted(self.items)]
        if error:
            return out + [self._ev("response.failed", response=self.envelope(
                "failed", output, u, error={"code": "server_error", "message": error}))]
        status, inc = FINISH.get(self.finish_reason, ("completed", None))
        return out + [self._ev("response.completed" if status == "completed" else "response.incomplete",
                               response=self.envelope(status, output, u, incomplete=inc))]
