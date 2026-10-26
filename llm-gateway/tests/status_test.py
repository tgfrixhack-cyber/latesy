"""Run after e2e.py (DATA_DIR=data_test): public status page aggregation."""
import asyncio
import datetime as dt
import sqlite3
import uuid

import httpx

from app import status
from app.db import SessionLocal

db = sqlite3.connect("data_test/gateway.db")
t = dt.datetime.utcnow()
rows = []
for i in range(6):  # gpt-4o: 4 of 6 recent requests failed with 5xx -> down
    rows.append(("gpt-4o", 502 if i < 4 else 200, 800, t - dt.timedelta(minutes=5 + i)))
for i in range(10):  # gpt-4o-mini: 3 of 10 (+ real e2e traffic) -> degraded
    rows.append(("gpt-4o-mini", 503 if i < 3 else 200, 300, t - dt.timedelta(minutes=2 + i)))
for i in range(5):  # client errors must not count
    rows.append(("claude-sonnet-4-5", 402, 5, t - dt.timedelta(minutes=1)))
rows.append(("claude-sonnet-4-5", 500, 50, t - dt.timedelta(hours=5)))  # old failure: only in 24h stats
for m, sc, lat, ts in rows:
    db.execute("insert into request_logs(request_id,user_id,model,endpoint,stream,prompt_tokens,completion_tokens,cost,price,"
               "latency_ms,status_code,error,ip,attempts,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
               (uuid.uuid4().hex, 1, m, "chat", 0, 0, 0, 0, 0, lat, sc, "", "", 1, ts.strftime("%Y-%m-%d %H:%M:%S.%f")))
db.commit()


async def main():
    async with SessionLocal() as s:
        return await status.build(s)

d = asyncio.run(main())
M = {m["id"]: m for m in d["models"]}
print({k: (v["status"], v["requests_24h"], v["errors_24h"], v["error_rate"], v["latency_ms"]) for k, v in M.items()})
assert d["overall"] == "down"
assert M["gpt-4o"]["status"] == "down" and M["gpt-4o-mini"]["status"] == "degraded"
assert M["claude-sonnet-4-5"]["status"] == "ok" and M["claude-sonnet-4-5"]["errors_24h"] == 1
assert len(M["gpt-4o"]["hours"]) == 24 and M["gpt-4o"]["hours"][-1]["errors"] >= 1 or M["gpt-4o"]["hours"][-2]["errors"] >= 1
assert sum(h["requests"] for h in M["claude-sonnet-4-5"]["hours"]) == M["claude-sonnet-4-5"]["requests_24h"]
r = httpx.get("http://127.0.0.1:8000/api/public/status")
assert r.status_code == 200 and "models" in r.json()
print("STATUS OK")
