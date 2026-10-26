"""Fake OpenAI + Anthropic upstreams for e2e tests."""
import json
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

app = FastAPI()
FAIL = {"n": 0}
LAST = {}  # last request per endpoint, for tests that check what the gateway forwarded
# prompt-cache usage, returned when the request contains the word CACHE
AN_CACHED = {"input_tokens": 100, "cache_read_input_tokens": 9000, "cache_creation_input_tokens": 1000,
             "cache_creation": {"ephemeral_5m_input_tokens": 600, "ephemeral_1h_input_tokens": 400}}


def has(b, key, word="CACHE"):
    return word in json.dumps(b.get(key), ensure_ascii=False)


@app.get("/_last/{name}")
async def last(name: str):
    return LAST.get(name) or {}


@app.get("/oa/v1/models")
async def oa_models():
    return {"data": [{"id": "gpt-4o-mini"}, {"id": "gpt-4o"}, {"id": "text-embedding-3-small"}, {"id": "weird-model"}]}


@app.get("/bad/v1/models")
async def bad_models():
    return JSONResponse({"error": {"message": "invalid key"}}, 401)


@app.post("/bad/v1/chat/completions")
async def bad_chat():
    return JSONResponse({"error": {"message": "server down"}}, 500)


@app.post("/oa/v1/chat/completions")
async def oa_chat(req: Request):
    b = await req.json()
    assert req.headers["authorization"].startswith("Bearer sk-up")
    LAST["oa_chat"] = {"headers": dict(req.headers), "body": b}
    # calls the tool on a user turn and answers in text once the tool result is back, like a real model
    names = [(t.get("function") or {}).get("name") for t in b.get("tools") or []]
    tool = next((n for n in ("shell", "exec_command") if n in names), None) if b["messages"][-1]["role"] == "user" else None
    shell = tool is not None
    args = '{"cmd":"ls"}' if tool == "shell" else '{"cmd":"echo kvotum-tool-ok"}'  # exec_command: Codex CLI
    if b.get("stream") and shell:  # a tool call streamed in pieces, as OpenAI does
        def ch(delta, finish=None):
            return f'data: {json.dumps({"id": "x", "object": "chat.completion.chunk", "model": b["model"], "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]})}\n\n'
        async def g():
            yield ch({"role": "assistant"})
            yield ch({"tool_calls": [{"index": 0, "id": "call_1", "type": "function", "function": {"name": tool, "arguments": ""}}]})
            yield ch({"tool_calls": [{"index": 0, "function": {"arguments": args[:7]}}]})
            yield ch({"tool_calls": [{"index": 0, "function": {"arguments": args[7:]}}]})
            yield ch({}, "tool_calls")
            yield f'data: {json.dumps({"id": "x", "object": "chat.completion.chunk", "model": b["model"], "choices": [], "usage": {"prompt_tokens": 40, "completion_tokens": 8, "total_tokens": 48}})}\n\n'
            yield "data: [DONE]\n\n"
        return StreamingResponse(g(), media_type="text/event-stream")
    if b.get("stream"):
        last_msg = b["messages"][-1]
        words = ["Привет", ", ", "мир"]
        if last_msg["role"] == "tool":  # answer with what the tool returned, so a client loop is visible end to end
            words = ["tool said: ", str(last_msg.get("content"))[:300]]
        async def g():
            for w in words:
                yield f'data: {json.dumps({"id":"x","object":"chat.completion.chunk","model":b["model"],"choices":[{"index":0,"delta":{"content":w},"finish_reason":None}]})}\n\n'
            yield f'data: {json.dumps({"id":"x","object":"chat.completion.chunk","model":b["model"],"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]})}\n\n'
            if (b.get("stream_options") or {}).get("include_usage"):
                u = {"prompt_tokens": 10, "completion_tokens": 3, "total_tokens": 13}
                if has(b, "messages"):
                    u["prompt_tokens_details"] = {"cached_tokens": 6}
                yield f'data: {json.dumps({"id":"x","object":"chat.completion.chunk","model":b["model"],"choices":[],"usage":u})}\n\n'
            yield "data: [DONE]\n\n"
        return StreamingResponse(g(), media_type="text/event-stream")
    usage = {"prompt_tokens": 1000, "completion_tokens": 500, "total_tokens": 1500}
    if has(b, "messages"):
        usage["prompt_tokens_details"] = {"cached_tokens": 800}
    if shell:
        msg = {"role": "assistant", "content": None, "tool_calls": [
            {"id": "call_1", "type": "function", "function": {"name": tool, "arguments": args}}]}
        return {"id": "x", "object": "chat.completion", "model": b["model"],
                "choices": [{"index": 0, "message": msg, "finish_reason": "tool_calls"}], "usage": usage}
    return {"id": "x", "object": "chat.completion", "model": b["model"],
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "ok:" + b["model"]}, "finish_reason": "stop"}],
            "usage": usage}


