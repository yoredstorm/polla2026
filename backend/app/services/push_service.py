"""Web Push (VAPID) delivery for PWA notifications."""
from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.core.config import settings
from app.models.notification import Notification
from app.models.push_subscription import PushSubscription
from app.services.vapid_keys import (
    derive_public_key_from_private,
    env_public_matches_derived,
    normalize_vapid_key,
    vapid_env_configured,
)

logger = structlog.get_logger(__name__)

CHALLENGE_TYPES = frozenset({
    "challenge_pending",
    "challenge_accepted",
    "challenge_settled",
    "challenge_received",
    "challenge_resolved",
})

ADMIN_ACTIONABLE_TYPES = frozenset({
    "extra_bet_pending",
    "entry_pending",
    "change_request_pending",
    "password_reset_pending",
})


def vapid_configured() -> bool:
    return vapid_env_configured(settings.VAPID_PRIVATE_KEY, settings.VAPID_PUBLIC_KEY)


def get_vapid_public_key() -> str:
    """Public key derived from private — avoids Dokploy PUBLIC/PRIVATE mismatch."""
    derived = derive_public_key_from_private(settings.VAPID_PRIVATE_KEY)
    if not env_public_matches_derived(settings.VAPID_PRIVATE_KEY, settings.VAPID_PUBLIC_KEY):
        logger.warning(
            "vapid_public_key_env_mismatch",
            hint="VAPID_PUBLIC_KEY en env no coincide con la derivada de VAPID_PRIVATE_KEY; se usa la derivada",
        )
    return derived


def _parse_payload(n: Notification) -> dict[str, Any]:
    if not n.payload:
        return {}
    try:
        data = json.loads(n.payload)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def push_url_for_notification(n: Notification) -> str:
    """Deep link opened when the user taps a system notification."""
    p = _parse_payload(n)
    nid = str(n.id)
    t = n.type

    if t in ADMIN_ACTIONABLE_TYPES:
        return f"/notifications?focus={nid}"

    if t in ("fixture_finished", "fixture_betting_closed") and p.get("fixture_id"):
        return f"/fixtures/{p['fixture_id']}"
    if t in ("fixture_betting_closed_admin", "fixture_betting_soon_admin") and p.get("fixture_id"):
        return f"/admin/fixtures"
    if t in ("fixture_sync_failed_admin", "fixture_sync_ambiguous_admin") and p.get("fixture_id"):
        return f"/admin/live-sync"
    if t in ("change_request_resolved", "change_request_expired"):
        return "/my-bets?tab=pronosticos"
    if t == "change_request_expired_batch":
        return "/admin/requests"
    if t == "badge_earned":
        return "/dashboard#medallas"
    if t == "social_follow":
        if p.get("username"):
            return f"/u/{p['username']}"
        if p.get("user_id"):
            return f"/u/{p['user_id']}"
    if t == "following_bet" and p.get("fixture_id"):
        return f"/fixtures/{p['fixture_id']}"
    if t in ("entry_confirmed", "extra_confirmed"):
        return "/my-bets"
    if t == "password_reset_pending":
        return "/admin/requests?tab=passwords"
    if t == "password_reset_resolved":
        return "/login"
    if t == "comment_mention" and p.get("fixture_id"):
        return f"/fixtures/{p['fixture_id']}#comentarios"
    if t in CHALLENGE_TYPES:
        return "/my-bets?tab=retos"
    if p.get("fixture_id"):
        return f"/fixtures/{p['fixture_id']}"

    return f"/notifications?focus={nid}"


def _format_push_error(exc: Exception) -> str:
    from pywebpush import WebPushException

    if isinstance(exc, WebPushException) and exc.response is not None:
        status = getattr(exc.response, "status_code", None)
        body = (getattr(exc.response, "text", None) or "")[:200]
        return f"WebPush HTTP {status}: {body or exc}"
    return str(exc)


