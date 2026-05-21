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
    create_notification,
)
from app.services.push_service import (
    vapid_configured,
    get_vapid_public_key,
    upsert_push_subscription,
    delete_push_subscription,
    delete_all_push_subscriptions_for_user,
    count_push_subscriptions,
)
from app.services.vapid_keys import env_public_matches_derived
from app.core.config import settings
from app.core.config import settings

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


class PushSubscribeKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeIn(BaseModel):
    endpoint: str
    keys: PushSubscribeKeys
    expirationTime: int | None = None


class PushUnsubscribeIn(BaseModel):
    endpoint: str


@router.get("/push/vapid-public-key")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def push_vapid_public_key(request: Request, current_user: CurrentUser):
    if not vapid_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "Web Push no configurado o clave VAPID invalida en el servidor. "
                "Genera un par nuevo con: python scripts/generate_vapid_keys.py"
            ),
        )
    try:
        public_key = get_vapid_public_key()
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"publicKey": public_key}


@router.post("/push/subscribe")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def push_subscribe(
    request: Request,
    body: PushSubscribeIn,
    current_user: CurrentUser,
    db: DBSession,
):
    if not vapid_configured():
        raise HTTPException(status_code=503, detail="Web Push no configurado en el servidor")
    if not body.endpoint or not body.keys.p256dh or not body.keys.auth:
        raise HTTPException(status_code=400, detail="Suscripcion push invalida")
    ua = request.headers.get("user-agent")
    await upsert_push_subscription(
        db,
        user_id=current_user.id,
        endpoint=body.endpoint,
        p256dh=body.keys.p256dh,
        auth=body.keys.auth,
        user_agent=ua[:512] if ua else None,
    )
    return {"ok": True}


@router.get("/push/status")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def push_status(request: Request, current_user: CurrentUser, db: DBSession):
    count = await count_push_subscriptions(db, current_user.id)
    configured = vapid_configured()
    key_match = True
    if configured:
        key_match = env_public_matches_derived(
            settings.VAPID_PRIVATE_KEY, settings.VAPID_PUBLIC_KEY
        )
    return {
        "vapidConfigured": configured,
        "vapidKeyPairConsistent": key_match,
        "serverSubscriptionCount": count,
        "serverRegistered": count > 0,
    }


@router.post("/push/test")
@limiter.limit("10/minute")
async def push_test(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    """Send a test in-app notification + Web Push to the current user's devices."""
    if not vapid_configured():
        raise HTTPException(status_code=503, detail="Web Push no configurado en el servidor")
    sub_count = await count_push_subscriptions(db, current_user.id)
    if sub_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No hay suscripcion guardada en el servidor. Activa notificaciones de nuevo en /notifications.",
        )
    n = await create_notification(
        db,
        redis,
        user_id=current_user.id,
        type="push_test",
        title="Prueba de notificaciones",
        body="Si ves este mensaje en el celular, Web Push funciona correctamente.",
        payload={"source": "push_test"},
    )
    push_delivered = int(getattr(n, "push_sent", 0) or 0)
    if push_delivered == 0:
        last_err = getattr(n, "push_last_error", None) or ""
        detail = (
            "La notificacion se guardo pero el push no se entrego a ningun dispositivo. "
            "Desactiva y vuelve a activar notificaciones en este telefono."
        )
        if last_err:
            detail += f" Detalle: {last_err}"
        raise HTTPException(status_code=502, detail=detail)
    return {
        "ok": True,
        "notificationId": str(n.id),
        "serverSubscriptionCount": sub_count,
        "pushDelivered": push_delivered,
    }


@router.delete("/push/subscriptions")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def push_clear_all_subscriptions(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
):
    """Remove all push subscriptions for the current user (fixes stale FCM endpoints)."""
    removed = await delete_all_push_subscriptions_for_user(db, current_user.id)
    return {"ok": True, "removed": removed}


@router.delete("/push/unsubscribe")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def push_unsubscribe(
    request: Request,
    body: PushUnsubscribeIn,
    current_user: CurrentUser,
    db: DBSession,
):
    if not body.endpoint:
        raise HTTPException(status_code=400, detail="endpoint requerido")
    await delete_push_subscription(db, user_id=current_user.id, endpoint=body.endpoint)
    return {"ok": True}
