"""Support tickets: users create requests with screenshots/videos, admins reply and close them."""
import datetime as dt
import hashlib
import hmac
import time
import urllib.parse

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .billing import usd
from .config import DATA_DIR, SECRET_KEY
from .db import get_session
from .models import Attachment, Ticket, TicketMessage, User, now
from .security import admin_user, current_user

FILES = DATA_DIR / "support"
FILES.mkdir(parents=True, exist_ok=True)

MAX_IMAGE = 10 * 1024 * 1024
MAX_VIDEO = 100 * 1024 * 1024
MAX_FILE = 10 * 1024 * 1024
MAX_PER_MESSAGE = 6
DAILY_BYTES = 500 * 1024 * 1024
MAX_ACTIVE = 5            # одновременно открытых обращений у пользователя
URL_TTL = 6 * 3600
CATEGORIES = {"payment": "Оплата и баланс", "api": "API и ошибки", "models": "Модели", "account": "Аккаунт",
              "other": "Другое"}
STATUS = {"open": "Ждёт ответа", "answered": "Есть ответ", "closed": "Закрыт", "canceled": "Отменён"}

router = APIRouter(prefix="/api/support", tags=["support"])
admin_router = APIRouter(prefix="/api/admin/support", dependencies=[Depends(admin_user)], tags=["support"])


# ------------------------------------------------------------------ files
def sniff(head: bytes, name: str) -> tuple[str, str] | None:
    """Detect type by content, not by the client's word. Returns (mime, kind)."""
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", "image"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", "image"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif", "image"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp", "image"
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        return ("video/quicktime" if brand == b"qt  " else "video/mp4"), "video"
    if head.startswith(b"\x1a\x45\xdf\xa3"):
        return "video/webm", "video"
    if head.startswith(b"%PDF-"):
        return "application/pdf", "file"
    low = name.lower()
    if low.endswith((".txt", ".log", ".json", ".csv")) and b"\x00" not in head:
        return "text/plain", "file"
    return None


def kind_of(mime: str) -> str:
    return "image" if mime.startswith("image/") else "video" if mime.startswith("video/") else "file"


def sign(aid: str, exp: int) -> str:
    return hmac.new(SECRET_KEY.encode(), f"att:{aid}:{exp}".encode(), hashlib.sha256).hexdigest()[:32]


def att_out(a: Attachment) -> dict:
    exp = int(time.time()) + URL_TTL
    return {"id": a.id, "filename": a.filename, "mime": a.mime, "size": a.size, "kind": kind_of(a.mime),
            "url": f"/api/support/files/{a.id}?exp={exp}&sig={sign(a.id, exp)}"}


@router.post("/upload")
async def upload(request: Request, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    name = urllib.parse.unquote(request.headers.get("x-filename", "") or "file")[:150].replace("/", "_").replace("\\", "_")
    since = now() - dt.timedelta(days=1)
    used = (await session.execute(select(func.coalesce(func.sum(Attachment.size), 0))
                                  .where(Attachment.user_id == user.id, Attachment.created_at >= since))).scalar()
    a = Attachment(user_id=user.id, filename=name, mime="", size=0)
    session.add(a)
    await session.flush()
    path, size, head, info, limit = FILES / a.id, 0, b"", None, MAX_VIDEO
    try:
        with open(path, "wb") as f:
            async for chunk in request.stream():
                if not info:
                    head += chunk
                    if len(head) >= 16 or not chunk:
                        info = sniff(head[:64], name)
                        if not info:
                            raise HTTPException(415, "Можно прикладывать картинки (PNG, JPG, GIF, WebP), видео (MP4, MOV, WebM), PDF и текстовые логи")
                        limit = {"image": MAX_IMAGE, "video": MAX_VIDEO}.get(info[1], MAX_FILE)
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"Файл больше {limit // 1024 // 1024} МБ. Сожмите его или обрежьте видео")
                if used + size > DAILY_BYTES:
                    raise HTTPException(413, "Превышен дневной лимит загрузок (500 МБ). Попробуйте завтра")
                f.write(chunk)
        if not info:
            info = sniff(head[:64], name)
            if not info or not size:
                raise HTTPException(415, "Пустой или неподдерживаемый файл")
    except BaseException:
        path.unlink(missing_ok=True)
        await session.rollback()
        raise
    a.mime, a.size = info[0], size
    # чистим брошенные (не отправленные) загрузки старше суток
    old = (await session.execute(select(Attachment).where(Attachment.user_id == user.id, Attachment.message_id.is_(None),
                                                          Attachment.created_at < since))).scalars().all()
    for o in old:
        (FILES / o.id).unlink(missing_ok=True)
        await session.delete(o)
    await session.commit()
    return att_out(a)


