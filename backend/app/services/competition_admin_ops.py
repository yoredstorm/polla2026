"""Competition-scoped admin operations (action queue, stats)."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bet import Bet
from app.models.bet_change_request import BetChangeRequest
from app.models.fixture import Fixture
from app.models.group import Group
from app.models.user import User
from app.models.audit_log import AuditLog

CRITICAL_AUDIT_ACTIONS = (
    "admin_confirm_entry",
    "admin_confirm_extra",
    "extra_bet_cancelled_unpaid",
    "admin_approve_change_request",
    "admin_reject_change_request",
    "change_request_auto_expired",
    "admin_edit_fixture",
    "admin_settle",
    "admin_marquee_update",
    "fixture_betting_closed_snapshot",
    "password_reset_request",
    "admin_password_reset",
)


async def build_competition_action_queue(
    db: AsyncSession,
    *,
    competition_id: uuid.UUID,
    group: Group | None,
) -> dict:
    from app.core.match_timing import betting_close_at, fixture_deadline_fields
    from app.services.group_service import count_admin_pending_entries, count_all_phase_pending_entries

    now = datetime.now(timezone.utc)
    attention_before = now + timedelta(hours=2)

    pending_change = (
        await db.execute(
            select(func.count())
            .select_from(BetChangeRequest)
            .join(Bet, BetChangeRequest.bet_id == Bet.id)
            .join(Fixture, Bet.fixture_id == Fixture.id)
            .where(
                BetChangeRequest.status == "pending",
                Fixture.competition_id == competition_id,
            )
        )
    ).scalar() or 0

    pending_entries = 0
    pending_extras = 0
    pending_phase_enrollments = 0
    group_id = None
    if group:
        group_id = str(group.id)
        pending_entries = await count_admin_pending_entries(db, group)
        pending_phase_enrollments = await count_all_phase_pending_entries(db, group)
        pending_extras = (
            await db.execute(
                select(func.count())
                .select_from(Bet)
                .join(Fixture, Bet.fixture_id == Fixture.id)
                .where(
                    Bet.group_id == group.id,
                    Bet.amount > 0,
                    Bet.amount_confirmed == False,  # noqa: E712
                    Bet.cancelled_at.is_(None),
                    Fixture.status == "scheduled",
                    Fixture.competition_id == competition_id,
                )
            )
        ).scalar() or 0

    fx_rows = (
        await db.execute(
            select(Fixture)
            .where(
                Fixture.competition_id == competition_id,
                Fixture.match_date <= attention_before,
                Fixture.match_date >= now - timedelta(hours=6),
                Fixture.status.in_(("scheduled", "live", "finished")),
            )
            .order_by(Fixture.match_date.asc())
            .limit(12)
        )
    ).scalars().all()

    fixtures_attention = []
    for f in fx_rows:
        urgency = "normal"
        if f.status == "scheduled" and f.betting_open and betting_close_at(f) <= attention_before:
            urgency = "high" if betting_close_at(f) <= now + timedelta(minutes=30) else "medium"
        elif f.status == "live":
            urgency = "high"
        elif f.status == "finished" and (f.home_score is None or f.away_score is None):
            urgency = "high"
        elif getattr(f, "sync_mode", None) == "failed":
            urgency = "high"
        elif f.status == "scheduled" and f.betting_open:
            urgency = "medium"
        if urgency == "normal":
            continue
        deadlines = fixture_deadline_fields(f)
        fixtures_attention.append(
            {
                "id": str(f.id),
                "home_team": f.home_team,
                "away_team": f.away_team,
                "match_date": f.match_date.isoformat(),
                "status": f.status,
                "betting_open": f.betting_open,
                "is_locked": f.is_locked,
                "home_score": f.home_score,
                "away_score": f.away_score,
                "urgency": urgency,
                "betting_closes_at": (
                    deadlines["betting_closes_at"].isoformat()
                    if deadlines.get("betting_closes_at")
                    else None
                ),
                "sync_mode": getattr(f, "sync_mode", "manual"),
                "consecutive_sync_failures": getattr(f, "consecutive_sync_failures", 0),
            }
        )

    audit_q = (
        select(
            AuditLog.id,
            AuditLog.user_id,
            User.username.label("username"),
            AuditLog.action,
            AuditLog.detail,
            AuditLog.created_at,
        )
        .select_from(AuditLog)
        .outerjoin(User, AuditLog.user_id == User.id)
        .where(
            AuditLog.action.in_(CRITICAL_AUDIT_ACTIONS),
            AuditLog.competition_id == competition_id,
        )
        .order_by(AuditLog.created_at.desc())
        .limit(10)
    )
    audit_rows = (await db.execute(audit_q)).all()
    from app.services.audit_formatter import enrich_audit_rows

    enriched = await enrich_audit_rows(db, audit_rows)
    recent_critical = [
        {
            "id": str(r.id),
            "action": r.action,
            "action_label": label,
            "summary": summary,
            "created_at": r.created_at.isoformat(),
            "username": r.username,
        }
        for r, (label, summary) in zip(audit_rows, enriched)
    ]

    total_pending = (
        int(pending_change)
        + int(pending_entries)
        + int(pending_extras)
        + int(pending_phase_enrollments)
    )

    return {
        "pending": {
            "change_requests": int(pending_change),
            "password_resets": 0,
            "entries": int(pending_entries),
            "extras": int(pending_extras),
            "phase_enrollments": int(pending_phase_enrollments),
            "total": total_pending,
        },
        "group_id": group_id,
        "fixtures_attention": fixtures_attention,
        "recent_critical": recent_critical,
    }


async def competition_admin_stats(
    db: AsyncSession,
    *,
    competition_id: uuid.UUID,
    group: Group | None,
) -> dict:
    total_bets = (
        await db.execute(
            select(func.count())
            .select_from(Bet)
            .join(Fixture, Bet.fixture_id == Fixture.id)
            .where(Fixture.competition_id == competition_id)
        )
    ).scalar() or 0
    pending_bets = (
        await db.execute(
            select(func.count())
            .select_from(Bet)
            .join(Fixture, Bet.fixture_id == Fixture.id)
            .where(
                Fixture.competition_id == competition_id,
                Bet.points_earned.is_(None),
            )
        )
    ).scalar() or 0
    finished_fixtures = (
        await db.execute(
            select(func.count())
            .select_from(Fixture)
            .where(Fixture.competition_id == competition_id, Fixture.status == "finished")
        )
    ).scalar() or 0
    member_count = 0
    prize_pool = "0"
    if group:
        from app.models.group import GroupMember

        member_count = (
            await db.execute(
                select(func.count()).select_from(GroupMember).where(GroupMember.group_id == group.id)
            )
        ).scalar() or 0
        prize_pool = str(group.prize_pool)

    return {
        "total_users": member_count,
        "total_bets": int(total_bets),
        "pending_bets": int(pending_bets),
        "finished_fixtures": int(finished_fixtures),
        "total_prize_pools": prize_pool,
    }