@app.post("/oa/v1/responses")
async def oa_responses(req: Request):
    b = await req.json()
    assert req.headers["authorization"].startswith("Bearer sk-up")
    LAST["oa_resp"] = {"headers": dict(req.headers), "body": b}
    usage = {"input_tokens": 1200, "input_tokens_details": {"cached_tokens": 1000}, "output_tokens": 30,
             "output_tokens_details": {"reasoning_tokens": 10}, "total_tokens": 1230}
    msg = {"type": "message", "id": "msg_up", "status": "completed", "role": "assistant",
           "content": [{"type": "output_text", "text": "resp:" + b["model"], "annotations": []}]}
    resp = {"id": "resp_up", "object": "response", "status": "completed", "model": b["model"], "output": [msg], "usage": usage}
    if not b.get("stream"):
        return resp
    evs = [("response.created", {"response": {**resp, "status": "in_progress", "output": [], "usage": None}}),
           ("response.output_item.added", {"output_index": 0, "item": {**msg, "status": "in_progress", "content": []}}),
           ("response.content_part.added", {"item_id": "msg_up", "output_index": 0, "content_index": 0, "part": {"type": "output_text", "text": "", "annotations": []}}),
           ("response.output_text.delta", {"item_id": "msg_up", "output_index": 0, "content_index": 0, "delta": "resp:"}),
           ("response.output_text.delta", {"item_id": "msg_up", "output_index": 0, "content_index": 0, "delta": b["model"]}),
           ("response.output_item.done", {"output_index": 0, "item": msg}),
           ("response.completed", {"response": resp})]
    async def g():
        for t, d in evs:
            yield f"event: {t}\ndata: {json.dumps({'type': t, **d})}\n\n"
    return StreamingResponse(g(), media_type="text/event-stream")


@app.post("/oa/v1/embeddings")
async def oa_emb(req: Request):
    return {"object": "list", "data": [{"embedding": [0.1, 0.2], "index": 0}], "model": "x", "usage": {"prompt_tokens": 7, "total_tokens": 7}}


@app.get("/an/v1/models")
async def an_models():
    return {"data": [{"id": "claude-sonnet-4-5-20250929", "display_name": "Claude Sonnet 4.5"}]}


@app.post("/an/v1/messages")
async def an_messages(req: Request):
    b = await req.json()
    assert req.headers["x-api-key"] == "sk-up-anthropic"
    assert all(m["role"] in ("user", "assistant") for m in b["messages"])
    LAST["an"] = {"headers": dict(req.headers), "body": b}
    cached = has(b, "system")
    if b.get("stream"):
        start_usage = {**AN_CACHED, "output_tokens": 1} if cached else {"input_tokens": 20, "output_tokens": 1}
        evs = [{"type": "message_start", "message": {"id": "msg1", "model": b["model"], "usage": start_usage}},
               {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
               {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hello"}},
               {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": " world"}},
               {"type": "content_block_stop", "index": 0},
               {"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 5}},
               {"type": "message_stop"}]
        async def g():
            for e in evs:
                yield f"event: {e['type']}\ndata: {json.dumps(e)}\n\n"
        return StreamingResponse(g(), media_type="text/event-stream")
    content = [{"type": "text", "text": "sys=" + str(b.get("system"))}]
    if b.get("tools"):
        content.append({"type": "tool_use", "id": "toolu_1", "name": b["tools"][0]["name"], "input": {"city": "Moscow"}})
    return {"id": "msg1", "type": "message", "role": "assistant", "model": b["model"], "content": content,
            "stop_reason": "tool_use" if b.get("tools") else "end_turn",
            "usage": {**AN_CACHED, "output_tokens": 50} if cached else {"input_tokens": 2000, "output_tokens": 1000}}


@app.post("/an/v1/messages/count_tokens")
async def an_count(req: Request):
    b = await req.json()
    assert req.headers["x-api-key"] == "sk-up-anthropic"
    LAST["an_count"] = {"headers": dict(req.headers), "body": b}
    return {"input_tokens": 42}