@router.delete("/upload/{aid}")
async def delete_upload(aid: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    a = await session.get(Attachment, aid)
    if a and a.user_id == user.id and a.message_id is None:
        (FILES / a.id).unlink(missing_ok=True)
        await session.delete(a)
        await session.commit()
    return {"ok": True}


@router.get("/files/{aid}")
async def get_file(aid: str, exp: int = 0, sig: str = "", session: AsyncSession = Depends(get_session)):
    if exp < time.time() or not hmac.compare_digest(sign(aid, exp), sig):
        raise HTTPException(403, "Ссылка на файл устарела — обновите страницу")
    a = await session.get(Attachment, aid)
    if not a or not (FILES / a.id).exists():
        raise HTTPException(404, "Файл не найден")
    inline = kind_of(a.mime) in ("image", "video")
    return FileResponse(FILES / a.id, media_type=a.mime, filename=a.filename,
                        content_disposition_type="inline" if inline else "attachment",
                        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600",
                                 "Content-Security-Policy": "default-src 'none'; sandbox"})


# ------------------------------------------------------------------ helpers
async def attach(session, ids: list[str], user_id: int, message_id: int):
    ids = list(dict.fromkeys(ids or []))
    if len(ids) > MAX_PER_MESSAGE:
        raise HTTPException(400, f"Не больше {MAX_PER_MESSAGE} файлов в одном сообщении")
    if not ids:
        return
    rows = (await session.execute(select(Attachment).where(Attachment.id.in_(ids)))).scalars().all()
    if len(rows) != len(ids) or any(a.user_id != user_id or a.message_id is not None or not a.size for a in rows):
        raise HTTPException(400, "Файл не найден — загрузите его ещё раз")
    for a in rows:
        a.message_id = message_id


def clean_body(body: str, required: bool = True) -> str:
    body = (body or "").strip()
    if len(body) > 10000:
        raise HTTPException(400, "Сообщение слишком длинное (максимум 10 000 символов)")
    if required and not body:
        raise HTTPException(400, "Напишите текст сообщения")
    return body


def ticket_out(t: Ticket, *, admin=False, email="", last="", count=0) -> dict:
    d = {"id": t.id, "subject": t.subject, "category": t.category, "category_name": CATEGORIES.get(t.category, "Другое"),
         "status": t.status, "status_name": STATUS.get(t.status, t.status),
         "unread": t.admin_unread if admin else t.user_unread,
         "created_at": t.created_at.isoformat(), "updated_at": t.updated_at.isoformat(),
         "closed_at": t.closed_at.isoformat() if t.closed_at else None, "last": last[:160], "messages": count}
    if admin:
        d["user_email"], d["user_id"] = email, t.user_id
    return d


async def thread(session, t: Ticket) -> list[dict]:
    msgs = (await session.execute(select(TicketMessage).where(TicketMessage.ticket_id == t.id)
                                  .order_by(TicketMessage.id))).scalars().all()
    atts = (await session.execute(select(Attachment).where(Attachment.message_id.in_([m.id for m in msgs]))
                                  .order_by(Attachment.created_at))).scalars().all() if msgs else []
    by: dict = {}
    for a in atts:
        by.setdefault(a.message_id, []).append(att_out(a))
    return [{"id": m.id, "author": m.author, "body": m.body, "created_at": m.created_at.isoformat(),
             "attachments": by.get(m.id, [])} for m in msgs]


