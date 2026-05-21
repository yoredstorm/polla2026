"""Notifications REST API — inbox and read state."""
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import select, func

from app.api.deps import CurrentUser, DBSession, RedisClient
from app.core.rate_limiter import limiter, GLOBAL_RATE_LIMIT
from app.models.notification import Notification
from app.schemas.common import PaginatedResponse, PaginationMeta
from app.services.notification_service import (
    notification_to_dict,
    mark_read,
    mark_all_read,
    get_unread_count,
    publish_to_user,
)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class NotificationOut(BaseModel):
    id: str
    user_id: str
    type: str
    title: str
    body: str
    payload: dict | list | str | None = None
    read_at: str | None
    created_at: str


@router.get("", response_model=PaginatedResponse[NotificationOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_notifications(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    filter: Literal["unread", "read", "all"] = Query("all", alias="filter"),
    unread_only: bool = Query(False, deprecated=True),
):
    effective = "unread" if unread_only else filter
    base = select(Notification).where(Notification.user_id == current_user.id)
    if effective == "unread":
        base = base.where(Notification.read_at == None)  # noqa: E711
    elif effective == "read":
        base = base.where(Notification.read_at != None)  # noqa: E711

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    rows = (
        await db.execute(
            base.order_by(Notification.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()

    return PaginatedResponse(
        data=[NotificationOut(**notification_to_dict(n)) for n in rows],
        pagination=PaginationMeta(
            total=total, page=page, limit=limit, total_pages=max(1, -(-total // limit)),
        ),
    )


@router.get("/unread-count")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def unread_count(request: Request, current_user: CurrentUser, db: DBSession):
    count = await get_unread_count(db, current_user.id)
    return {"count": count}


@router.patch("/{notification_id}/read")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def read_notification(
    request: Request,
    notification_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    n = await mark_read(db, notification_id, current_user.id)
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    await db.commit()
    unread = await get_unread_count(db, current_user.id)
    await publish_to_user(redis, current_user.id, {"type": "unread_count", "count": unread})
    return NotificationOut(**notification_to_dict(n))


@router.post("/read-all")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def read_all_notifications(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    count = await mark_all_read(db, current_user.id)
    await db.commit()
    await publish_to_user(redis, current_user.id, {"type": "unread_count", "count": 0})
    return {"marked": count}
