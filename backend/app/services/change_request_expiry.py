"""Expire pending bet change requests when the admin resolve window closes (1 min before kickoff)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.core.match_timing import ADMIN_RESOLVE_BEFORE
from app.models.bet import Bet
from app.models.bet_change_request import BetChangeRequest
from app.models.fixture import Fixture
from app.services.audit import log_action
from app.services.notification_service import (
    create_notification,
    notify_admins,
    build_change_request_auto_expired_user,
    build_change_request_auto_expired_admins_batch,
)

AUTO_EXPIRE_NOTES = (
    "Caducada automaticamente: el administrador no respondio antes del cierre "
    "(1 minuto antes del partido)."
)


async def expire_pending_change_requests(
    db: AsyncSession,
    redis: aioredis.Redis | None,
) -> int:
    """
    Mark pending change requests as expired when match is scheduled and
    admin resolve window has closed (1 minute before kickoff). Notifies each affected user and admins once per batch.
    """
    now = datetime.now(timezone.utc)
    threshold = now + ADMIN_RESOLVE_BEFORE

    stmt = (
        select(BetChangeRequest, Bet, Fixture)
        .join(Bet, BetChangeRequest.bet_id == Bet.id)
        .join(Fixture, Bet.fixture_id == Fixture.id)
        .where(
            and_(
                BetChangeRequest.status == "pending",
                Fixture.status == "scheduled",
                Fixture.match_date <= threshold,
            )
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    if not rows:
        return 0

    request_ids: list[str] = []

    for cr, bet, fixture in rows:
        cr.status = "expired"
        cr.resolved_at = now
        cr.admin_notes = AUTO_EXPIRE_NOTES
        cr.resolved_by = None

        request_ids.append(str(cr.id))
        ut, ub, up = build_change_request_auto_expired_user(
            request_id=str(cr.id),
            bet_id=str(bet.id),
            fixture_id=str(fixture.id),
            home_team=fixture.home_team,
            away_team=fixture.away_team,
        )
        await create_notification(
            db,
            redis,
            user_id=cr.user_id,
            type="change_request_expired",
            title=ut,
            body=ub,
            payload=up,
        )

    at, ab, ap = build_change_request_auto_expired_admins_batch(
        count=len(rows),
        request_ids=request_ids,
    )
    await notify_admins(
        db,
        redis,
        type="change_request_expired_batch",
        title=at,
        body=ab,
        payload=ap,
    )

    await log_action(
        db,
        user_id=None,
        action="change_request_auto_expired",
        detail={"count": len(rows), "request_ids": request_ids},
    )
    await db.flush()
    return len(rows)