async def add_msg(session, t: Ticket, author: str, author_id: int | None, body: str, att_ids=None) -> TicketMessage:
    m = TicketMessage(ticket_id=t.id, author=author, author_id=author_id, body=body)
    session.add(m)
    await session.flush()
    if att_ids:
        await attach(session, att_ids, author_id, m.id)
    t.updated_at = now()
    return m


async def list_query(session, cond, admin=False):
    from sqlalchemy.orm import aliased
    m2, m3 = aliased(TicketMessage), aliased(TicketMessage)
    last_id = (select(func.max(m2.id)).where(m2.ticket_id == Ticket.id, m2.author != "system")
               .correlate(Ticket).scalar_subquery())
    cnt = (select(func.count(m3.id)).where(m3.ticket_id == Ticket.id)
           .correlate(Ticket).scalar_subquery())
    rows = (await session.execute(
        select(Ticket, User.email, TicketMessage.body, cnt).join(User, User.id == Ticket.user_id)
        .outerjoin(TicketMessage, TicketMessage.id == last_id).where(*cond)
        .order_by(Ticket.updated_at.desc()).limit(300))).all()
    return [ticket_out(t, admin=admin, email=e, last=b or "", count=c) for t, e, b, c in rows]


# ------------------------------------------------------------------ user API
class NewTicket(BaseModel):
    subject: str
    body: str
    category: str = "other"
    attachments: list[str] = []


class Reply(BaseModel):
    body: str = ""
    attachments: list[str] = []
    close: bool = False


async def own_ticket(session, tid: int, user: User) -> Ticket:
    t = await session.get(Ticket, tid)
    if not t or t.user_id != user.id:
        raise HTTPException(404, "Обращение не найдено")
    return t


