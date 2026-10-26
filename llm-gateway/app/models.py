import datetime as dt
import uuid

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now():
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


# Money is stored as integer nano-USD (1 USD = 1_000_000_000) to avoid float errors.
NANO = 1_000_000_000


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="user")  # user | admin
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    balance: Mapped[int] = mapped_column(BigInteger, default=0)
    markup: Mapped[float | None] = mapped_column(Float, nullable=True)  # personal markup %, overrides default
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)


class ApiKey(Base):
    __tablename__ = "api_keys"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100), default="default")
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display: Mapped[str] = mapped_column(String(40))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    spend_limit: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    spent: Mapped[int] = mapped_column(BigInteger, default=0)
    # restrictions, see app/keys.py
    limit_period: Mapped[str] = mapped_column(String(10), default="total", server_default="total")  # total | day | month
    period_spent: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    period_start: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    allowed_models: Mapped[str] = mapped_column(Text, default="", server_default="")  # JSON list of public ids, empty = all
    expires_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    rpm_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    last_used_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)


class Provider(Base):
    __tablename__ = "providers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(30))  # openai | anthropic | openai_compatible
    preset: Mapped[str] = mapped_column(String(30), default="custom")
    base_url: Mapped[str] = mapped_column(String(500))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[int] = mapped_column(Integer, default=100)
    timeout: Mapped[int] = mapped_column(Integer, default=300)
    extra_headers: Mapped[str] = mapped_column(Text, default="{}")
    status: Mapped[str] = mapped_column(String(20), default="unknown")
    last_error: Mapped[str] = mapped_column(Text, default="")
    last_check_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    keys: Mapped[list["ProviderKey"]] = relationship(cascade="all, delete-orphan", lazy="selectin")


class ProviderKey(Base):
    __tablename__ = "provider_keys"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("providers.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(100), default="")
    key_enc: Mapped[str] = mapped_column(Text)
    display: Mapped[str] = mapped_column(String(40))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | paused | error
    paused_until: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    last_error: Mapped[str] = mapped_column(Text, default="")
    uses: Mapped[int] = mapped_column(Integer, default=0)
    spent: Mapped[int] = mapped_column(BigInteger, default=0)
    last_used_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)


class Model(Base):
    __tablename__ = "models"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    family: Mapped[str] = mapped_column(String(50), default="")
    kind: Mapped[str] = mapped_column(String(20), default="chat")  # chat | embedding
    context_length: Mapped[int] = mapped_column(Integer, default=128000)
    max_output: Mapped[int] = mapped_column(Integer, default=4096)
    supports_vision: Mapped[bool] = mapped_column(Boolean, default=False)
    supports_tools: Mapped[bool] = mapped_column(Boolean, default=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    cost_in: Mapped[float] = mapped_column(Float, default=0)   # USD per 1M tokens (your purchase price)
    cost_out: Mapped[float] = mapped_column(Float, default=0)
    price_in: Mapped[float | None] = mapped_column(Float, nullable=True)  # USD per 1M (sale); null => cost*(1+markup)
    price_out: Mapped[float | None] = mapped_column(Float, nullable=True)
    # prompt-cache prices as a share of the input price; null => default for the provider type (billing.cache_mults)
    cache_read_mult: Mapped[float | None] = mapped_column(Float, nullable=True)
    cache_write_mult: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    routes: Mapped[list["ModelRoute"]] = relationship(cascade="all, delete-orphan", lazy="selectin",
                                                      order_by="ModelRoute.priority")


class ModelRoute(Base):
    __tablename__ = "model_routes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    model_id: Mapped[int] = mapped_column(ForeignKey("models.id", ondelete="CASCADE"), index=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("providers.id", ondelete="CASCADE"), index=True)
    upstream_model: Mapped[str] = mapped_column(String(200))
    priority: Mapped[int] = mapped_column(Integer, default=0)


class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(20))  # topup | adjust | bonus | refund
    amount: Mapped[int] = mapped_column(BigInteger)
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now, index=True)


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    method: Mapped[str] = mapped_column(String(20))
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(10))
    amount_usd: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | paid | canceled
    external_id: Mapped[str] = mapped_column(String(100), default="", index=True)
    pay_url: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now, index=True)
    paid_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)


class RequestLog(Base):
    __tablename__ = "request_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    request_id: Mapped[str] = mapped_column(String(40), index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    api_key_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    model: Mapped[str] = mapped_column(String(200), default="", index=True)
    provider_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    provider_key_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    endpoint: Mapped[str] = mapped_column(String(50), default="")
    stream: Mapped[bool] = mapped_column(Boolean, default=False)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    # parts of prompt_tokens read from / written to the prompt cache; server default keeps raw INSERTs working
    cache_read_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    cache_write_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    cost: Mapped[int] = mapped_column(BigInteger, default=0)
    price: Mapped[int] = mapped_column(BigInteger, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    status_code: Mapped[int] = mapped_column(Integer, default=200)
    error: Mapped[str] = mapped_column(Text, default="")
    ip: Mapped[str] = mapped_column(String(64), default="")
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now, index=True)


class Referral(Base):
    __tablename__ = "referrals"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)  # приглашённый
    referrer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    friend_bonus: Mapped[int] = mapped_column(BigInteger, default=0)
    inviter_bonus: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    rewarded_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)


class Ticket(Base):
    __tablename__ = "tickets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    subject: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(30), default="other")
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)  # open | answered | closed | canceled
    user_unread: Mapped[bool] = mapped_column(Boolean, default=False)
    admin_unread: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now, index=True)
    closed_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)


class TicketMessage(Base):
    __tablename__ = "ticket_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    author: Mapped[str] = mapped_column(String(10))  # user | admin | system
    author_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)


class Attachment(Base):
    __tablename__ = "ticket_attachments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[int] = mapped_column(Integer, index=True)          # кто загрузил
    message_id: Mapped[int | None] = mapped_column(ForeignKey("ticket_messages.id", ondelete="CASCADE"),
                                                   nullable=True, index=True)
    filename: Mapped[str] = mapped_column(String(200))
    mime: Mapped[str] = mapped_column(String(60))
    size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
