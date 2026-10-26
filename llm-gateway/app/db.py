from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import DATABASE_URL

_kw = {}
if DATABASE_URL.startswith("sqlite"):
    _kw["connect_args"] = {"timeout": 30}
else:
    _kw.update(pool_size=20, max_overflow=40, pool_pre_ping=True)

engine = create_async_engine(DATABASE_URL, **_kw)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_session():
    async with SessionLocal() as s:
        yield s