@router.get("/tickets")
async def my_tickets(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    return await list_query(session, [Ticket.user_id == user.id])


@router.get("/unread")
async def my_unread(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    n = (await session.execute(select(func.count()).where(Ticket.user_id == user.id, Ticket.user_unread == True))).scalar()
    out = {"count": n}
    if user.role == "admin":
        out["admin_waiting"] = (await session.execute(select(func.count()).where(Ticket.status == "open"))).scalar()
    return out


@router.post("/tickets")
async def create_ticket(data: NewTicket, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    subject = " ".join((data.subject or "").split())
    if len(subject) < 3:
        raise HTTPException(400, "Коротко опишите проблему в заголовке (от 3 символов)")
    if len(subject) > 150:
        raise HTTPException(400, "Заголовок слишком длинный (максимум 150 символов)")
    body = clean_body(data.body)
    active = (await session.execute(select(func.count()).where(Ticket.user_id == user.id,
                                                               Ticket.status.in_(["open", "answered"])))).scalar()
    if active >= MAX_ACTIVE:
        raise HTTPException(429, f"У вас уже {active} открытых обращений. Дождитесь ответа или закройте решённые")
    t = Ticket(user_id=user.id, subject=subject, category=data.category if data.category in CATEGORIES else "other")
    session.add(t)
    await session.flush()
    await add_msg(session, t, "user", user.id, body, data.attachments)
    await session.commit()
    return ticket_out(t)


@router.get("/tickets/{tid}")
async def my_ticket(tid: int, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    t = await own_ticket(session, tid, user)
    if t.user_unread:
        t.user_unread = False
        await session.commit()
    return {**ticket_out(t), "thread": await thread(session, t)}


@router.post("/tickets/{tid}/messages")
async def my_reply(tid: int, data: Reply, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    t = await own_ticket(session, tid, user)
    body = clean_body(data.body, required=not data.attachments)
    if t.status in ("closed", "canceled"):
        t.closed_at = None
        await add_msg(session, t, "system", None, "Обращение открыто снова")
    await add_msg(session, t, "user", user.id, body, data.attachments)
    t.status, t.admin_unread = "open", True
    await session.commit()
    return {"ok": True}


@router.post("/tickets/{tid}/cancel")
async def my_cancel(tid: int, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    t = await own_ticket(session, tid, user)
    if t.status in ("open", "answered"):
        t.status, t.closed_at = ("canceled" if t.status == "open" else "closed"), now()
        await add_msg(session, t, "system", None,
                      "Пользователь отменил обращение" if t.status == "canceled" else "Пользователь закрыл обращение: вопрос решён")
        await session.commit()
    return ticket_out(t)


# ------------------------------------------------------------------ admin API
@admin_router.get("/tickets")
async def admin_tickets(status: str = "open", q: str = "", session: AsyncSession = Depends(get_session)):
    cond = []
    if status == "open":
        cond.append(Ticket.status == "open")
    elif status == "active":
        cond.append(Ticket.status.in_(["open", "answered"]))
    elif status == "closed":
        cond.append(Ticket.status.in_(["closed", "canceled"]))
    q = q.strip()
    if q:
        like = f"%{q.lower()}%"
        cond.append(or_(func.lower(Ticket.subject).like(like), func.lower(User.email).like(like),
                        Ticket.id == (int(q.lstrip("#")) if q.lstrip("#").isdigit() else -1)))
    counts = dict((await session.execute(select(Ticket.status, func.count()).group_by(Ticket.status))).all())
    return {"tickets": await list_query(session, cond, admin=True), "counts": counts}


@admin_router.get("/tickets/{tid}")
async def admin_ticket(tid: int, session: AsyncSession = Depends(get_session)):
    t = await session.get(Ticket, tid)
    if not t:
        raise HTTPException(404, "Обращение не найдено")
    if t.admin_unread:
        t.admin_unread = False
        await session.commit()
    u = await session.get(User, t.user_id)
    others = (await session.execute(select(func.count()).where(Ticket.user_id == t.user_id))).scalar()
    return {**ticket_out(t, admin=True, email=u.email if u else ""), "thread": await thread(session, t),
            "user": {"id": u.id, "email": u.email, "name": u.name, "balance": usd(u.balance), "is_blocked": u.is_blocked,
                     "created_at": u.created_at.isoformat(), "tickets": others} if u else None}


@admin_router.post("/tickets/{tid}/messages")
async def admin_reply(tid: int, data: Reply, admin: User = Depends(admin_user), session: AsyncSession = Depends(get_session)):
    t = await session.get(Ticket, tid)
    if not t:
        raise HTTPException(404, "Обращение не найдено")
    body = clean_body(data.body, required=not data.attachments)
    await add_msg(session, t, "admin", admin.id, body, data.attachments)
    t.user_unread, t.admin_unread = True, False
    if data.close:
        t.status, t.closed_at = "closed", now()
        await add_msg(session, t, "system", None, "Поддержка закрыла обращение")
    else:
        t.status, t.closed_at = "answered", None
    await session.commit()
    return {"ok": True}


class StatusIn(BaseModel):
    status: str


@admin_router.post("/tickets/{tid}/status")
async def admin_status(tid: int, data: StatusIn, session: AsyncSession = Depends(get_session)):
    t = await session.get(Ticket, tid)
    if not t:
        raise HTTPException(404, "Обращение не найдено")
    if data.status not in ("open", "closed") or t.status == data.status:
        return ticket_out(t, admin=True)
    if data.status == "closed":
        t.status, t.closed_at, t.user_unread = "closed", now(), True
        await add_msg(session, t, "system", None, "Поддержка закрыла обращение")
    else:
        t.status, t.closed_at = "open", None
        await add_msg(session, t, "system", None, "Обращение открыто снова")
    await session.commit()
    return ticket_out(t, admin=True)