def _send_one_subscription(
    sub: PushSubscription,
    *,
    title: str,
    body: str,
    data: dict[str, Any],
) -> None:
    from pywebpush import webpush

    payload = json.dumps({"title": title, "body": body, **data}, default=str)
    # pywebpush only accepts vapid_private_key (not vapid_public_key).
    webpush(
        subscription_info={
            "endpoint": sub.endpoint,
            "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
        },
        data=payload,
        vapid_private_key=normalize_vapid_key(settings.VAPID_PRIVATE_KEY),
        vapid_claims={"sub": settings.VAPID_CLAIMS_SUB},
        ttl=86400,
        timeout=10,
    )


async def send_web_push_for_notification(
    db: AsyncSession, n: Notification
) -> tuple[int, str | None]:
    """Send push to all subscriptions. Returns (sent_count, last_error)."""
    if not vapid_configured():
        return 0, None

    from app.models.user import User
    from app.services.push_preferences import parse_push_preferences, should_send_push_for_type

    user_res = await db.execute(select(User).where(User.id == n.user_id))
    user = user_res.scalar_one_or_none()
    if user and not should_send_push_for_type(n.type, parse_push_preferences(user.push_preferences)):
        return 0, None

    result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == n.user_id)
    )
    subs = result.scalars().all()
    if not subs:
        return 0, None

    url = push_url_for_notification(n)
    data = {
        "url": url,
        "notification_id": str(n.id),
        "type": n.type,
    }
    if n.type in ADMIN_ACTIONABLE_TYPES:
        data["urgent"] = True
        data["priority"] = "high"
    sent = 0
    stale_endpoints: list[str] = []
    last_error: str | None = None

    for sub in subs:
        try:
            await asyncio.to_thread(
                _send_one_subscription,
                sub,
                title=n.title,
                body=n.body,
                data=data,
            )
            sent += 1
            logger.info(
                "web_push_sent",
                user_id=str(n.user_id),
                notification_id=str(n.id),
                endpoint=sub.endpoint[:80],
            )
        except Exception as exc:
            from pywebpush import WebPushException

            last_error = _format_push_error(exc)
            if isinstance(exc, WebPushException) and exc.response is not None:
                status = getattr(exc.response, "status_code", None)
                if status in (404, 410):
                    stale_endpoints.append(sub.endpoint)
                    continue
            logger.warning(
                "web_push_failed",
                user_id=str(n.user_id),
                endpoint=sub.endpoint[:80],
                error=last_error,
            )

    if stale_endpoints:
        await db.execute(delete(PushSubscription).where(PushSubscription.endpoint.in_(stale_endpoints)))
        await db.flush()

    if sent:
        logger.info(
            "web_push_batch_done",
            user_id=str(n.user_id),
            notification_id=str(n.id),
            sent=sent,
            total=len(subs),
        )
    elif subs:
        logger.warning(
            "web_push_batch_all_failed",
            user_id=str(n.user_id),
            notification_id=str(n.id),
            total=len(subs),
        )

    return sent, last_error


async def count_push_subscriptions(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    )
    return len(result.scalars().all())


async def upsert_push_subscription(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str | None,
) -> PushSubscription:
    existing = await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == endpoint)
    )
    sub = existing.scalar_one_or_none()
    if sub:
        sub.user_id = user_id
        sub.p256dh = p256dh
        sub.auth = auth
        sub.user_agent = user_agent
    else:
        sub = PushSubscription(
            user_id=user_id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            user_agent=user_agent,
        )
        db.add(sub)
    await db.flush()
    await db.refresh(sub)
    return sub


async def delete_push_subscription(db: AsyncSession, *, user_id: uuid.UUID, endpoint: str) -> bool:
    result = await db.execute(
        delete(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.endpoint == endpoint,
        )
    )
    await db.flush()
    return (result.rowcount or 0) > 0


async def delete_all_push_subscriptions_for_user(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        delete(PushSubscription).where(PushSubscription.user_id == user_id)
    )
    await db.flush()
    return result.rowcount or 0
