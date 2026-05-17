"""Notify users when they earn new badges after settlement."""
import uuid

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bet import Bet
from app.models.group import Group
from app.models.notification import Notification
from app.services.gamification_service import compute_badges, get_badge_catalog
from app.services.notification_service import build_badge_earned, create_notification


async def _badge_already_notified(db: AsyncSession, user_id: uuid.UUID, badge_id: str) -> bool:
    res = await db.execute(
        select(Notification.id)
        .where(
            Notification.user_id == user_id,
            Notification.type == "badge_earned",
            Notification.payload.contains(f'"badge_id": "{badge_id}"'),
        )
        .limit(1)
    )
    return res.scalar_one_or_none() is not None


async def notify_new_badges_for_fixture(
    db: AsyncSession,
    redis: aioredis.Redis,
    fixture_id: uuid.UUID,
) -> int:
    """Compare badge sets before/after is not persisted; notify on any earned badge once per settle."""
    group_res = await db.execute(
        select(Group).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)  # noqa: E712
    )
    group = group_res.scalar_one_or_none()
    group_id = group.id if group else None

    users_res = await db.execute(
        select(Bet.user_id).where(Bet.fixture_id == fixture_id).distinct()
    )
    user_ids = [row[0] for row in users_res.all()]
    catalog_by_id = {b["id"]: b for b in get_badge_catalog()}
    sent = 0

    for uid in user_ids:
        badges = await compute_badges(db, uid, group_id=group_id)
        for b in badges:
            bid = b["id"]
            if await _badge_already_notified(db, uid, bid):
                continue
            meta = catalog_by_id.get(bid)
            if not meta:
                continue
            title, body, payload = build_badge_earned(
                badge_id=b["id"],
                badge_label=b.get("label") or meta["label"],
            )
            await create_notification(
                db,
                redis,
                user_id=uid,
                type="badge_earned",
                title=title,
                body=body,
                payload=payload,
            )
            sent += 1
    return sent
