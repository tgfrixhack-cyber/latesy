import asyncio
import logging
import pathlib
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, select, text

from . import api_admin, api_user, oauth, payments, proxy, seo, status, support
from .config import ADMIN_EMAIL, ADMIN_PASSWORD
from .db import Base, SessionLocal, engine
from .models import Provider, User
from .security import hash_password

log = logging.getLogger("gateway")
STATIC = pathlib.Path(__file__).resolve().parent.parent / "static"


# create_all() never alters existing tables: columns added after the first release are created here
NEW_COLUMNS = {
    "models": {"cache_read_mult": "FLOAT", "cache_write_mult": "FLOAT"},
    "request_logs": {"cache_read_tokens": "INTEGER NOT NULL DEFAULT 0", "cache_write_tokens": "INTEGER NOT NULL DEFAULT 0"},
    "api_keys": {"limit_period": "VARCHAR(10) NOT NULL DEFAULT 'total'", "period_spent": "BIGINT NOT NULL DEFAULT 0",
                 "period_start": "TIMESTAMP", "allowed_models": "TEXT NOT NULL DEFAULT ''", "expires_at": "TIMESTAMP",
                 "rpm_limit": "INTEGER"},
}


def add_new_columns(conn):
    insp = inspect(conn)
    for table, cols in NEW_COLUMNS.items():
        have = {c["name"] for c in insp.get_columns(table)}
        for name, ddl in cols.items():
            if name not in have:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(add_new_columns)
    async with SessionLocal() as s:
        admin = (await s.execute(select(User).where(User.role == "admin"))).scalars().first()
        if not admin:
            if not ADMIN_PASSWORD:
                log.warning("ADMIN_PASSWORD не задан — администратор не создан. Первый зарегистрированный "
                            "пользователь станет админом.")
            else:
                existing = (await s.execute(select(User).where(User.email == ADMIN_EMAIL))).scalar_one_or_none()
                if existing:
                    existing.role = "admin"
                else:
                    s.add(User(email=ADMIN_EMAIL, name="Admin", role="admin",
                               password_hash=hash_password(ADMIN_PASSWORD)))
                await s.commit()


async def health_loop():
    while True:
        await asyncio.sleep(600)
        try:
            async with SessionLocal() as s:
                provs = (await s.execute(select(Provider).where(Provider.is_enabled == True))).scalars().all()
            for p in provs:
                if p.keys:
                    try:
                        await api_admin.test_provider(p)
                    except Exception:
                        pass
        except Exception as e:
            log.warning("health loop: %s", e)


@asynccontextmanager
async def lifespan(app):
    await init_db()
    task = asyncio.create_task(health_loop())
    yield
    task.cancel()


app = FastAPI(title="LLM Gateway", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    return JSONResponse({"detail": f"Ошибка в поле {'.'.join(str(x) for x in first.get('loc', [])[1:])}: "
                                   f"{first.get('msg', '')}"}, status_code=422)


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    log.exception("unhandled error on %s", request.url.path)
    msg = "Внутренняя ошибка сервиса. Повторите запрос; если ошибка повторяется, напишите в поддержку."
    if request.url.path.startswith("/v1/"):
        return JSONResponse({"error": {"message": msg, "type": "api_error", "code": "internal_error"}}, 500)
    return JSONResponse({"detail": msg}, status_code=500)


@app.middleware("http")
async def first_user_admin(request: Request, call_next):
    resp = await call_next(request)
    if request.url.path == "/api/auth/register" and resp.status_code == 200 and not ADMIN_PASSWORD:
        async with SessionLocal() as s:
            if not (await s.execute(select(User).where(User.role == "admin"))).scalars().first():
                u = (await s.execute(select(User).order_by(User.id))).scalars().first()
                if u:
                    u.role = "admin"
                    await s.commit()
    return resp


app.include_router(proxy.router)
app.include_router(api_user.router)
app.include_router(api_admin.router)
app.include_router(payments.router)
app.include_router(oauth.router)
app.include_router(status.router)
app.include_router(support.router)
app.include_router(support.admin_router)
app.include_router(seo.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.api_route("/api/hello", methods=["GET", "HEAD"], include_in_schema=False)
async def hello():
    """Connection probe that Claude Code sends to Anthropic-format gateways."""
    return Response(status_code=200)


app.mount("/static", StaticFiles(directory=STATIC), name="static")
