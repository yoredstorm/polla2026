"""
Admin endpoints — all protected by CurrentAdmin dependency.
"""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal, Optional

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from app.core.cors_utils import apply_cors_headers
from pydantic import BaseModel, field_validator
from sqlalchemy import select, func, and_

from app.api.deps import CurrentAdmin, DBSession, RedisClient
from app.core.match_timing import ADMIN_RESOLVE_BEFORE
from app.core.rate_limiter import limiter
from app.models.bet import Bet
from app.models.bet_change_request import BetChangeRequest
from app.models.password_reset_request import PasswordResetRequest
from app.models.fixture import Fixture
from app.models.group import Group, GroupMember, GroupEntryProof
from app.models.user import User, RefreshToken
from app.services.bet_service import (
    settle_fixture_bets,
    settle_single_bet,
    repair_unconfirmed_extra_settlement,
    repair_unpaid_extra_cancellations,
    cancel_unpaid_extras_for_fixture,
    can_resolve_change_request_for_fixture,
    is_fixture_bettable,
)
from app.services.audit import log_action
from app.services.payment_upload_service import (
    entry_proof_data_url,
    payment_qr_public_url,
    resolve_readable_path,
    save_group_payment_qr,
)
from app.core.security import hash_password, generate_temporary_password
from app.services.notification_service import (
    notify_admins,
    build_entry_pending,
    create_notification,
    build_change_request_resolved,
    build_fixture_finished,
    notify_all_active_users,
    broadcast_polla_updated,
    broadcast_fixture_updated,
    resolve_actionable_notifications,
    build_entry_confirmed,
    build_extra_confirmed,
    build_password_reset_resolved,
)
import structlog

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_RATE = "30/minute"


# ── Schemas ──────────────────────────────────────────────────────────

class FixtureResultIn(BaseModel):
    home_score: int
    away_score: int
    status: Literal["finished"] = "finished"


class FixtureStatusIn(BaseModel):
    status: Literal["scheduled", "live", "finished", "cancelled"]


class SettleResponse(BaseModel):
    settled_count: int
    skipped_unconfirmed_extras: int = 0
    fixture_id: str
    home_score: int
    away_score: int
    status: str


class AdminStatsOut(BaseModel):
    total_users: int
    total_bets: int
    pending_bets: int
    finished_fixtures: int
    total_prize_pools: str


class AdminUserPatch(BaseModel):
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None


class AdminGroupPatch(BaseModel):
    entry_fee: Optional[Decimal] = None
    currency: Optional[str] = None
    bet_amount_mode: Optional[Literal["single_entry", "per_bet"]] = None
    fixed_bet_amount: Optional[Decimal] = None
    is_active: Optional[bool] = None
    challenge_max_stake: Optional[int] = None
    challenge_daily_limit: Optional[int] = None
    challenge_tournament_limit: Optional[int] = None
    challenges_enabled: Optional[bool] = None
    payment_contact_name: Optional[str] = None
    payment_phone: Optional[str] = None


def _group_payment_dict(group: Group) -> dict:
    return {
        "payment_contact_name": group.payment_contact_name,
        "payment_phone": group.payment_phone,
        "payment_qr_url": payment_qr_public_url(group.id) if group.payment_qr_path else None,
    }


# ── Fixtures ─────────────────────────────────────────────────────────

@router.get("/fixtures")
@limiter.limit(ADMIN_RATE)
async def list_fixtures(
    request: Request,
    admin: CurrentAdmin,
    db: DBSession,
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    base = select(Fixture)
    if status_filter:
        base = base.where(Fixture.status == status_filter)
    base = base.order_by(Fixture.match_date.desc())

    total_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(total_q)).scalar() or 0

    rows = (await db.execute(base.offset((page - 1) * limit).limit(limit))).scalars().all()

    fixture_ids = [f.id for f in rows]
    bet_counts: dict[uuid.UUID, int] = {}
    if fixture_ids:
        bc_q = (
            select(Bet.fixture_id, func.count(Bet.id))
            .where(Bet.fixture_id.in_(fixture_ids))
            .group_by(Bet.fixture_id)
        )
        for fid, cnt in await db.execute(bc_q):
            bet_counts[fid] = cnt

    return {
        "data": [
            {
                "id": str(f.id),
                "external_id": f.external_id,
                "home_team": f.home_team,
                "away_team": f.away_team,
                "home_logo_url": f.home_logo_url,
                "away_logo_url": f.away_logo_url,
                "league_name": f.league_name,
                "match_date": f.match_date.isoformat(),
                "status": f.status,
                "home_score": f.home_score,
                "away_score": f.away_score,
                "round": f.round,
                "group_name": f.group_name,
                "venue": f.venue,
                "is_locked": f.is_locked,
                "betting_open": f.betting_open,
                "bet_count": bet_counts.get(f.id, 0),
            }
            for f in rows
        ],
        "pagination": {"total": total, "page": page, "limit": limit, "total_pages": max(1, -(-total // limit))},
    }


@router.patch("/fixtures/{fixture_id}/result")
@limiter.limit(ADMIN_RATE)
async def update_fixture_result(
    request: Request,
    fixture_id: uuid.UUID,
    body: FixtureResultIn,
    admin: CurrentAdmin,
    db: DBSession,
    redis: RedisClient,
):
    result = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = result.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")

    fixture.home_score = body.home_score
    fixture.away_score = body.away_score
    fixture.status = body.status
    fixture.is_locked = True
    fixture.betting_open = False
    await db.flush()
    await cancel_unpaid_extras_for_fixture(db, fixture, reason="admin_settle")

    settle_result = await settle_fixture_bets(db, fixture)
    from app.services.challenge_service import settle_challenges_for_fixture

    breakdown_q = (
        select(User.username, Bet.points_earned)
        .join(User, Bet.user_id == User.id)
        .where(
            Bet.fixture_id == fixture_id,
            Bet.points_earned.isnot(None),  # noqa: E711
            (Bet.amount <= 0) | (Bet.amount_confirmed == True),  # noqa: E712
        )
        .order_by(Bet.points_earned.desc())
    )
    breakdown_rows = (await db.execute(breakdown_q)).all()
    user_breakdown = [
        {"username": r.username, "points_earned": int(r.points_earned or 0)}
        for r in breakdown_rows
    ]

    await settle_challenges_for_fixture(db, redis, fixture)
    from app.services.badge_notify_service import notify_new_badges_for_fixture

    await notify_new_badges_for_fixture(db, redis, fixture_id)
    nt, nb, np = build_fixture_finished(
        fixture_id=str(fixture_id),
        home_team=fixture.home_team,
        away_team=fixture.away_team,
        home_score=body.home_score,
        away_score=body.away_score,
    )
    notified = await notify_all_active_users(
        db, redis, type="fixture_finished", title=nt, body=nb, payload=np,
    )
    await broadcast_fixture_updated(
        db,
        redis,
        fixture_id=fixture.id,
        status=fixture.status,
        home_score=fixture.home_score,
        away_score=fixture.away_score,
        home_team=fixture.home_team,
        away_team=fixture.away_team,
    )
    await log_action(db, user_id=admin.id, action="admin_settle", detail={
        "fixture_id": str(fixture_id), "home_score": body.home_score, "away_score": body.away_score,
        "status": body.status, "settled_count": settle_result.settled_count,
        "skipped_unconfirmed_extras": settle_result.skipped_unconfirmed_extras,
        "notified_users_count": len(notified),
        "user_breakdown": user_breakdown,
    }, ip=request.client.host if request.client else None)
    await db.commit()

    logger.info(
        "admin_fixture_settled",
        fixture_id=str(fixture_id),
        admin=str(admin.id),
        settled=settle_result.settled_count,
        skipped=settle_result.skipped_unconfirmed_extras,
    )
    return SettleResponse(
        settled_count=settle_result.settled_count,
        skipped_unconfirmed_extras=settle_result.skipped_unconfirmed_extras,
        fixture_id=str(fixture.id),
        home_score=fixture.home_score,
        away_score=fixture.away_score,
        status=fixture.status,
    )


@router.patch("/fixtures/{fixture_id}/status")
@limiter.limit(ADMIN_RATE)
async def update_fixture_status(
    request: Request,
    fixture_id: uuid.UUID,
    body: FixtureStatusIn,
    admin: CurrentAdmin,
    db: DBSession,
    redis: RedisClient,
):
    result = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = result.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
    fixture.status = body.status
    if body.status in ("live", "finished", "cancelled"):
        fixture.is_locked = True
        fixture.betting_open = False
        await cancel_unpaid_extras_for_fixture(db, fixture, reason="admin_status")
    await db.commit()
    await broadcast_fixture_updated(
        db,
        redis,
        fixture_id=fixture.id,
        status=fixture.status,
        home_score=fixture.home_score,
        away_score=fixture.away_score,
        home_team=fixture.home_team,
        away_team=fixture.away_team,
    )
    return {"ok": True, "status": fixture.status}


# ── Fixture editing ──────────────────────────────────────────────────

class FixtureEditIn(BaseModel):
    home_team: Optional[str] = None
    away_team: Optional[str] = None
    home_logo_url: Optional[str] = None
    away_logo_url: Optional[str] = None
    betting_open: Optional[bool] = None
    venue: Optional[str] = None
    match_date: Optional[str] = None  # ISO-8601 string


@router.get("/fixtures/known-teams")
@limiter.limit(ADMIN_RATE)
async def known_teams(request: Request, admin: CurrentAdmin):
    """Return all 48 World Cup teams with their flag URLs for the frontend autocomplete."""
    from app.services.worldcup_loader import _FLAG_ISO2
    teams = [
        {"name": name, "flag_url": f"https://flagcdn.com/w40/{iso2}.png"}
        for name, iso2 in sorted(_FLAG_ISO2.items())
    ]
    return teams


@router.patch("/fixtures/{fixture_id}/edit")
@limiter.limit(ADMIN_RATE)
async def edit_fixture(
    request: Request,
    fixture_id: uuid.UUID,
    body: FixtureEditIn,
    admin: CurrentAdmin,
    db: DBSession,
    redis: RedisClient,
):
    """Edit fixture metadata: teams, flags, betting gate, venue, date."""
    from app.services.worldcup_loader import _FLAG_ISO2

    result = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = result.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")

    if body.home_team is not None:
        fixture.home_team = body.home_team
        # Auto-set flag URL if not explicitly provided and team is known
        if body.home_logo_url is None and body.home_team in _FLAG_ISO2:
            fixture.home_logo_url = f"https://flagcdn.com/w40/{_FLAG_ISO2[body.home_team]}.png"

    if body.away_team is not None:
        fixture.away_team = body.away_team
        if body.away_logo_url is None and body.away_team in _FLAG_ISO2:
            fixture.away_logo_url = f"https://flagcdn.com/w40/{_FLAG_ISO2[body.away_team]}.png"

    if body.home_logo_url is not None:
        fixture.home_logo_url = body.home_logo_url

    if body.away_logo_url is not None:
        fixture.away_logo_url = body.away_logo_url

    if body.betting_open is not None:
        if body.betting_open is False and fixture.betting_open:
            from app.services.betting_close_service import close_fixture_betting

            await close_fixture_betting(db, fixture, reason="admin_close", redis=redis)
        else:
            fixture.betting_open = body.betting_open

    if body.venue is not None:
        fixture.venue = body.venue

    if body.match_date is not None:
        from datetime import datetime, timezone

        s = body.match_date.strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        parsed = datetime.fromisoformat(s)
        if parsed.tzinfo is None:
            fixture.match_date = parsed.replace(tzinfo=timezone.utc)
        else:
            fixture.match_date = parsed.astimezone(timezone.utc)

    await log_action(db, user_id=admin.id, action="admin_edit_fixture", detail={
        "fixture_id": str(fixture_id), "changes": body.model_dump(exclude_none=True),
    }, ip=request.client.host if request.client else None)
    await db.commit()
    await db.refresh(fixture)
    logger.info("admin_fixture_edited", fixture_id=str(fixture_id), admin=str(admin.id))
    from app.schemas.fixture import fixture_to_out

    return fixture_to_out(fixture)


# ── Stats / Dashboard ───────────────────────────────────────────────

@router.get("/stats", response_model=AdminStatsOut)
@limiter.limit(ADMIN_RATE)
async def admin_stats(request: Request, admin: CurrentAdmin, db: DBSession):
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    total_bets = (await db.execute(select(func.count()).select_from(Bet))).scalar() or 0
    pending_bets = (
        await db.execute(select(func.count()).select_from(Bet).where(Bet.points_earned == None))  # noqa
    ).scalar() or 0
    finished_fixtures = (
        await db.execute(select(func.count()).select_from(Fixture).where(Fixture.status == "finished"))
    ).scalar() or 0
    pools = (await db.execute(select(func.coalesce(func.sum(Group.prize_pool), 0)))).scalar()

    return AdminStatsOut(
        total_users=total_users,
        total_bets=total_bets,
        pending_bets=pending_bets,
        finished_fixtures=finished_fixtures,
        total_prize_pools=str(pools),
    )


CRITICAL_AUDIT_ACTIONS = (
    "entry_proof_uploaded",
    "admin_confirm_entry",
    "admin_confirm_extra",
    "extra_bet_cancelled_unpaid",
    "admin_approve_change_request",
    "admin_reject_change_request",
    "change_request_auto_expired",
    "admin_edit_fixture",
    "admin_settle",
    "fixture_betting_closed_snapshot",
    "password_reset_request",
    "admin_password_reset",
)


@router.get("/action-queue")
@limiter.limit(ADMIN_RATE)
async def admin_action_queue(request: Request, admin: CurrentAdmin, db: DBSession):
    """Aggregated pending work and fixtures needing admin attention."""
    from app.core.match_timing import betting_close_at, fixture_deadline_fields
    from app.models.audit_log import AuditLog

    now = datetime.now(timezone.utc)
    attention_before = now + timedelta(hours=2)

    pending_change = (
        await db.execute(
            select(func.count()).select_from(BetChangeRequest).where(BetChangeRequest.status == "pending")
        )
    ).scalar() or 0
    pending_password = (
        await db.execute(
            select(func.count())
            .select_from(PasswordResetRequest)
            .where(PasswordResetRequest.status == "pending")
        )
    ).scalar() or 0

    group_res = await db.execute(
        select(Group).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)  # noqa: E712
    )
    group = group_res.scalar_one_or_none()
    pending_entries = 0
    pending_extras = 0
    group_id = None
    if group:
        group_id = str(group.id)
        member_ids_q = select(GroupMember.user_id).where(GroupMember.group_id == group.id)
        pending_entries = (
            await db.execute(
                select(func.count()).select_from(User).where(
                    User.is_active == True,  # noqa: E712
                    User.id.not_in(member_ids_q),
                )
            )
        ).scalar() or 0
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
                )
            )
        ).scalar() or 0

    fx_rows = (
        await db.execute(
            select(Fixture)
            .where(
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
        elif f.status == "scheduled" and f.betting_open:
            urgency = "medium"
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
        .where(AuditLog.action.in_(CRITICAL_AUDIT_ACTIONS))
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

    total_pending = int(pending_change) + int(pending_password) + int(pending_entries) + int(pending_extras)

    return {
        "pending": {
            "change_requests": int(pending_change),
            "password_resets": int(pending_password),
            "entries": int(pending_entries),
            "extras": int(pending_extras),
            "total": total_pending,
        },
        "group_id": group_id,
        "fixtures_attention": fixtures_attention,
        "recent_critical": recent_critical,
    }


@router.get("/top-winners")
@limiter.limit(ADMIN_RATE)
async def top_winners(
    request: Request,
    admin: CurrentAdmin,
    db: DBSession,
    limit: int = Query(10, ge=1, le=50),
):
    q = (
        select(
            User.id,
            User.username,
            func.coalesce(func.sum(Bet.points_earned), 0).label("total_points"),
            func.count(Bet.id).label("total_bets"),
            func.count(Bet.id).filter(Bet.points_earned > 0).label("correct"),
            func.count(Bet.id).filter(and_(Bet.points_earned != None, Bet.points_earned == 0)).label("wrong"),  # noqa
        )
        .join(Bet, Bet.user_id == User.id)
        .group_by(User.id, User.username)
        .order_by(func.coalesce(func.sum(Bet.points_earned), 0).desc())
        .limit(limit)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "user_id": str(r.id),
            "username": r.username,
            "total_points": int(r.total_points),
            "total_bets": int(r.total_bets),
            "correct": int(r.correct),
            "wrong": int(r.wrong),
        }
        for r in rows
    ]


# ── Users ────────────────────────────────────────────────────────────

@router.get("/users")
@limiter.limit(ADMIN_RATE)
async def list_users(
    request: Request,
    admin: CurrentAdmin,
    db: DBSession,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    base = select(User).order_by(User.created_at.desc())
    total = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    rows = (await db.execute(base.offset((page - 1) * limit).limit(limit))).scalars().all()

    user_ids = [u.id for u in rows]
    bet_stats: dict[uuid.UUID, dict] = {}
    if user_ids:
        bs_q = (
            select(
                Bet.user_id,
                func.count(Bet.id).label("total_bets"),
                func.coalesce(func.sum(Bet.points_earned), 0).label("total_points"),
            )
            .where(Bet.user_id.in_(user_ids))
            .group_by(Bet.user_id)
        )
        for row in await db.execute(bs_q):
            bet_stats[row.user_id] = {"total_bets": int(row.total_bets), "total_points": int(row.total_points)}

    return {
        "data": [
            {
                "id": str(u.id),
                "username": u.username,
                "is_active": u.is_active,
                "is_admin": u.is_admin,
                "total_bets": bet_stats.get(u.id, {}).get("total_bets", 0),
                "total_points": bet_stats.get(u.id, {}).get("total_points", 0),
                "created_at": u.created_at.isoformat(),
            }
            for u in rows
        ],
        "pagination": {"total": total, "page": page, "limit": limit, "total_pages": max(1, -(-total // limit))},
    }


@router.patch("/users/{user_id}")
@limiter.limit(ADMIN_RATE)
async def patch_user(
    request: Request,
    user_id: uuid.UUID,
    body: AdminUserPatch,
    admin: CurrentAdmin,
    db: DBSession,
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.is_admin is not None:
        if body.is_admin is False and user.is_admin:
            admin_count = (
                await db.execute(
                    select(func.count()).select_from(User).where(User.is_admin == True)  # noqa: E712
                )
            ).scalar() or 0
            if admin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": {
                            "code": "LAST_ADMIN",
                            "message": "No se puede quitar el rol admin al único administrador.",
                        }
                    },
                )
            if user.id == admin.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": {
                            "code": "SELF_DEMOTION",
                            "message": "No puedes quitarte el rol admin a ti mismo.",
                        }
                    },
                )
        user.is_admin = body.is_admin
    await db.commit()
    await db.refresh(user)
    return {
        "id": str(user.id),
        "username": user.username,
        "is_active": user.is_active,
        "is_admin": user.is_admin,
    }


# ── Groups ───────────────────────────────────────────────────────────

class CreatePollaIn(BaseModel):
    name: str
    entry_fee: Decimal = Decimal("0")
    currency: str = "PEN"
    per_match_amount: Decimal | None = None
    challenge_max_stake: int = 10
    challenge_daily_limit: int = 0
    challenge_tournament_limit: int = 0
    challenges_enabled: bool = True
    payment_contact_name: str | None = None
    payment_phone: str | None = None

    @field_validator("payment_contact_name", "payment_phone", mode="before")
    @classmethod
    def strip_payment_text(cls, v):
        if v is None or v == "":
            return None
        return str(v).strip() or None


@router.post("/groups", status_code=201)
@limiter.limit(ADMIN_RATE)
async def create_polla(
    request: Request,
    body: CreatePollaIn,
    admin: CurrentAdmin,
    db: DBSession,
):
    """Create the global polla. Admin becomes the owner."""
    from app.models.group import Group
    if body.entry_fee > 0:
        if not body.payment_contact_name or not body.payment_phone:
            raise HTTPException(
                status_code=400,
                detail="payment_contact_name and payment_phone are required when entry_fee > 0",
            )
    group = Group(
        name=body.name,
        owner_id=admin.id,
        entry_fee=body.entry_fee,
        currency=body.currency,
        bet_amount_mode="single_entry",
        fixed_bet_amount=body.per_match_amount if body.per_match_amount and body.per_match_amount > 0 else None,
        is_active=True,
        prize_pool=Decimal("0"),
        challenge_max_stake=max(1, min(20, body.challenge_max_stake)),
        challenge_daily_limit=max(0, min(99, body.challenge_daily_limit)),
        challenge_tournament_limit=max(0, min(99, body.challenge_tournament_limit)),
        challenges_enabled=body.challenges_enabled,
        payment_contact_name=body.payment_contact_name,
        payment_phone=body.payment_phone,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)
    logger.info("polla_created", group_id=str(group.id), admin=str(admin.id))
    return {
        "id": str(group.id),
        "name": group.name,
        "entry_fee": str(group.entry_fee),
        "currency": group.currency,
        "fixed_bet_amount": str(group.fixed_bet_amount) if group.fixed_bet_amount else None,
        "is_active": group.is_active,
        "challenge_max_stake": group.challenge_max_stake,
        "challenge_daily_limit": group.challenge_daily_limit,
        "challenge_tournament_limit": group.challenge_tournament_limit,
        "challenges_enabled": group.challenges_enabled,
        **_group_payment_dict(group),
    }


@router.post("/groups/{group_id}/payment-qr", status_code=200)
@limiter.limit(ADMIN_RATE)
async def upload_group_payment_qr(
    request: Request,
    group_id: uuid.UUID,
    admin: CurrentAdmin,
    db: DBSession,
    file: UploadFile = File(...),
):
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    group.payment_qr_path = await save_group_payment_qr(group_id, file)
    await log_action(
        db,
        user_id=admin.id,
        action="admin_upload_payment_qr",
        detail={"group_id": str(group_id)},
        ip=request.client.host if request.client else None,
    )
    await db.commit()
    await db.refresh(group)
    return {"ok": True, "payment_qr_url": payment_qr_public_url(group_id)}


@router.get("/groups")
@limiter.limit(ADMIN_RATE)
async def list_groups(
    request: Request,
    admin: CurrentAdmin,
    db: DBSession,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    base = select(Group).order_by(Group.created_at.desc())
    total = (await db.execute(select(func.count()).select_from(Group))).scalar() or 0
    rows = (await db.execute(base.offset((page - 1) * limit).limit(limit))).scalars().all()

    group_ids = [g.id for g in rows]
    member_counts: dict[uuid.UUID, int] = {}
    if group_ids:
        mc_q = (
            select(GroupMember.group_id, func.count(GroupMember.user_id))
            .where(GroupMember.group_id.in_(group_ids))
            .group_by(GroupMember.group_id)
        )
        for gid, cnt in await db.execute(mc_q):
            member_counts[gid] = cnt

    return {
        "data": [
            {
                "id": str(g.id),
                "name": g.name,
                "owner_id": str(g.owner_id),
                "entry_fee": str(g.entry_fee),
                "prize_pool": str(g.prize_pool),
                "bet_amount_mode": g.bet_amount_mode,
                "fixed_bet_amount": str(g.fixed_bet_amount) if g.fixed_bet_amount is not None else None,
                "is_active": g.is_active,
                "challenge_max_stake": g.challenge_max_stake,
                "challenge_daily_limit": g.challenge_daily_limit,
                "challenge_tournament_limit": g.challenge_tournament_limit,
                "challenges_enabled": g.challenges_enabled,
                "member_count": member_counts.get(g.id, 0),
                "created_at": g.created_at.isoformat(),
                **_group_payment_dict(g),
            }
            for g in rows
        ],
        "pagination": {"total": total, "page": page, "limit": limit, "total_pages": max(1, -(-total // limit))},
    }


@router.patch("/groups/{group_id}")
@limiter.limit(ADMIN_RATE)
async def patch_group(
    request: Request,
    group_id: uuid.UUID,
    body: AdminGroupPatch,
    admin: CurrentAdmin,
    db: DBSession,
):
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    changes: dict[str, str] = {}
    if body.entry_fee is not None:
        changes["entry_fee"] = str(body.entry_fee)
        group.entry_fee = body.entry_fee
    if body.currency is not None:
        changes["currency"] = body.currency
        group.currency = body.currency
    if body.bet_amount_mode is not None:
        changes["bet_amount_mode"] = body.bet_amount_mode
        group.bet_amount_mode = body.bet_amount_mode
    if body.fixed_bet_amount is not None:
        changes["fixed_bet_amount"] = str(body.fixed_bet_amount)
        group.fixed_bet_amount = body.fixed_bet_amount if body.fixed_bet_amount > 0 else None
    if body.is_active is not None:
        changes["is_active"] = str(body.is_active)
        group.is_active = body.is_active
    if body.challenge_max_stake is not None:
        val = max(1, min(20, body.challenge_max_stake))
        changes["challenge_max_stake"] = str(val)
        group.challenge_max_stake = val
    if body.challenge_daily_limit is not None:
        val = max(0, min(99, body.challenge_daily_limit))
        changes["challenge_daily_limit"] = str(val)
        group.challenge_daily_limit = val
    if body.challenge_tournament_limit is not None:
        val = max(0, min(99, body.challenge_tournament_limit))
        changes["challenge_tournament_limit"] = str(val)
        group.challenge_tournament_limit = val
    if body.challenges_enabled is not None:
        changes["challenges_enabled"] = str(body.challenges_enabled)
        group.challenges_enabled = body.challenges_enabled
    if body.payment_contact_name is not None:
        changes["payment_contact_name"] = body.payment_contact_name
        group.payment_contact_name = body.payment_contact_name or None
    if body.payment_phone is not None:
        changes["payment_phone"] = body.payment_phone
        group.payment_phone = body.payment_phone or None
    if changes:
        await log_action(
            db,
            user_id=admin.id,
            action="admin_patch_group",
            detail={"group_id": str(group_id), "changes": changes},
            ip=request.client.host if request.client else None,
        )
    await db.commit()
    await db.refresh(group)
    return {
        "id": str(group.id),
        "name": group.name,
        "entry_fee": str(group.entry_fee),
        "challenge_max_stake": group.challenge_max_stake,
        "challenge_daily_limit": group.challenge_daily_limit,
        "challenge_tournament_limit": group.challenge_tournament_limit,
        "challenges_enabled": group.challenges_enabled,
        "bet_amount_mode": group.bet_amount_mode,
        "fixed_bet_amount": str(group.fixed_bet_amount) if group.fixed_bet_amount else None,
        "is_active": group.is_active,
        **_group_payment_dict(group),
    }


class AddMemberIn(BaseModel):
    user_id: uuid.UUID


@router.get("/groups/{group_id}/members")
@limiter.limit(ADMIN_RATE)
async def list_group_members(
    request: Request,
    group_id: uuid.UUID,
    admin: CurrentAdmin,
    db: DBSession,
):
    q = (
        select(
            User.id,
            User.username,
            User.first_name,
            User.last_name,
            GroupMember.joined_at,
            GroupMember.total_points,
            GroupMember.total_amount_bet,
        )
        .join(GroupMember, GroupMember.user_id == User.id)
        .where(GroupMember.group_id == group_id)
        .order_by(GroupMember.joined_at.asc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "user_id": str(r.id),
            "username": r.username,
            "first_name": r.first_name,
            "last_name": r.last_name,
            "joined_at": r.joined_at.isoformat(),
            "total_points": r.total_points,
            "total_amount_bet": str(r.total_amount_bet),
        }
        for r in rows
    ]


@router.post("/groups/{group_id}/members", status_code=201)
@limiter.limit(ADMIN_RATE)
async def add_group_member(
    request: Request,
    group_id: uuid.UUID,
    body: AddMemberIn,
    admin: CurrentAdmin,
    db: DBSession,
    redis: RedisClient,
):
    group_res = await db.execute(select(Group).where(Group.id == group_id))
    group = group_res.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    user_res = await db.execute(select(User).where(User.id == body.user_id))
    user = user_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = await db.execute(
        select(GroupMember).where(
            and_(GroupMember.group_id == group_id, GroupMember.user_id == body.user_id)
        )
    )
    if existing.scalar_one_or_none():
        await resolve_actionable_notifications(
            db,
            redis,
            notification_type="entry_pending",
            payload_match={"group_id": str(group_id), "user_id": str(body.user_id)},
        )
        await db.commit()
        return {"ok": True, "username": user.username, "already_member": True}

    proof_res = await db.execute(
        select(GroupEntryProof).where(
            and_(GroupEntryProof.group_id == group_id, GroupEntryProof.user_id == body.user_id)
        )
    )
    proof_row = proof_res.scalar_one_or_none()
    had_proof = proof_row is not None

    prev_pool = group.prize_pool
    member = GroupMember(group_id=group_id, user_id=body.user_id, total_amount_bet=group.entry_fee)
    db.add(member)
    group.prize_pool += group.entry_fee
    await log_action(db, user_id=admin.id, action="admin_confirm_entry", detail={
        "group_id": str(group_id),
        "member_user_id": str(body.user_id),
        "username": user.username,
        "entry_fee": str(group.entry_fee),
        "had_proof": had_proof,
        "confirmed_with_proof": had_proof,
        "proof_uploaded_at": proof_row.uploaded_at.isoformat() if proof_row else None,
    }, ip=request.client.host if request.client else None)
    count_res = await db.execute(select(func.count()).where(GroupMember.group_id == group_id))
    member_count = int(count_res.scalar() or 0) + 1
    await resolve_actionable_notifications(
        db,
        redis,
        notification_type="entry_pending",
        payload_match={"group_id": str(group_id), "user_id": str(body.user_id)},
    )
    entry_title, entry_body, entry_payload = build_entry_confirmed(group_name=group.name)
    await create_notification(
        db,
        redis,
        user_id=body.user_id,
        type="entry_confirmed",
        title=entry_title,
        body=entry_body,
        payload=entry_payload,
    )
    await db.commit()
    await broadcast_polla_updated(
        db,
        redis,
        group_id=group.id,
        prize_pool=group.prize_pool,
        previous_prize_pool=prev_pool,
        member_count=member_count,
        reason="entry_confirmed",
    )
    logger.info("admin_member_added", group_id=str(group_id), user_id=str(body.user_id), admin=str(admin.id))
    return {"ok": True, "username": user.username, "prize_pool": str(group.prize_pool)}


@router.delete("/groups/{group_id}/members/{user_id}", status_code=200)
@limiter.limit(ADMIN_RATE)
async def remove_group_member(
    request: Request,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    admin: CurrentAdmin,
    db: DBSession,
    redis: RedisClient,
):
    group_res = await db.execute(select(Group).where(Group.id == group_id))
    group = group_res.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    member_res = await db.execute(
        select(GroupMember).where(
            and_(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
        )
    )
    member = member_res.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    prev_pool = group.prize_pool
    user_res = await db.execute(select(User).where(User.id == user_id))
    removed_user = user_res.scalar_one_or_none()
    await db.delete(member)
    group.prize_pool = max(Decimal("0"), group.prize_pool - group.entry_fee)
    count_res = await db.execute(select(func.count()).where(GroupMember.group_id == group_id))
    member_count = max(0, int(count_res.scalar() or 0) - 1)
    await log_action(
        db,
        user_id=admin.id,
        action="admin_member_removed",
        detail={
            "group_id": str(group_id),
            "member_user_id": str(user_id),
            "username": removed_user.username if removed_user else None,
        },
        ip=request.client.host if request.client else None,
    )
    await db.commit()
    await broadcast_polla_updated(
        db,
        redis,
        group_id=group.id,
        prize_pool=group.prize_pool,
        previous_prize_pool=prev_pool,
        member_count=member_count,
        reason="member_removed",
    )
    logger.info("admin_member_removed", group_id=str(group_id), user_id=str(user_id), admin=str(admin.id))
    return {"ok": True, "prize_pool": str(group.prize_pool)}


@router.get("/groups/{group_id}/non-members")
@limiter.limit(ADMIN_RATE)
async def list_non_members(
    request: Request,
    group_id: uuid.UUID,
    admin: CurrentAdmin,
    db: DBSession,
):
    """Users registered but NOT yet members of this group (pending entry confirmation)."""
    member_ids_q = select(GroupMember.user_id).where(GroupMember.group_id == group_id)
    q = (
        select(User.id, User.username, User.first_name, User.last_name, User.created_at)
        .where(User.is_active == True, User.id.not_in(member_ids_q))
        .order_by(User.created_at.desc())
    )
    rows = (await db.execute(q)).all()
    user_ids = [r.id for r in rows]
    proof_map: dict[uuid.UUID, GroupEntryProof] = {}
    if user_ids:
        proofs = (
            await db.execute(
                select(GroupEntryProof).where(
                    and_(
                        GroupEntryProof.group_id == group_id,
                        GroupEntryProof.user_id.in_(user_ids),
                    )
                )
            )
        ).scalars().all()
        proof_map = {p.user_id: p for p in proofs}
    return [
        {
            "user_id": str(r.id),
            "username": r.username,
            "first_name": r.first_name,
            "last_name": r.last_name,
            "registered_at": r.created_at.isoformat(),
            "has_proof": r.id in proof_map,
            "proof_uploaded_at": proof_map[r.id].uploaded_at.isoformat() if r.id in proof_map else None,
            "entry_proof_data_url": (
                entry_proof_data_url(proof_map[r.id].file_path) if r.id in proof_map else None
            ),
        }
        for r in rows
    ]


@router.get("/groups/{group_id}/entry-proofs/{user_id}")
@limiter.limit(ADMIN_RATE)
async def get_entry_proof(
    request: Request,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    admin: CurrentAdmin,
    db: DBSession,
):
    result = await db.execute(
        select(GroupEntryProof).where(
            and_(GroupEntryProof.group_id == group_id, GroupEntryProof.user_id == user_id)
        )
    )
    proof = result.scalar_one_or_none()
    if not proof:
        raise HTTPException(status_code=404, detail="Entry proof not found")
    path = resolve_readable_path(proof.file_path)
    response = FileResponse(path, media_type="image/jpeg")
    return apply_cors_headers(request, response)


@router.get("/groups/{group_id}/pending-extras")
@limiter.limit(ADMIN_RATE)
async def list_pending_extras(
    request: Request,
    group_id: uuid.UUID,
    admin: CurrentAdmin,
    db: DBSession,
):
    """Bets with extra amounts not yet confirmed by admin."""
    q = (
        select(
            Bet.id, Bet.user_id, Bet.fixture_id, Bet.amount, Bet.created_at,
            Bet.predicted_home_score, Bet.predicted_away_score,
            User.username,
            User.first_name,
            User.last_name,
        )
        .join(User, Bet.user_id == User.id)
        .join(Fixture, Bet.fixture_id == Fixture.id)
        .where(
            and_(
                Bet.group_id == group_id,
                Bet.amount > 0,
                Bet.amount_confirmed == False,  # noqa
                Bet.cancelled_at.is_(None),
                Fixture.status == "scheduled",
                Fixture.betting_open == True,  # noqa: E712
            )
        )
        .order_by(Bet.created_at.desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "bet_id": str(r.id),
            "user_id": str(r.user_id),
            "username": r.username,
            "first_name": r.first_name,
            "last_name": r.last_name,
            "fixture_id": str(r.fixture_id),
            "amount": str(r.amount),
            "predicted_home_score": r.predicted_home_score,
            "predicted_away_score": r.predicted_away_score,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.post("/groups/{group_id}/confirm-extra/{bet_id}")
@limiter.limit(ADMIN_RATE)
async def confirm_extra_bet(
    request: Request,
    group_id: uuid.UUID,
    bet_id: uuid.UUID,
    admin: CurrentAdmin,
    db: DBSession,
    redis: RedisClient,
):
    """Confirm that user paid the extra for this bet → adds amount to prize_pool."""
    group_res = await db.execute(select(Group).where(Group.id == group_id))
    group = group_res.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    bet_res = await db.execute(
        select(Bet).where(and_(Bet.id == bet_id, Bet.group_id == group_id))
    )
    bet = bet_res.scalar_one_or_none()
    if not bet:
        raise HTTPException(status_code=404, detail="Bet not found in this group")
    if bet.cancelled_at:
        raise HTTPException(
            status_code=409,
            detail="Extra cancelado: el usuario no pagó antes del inicio del partido",
        )
    fx_res = await db.execute(select(Fixture).where(Fixture.id == bet.fixture_id))
    fixture = fx_res.scalar_one_or_none()
    if not fixture or not is_fixture_bettable(fixture):
        raise HTTPException(
            status_code=409,
            detail="Extra cancelado: el usuario no pagó antes del inicio del partido",
        )
    if bet.amount_confirmed:
        await resolve_actionable_notifications(
            db,
            redis,
            notification_type="extra_bet_pending",
            payload_match={"group_id": str(group_id), "bet_id": str(bet_id)},
        )
        await db.commit()
        return {"ok": True, "amount": str(bet.amount), "prize_pool": str(group.prize_pool), "already_confirmed": True}

    prev_pool = group.prize_pool
    bet.amount_confirmed = True
    group.prize_pool += bet.amount

    # Also update member total_amount_bet
    member_res = await db.execute(
        select(GroupMember).where(
            and_(GroupMember.group_id == group_id, GroupMember.user_id == bet.user_id)
        )
    )
    member = member_res.scalar_one_or_none()
    if member:
        member.total_amount_bet += bet.amount

    points_settled = False
    if fixture.status == "finished" and bet.points_earned is None:
        points_settled = await settle_single_bet(db, bet, fixture)

    await log_action(db, user_id=admin.id, action="admin_confirm_extra", detail={
        "bet_id": str(bet_id), "group_id": str(group_id), "bet_user_id": str(bet.user_id), "amount": str(bet.amount),
        "points_settled": points_settled,
    }, ip=request.client.host if request.client else None)
    count_res = await db.execute(select(func.count()).where(GroupMember.group_id == group_id))
    member_count = int(count_res.scalar() or 0)
    await resolve_actionable_notifications(
        db,
        redis,
        notification_type="extra_bet_pending",
        payload_match={"group_id": str(group_id), "bet_id": str(bet_id)},
    )
    if fixture:
        ext_title, ext_body, ext_payload = build_extra_confirmed(
            amount=str(bet.amount),
            home_team=fixture.home_team,
            away_team=fixture.away_team,
            bet_id=str(bet.id),
            fixture_id=str(bet.fixture_id),
        )
        await create_notification(
            db,
            redis,
            user_id=bet.user_id,
            type="extra_confirmed",
            title=ext_title,
            body=ext_body,
            payload=ext_payload,
        )
    await db.commit()
    await broadcast_polla_updated(
        db,
        redis,
        group_id=group.id,
        prize_pool=group.prize_pool,
        previous_prize_pool=prev_pool,
        member_count=member_count,
        reason="extra_confirmed",
    )
    logger.info(
        "extra_confirmed",
        bet_id=str(bet_id),
        amount=str(bet.amount),
        admin=str(admin.id),
        points_settled=points_settled,
    )
    return {
        "ok": True,
        "amount": str(bet.amount),
        "prize_pool": str(group.prize_pool),
        "points_settled": points_settled,
    }


# ── Audit Log ─────────────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    id: str
    user_id: str | None
    username: str | None
    action: str
    action_label: str
    detail: str | None
    detail_summary: str
    ip_address: str | None
    created_at: str

    class Config:
        from_attributes = True


@router.get("/audit-log")
@limiter.limit(ADMIN_RATE)
async def list_audit_logs(
    request: Request,
    admin: CurrentAdmin,
    db: DBSession,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    action: Optional[str] = Query(None),
    user_id: Optional[uuid.UUID] = Query(None),
    fixture_id: Optional[uuid.UUID] = Query(None),
):
    from app.models.audit_log import AuditLog

    base = (
        select(
            AuditLog.id,
            AuditLog.user_id,
            User.username.label("username"),
            AuditLog.action,
            AuditLog.detail,
            AuditLog.ip_address,
            AuditLog.created_at,
        )
        .select_from(AuditLog)
        .outerjoin(User, AuditLog.user_id == User.id)
    )

    if action:
        base = base.where(AuditLog.action == action)
    if user_id:
        base = base.where(AuditLog.user_id == user_id)
    if fixture_id:
        base = base.where(AuditLog.detail.contains(str(fixture_id)))

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    rows = (
        await db.execute(
            base.order_by(AuditLog.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()

    from app.services.audit_formatter import enrich_audit_rows

    enriched = await enrich_audit_rows(db, rows)

    return {
        "data": [
            AuditLogOut(
                id=str(r.id),
                user_id=str(r.user_id) if r.user_id else None,
                username=r.username,
                action=r.action,
                action_label=label,
                detail=r.detail,
                detail_summary=summary,
                ip_address=r.ip_address,
                created_at=r.created_at.isoformat(),
            )
            for r, (label, summary) in zip(rows, enriched)
        ],
        "pagination": {"total": total, "page": page, "limit": limit, "total_pages": max(1, -(-total // limit))},
    }


@router.get("/audit-log/export")
@limiter.limit(ADMIN_RATE)
async def export_audit_logs(
    request: Request,
    admin: CurrentAdmin,
    db: DBSession,
    action: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
):
    """CSV export for transparency / disputes."""
    import csv
    import io
    from fastapi.responses import StreamingResponse
    from app.models.audit_log import AuditLog
    from app.services.audit_formatter import enrich_audit_rows

    base = (
        select(
            AuditLog.id,
            AuditLog.user_id,
            User.username,
            AuditLog.action,
            AuditLog.detail,
            AuditLog.ip_address,
            AuditLog.created_at,
        )
        .select_from(AuditLog)
        .outerjoin(User, AuditLog.user_id == User.id)
    )
    if action:
        base = base.where(AuditLog.action == action)
    rows = (
        await db.execute(base.order_by(AuditLog.created_at.desc()).limit(limit))
    ).all()
    enriched = await enrich_audit_rows(db, rows)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["created_at", "action", "action_label", "username", "user_id", "summary", "detail", "ip"]
    )
    for r, (label, summary) in zip(rows, enriched):
        writer.writerow(
            [
                r.created_at.isoformat(),
                r.action,
                label,
                r.username or "",
                str(r.user_id) if r.user_id else "",
                summary,
                r.detail or "",
                r.ip_address or "",
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_log.csv"},
    )


# ── Bet Change Requests ──────────────────────────────────────────────

@router.get("/bet-change-requests")
@limiter.limit(ADMIN_RATE)
async def list_change_requests(
    request: Request,
    admin: CurrentAdmin,
    db: DBSession,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    base = (
        select(
            BetChangeRequest.id,
            BetChangeRequest.user_id,
            BetChangeRequest.bet_id,
            BetChangeRequest.request_type,
            BetChangeRequest.new_predicted_home_score,
            BetChangeRequest.new_predicted_away_score,
            BetChangeRequest.reason,
            BetChangeRequest.status,
            BetChangeRequest.admin_notes,
            BetChangeRequest.created_at,
            BetChangeRequest.resolved_at,
            User.username.label("username"),
            User.first_name.label("first_name"),
            User.last_name.label("last_name"),
            Bet.predicted_home_score.label("original_home"),
            Bet.predicted_away_score.label("original_away"),
            Bet.fixture_id,
            Bet.amount,
            Bet.group_id,
            Fixture.home_team,
            Fixture.away_team,
            Fixture.home_logo_url,
            Fixture.away_logo_url,
            Fixture.match_date.label("fixture_match_date"),
            Fixture.status.label("fixture_status"),
        )
        .join(User, BetChangeRequest.user_id == User.id)
        .join(Bet, BetChangeRequest.bet_id == Bet.id)
        .join(Fixture, Bet.fixture_id == Fixture.id)
    )

    if status_filter:
        base = base.where(BetChangeRequest.status == status_filter)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    rows = (
        await db.execute(
            base.order_by(BetChangeRequest.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()

    return {
        "data": [
            {
                "id": str(r.id),
                "user_id": str(r.user_id),
                "username": r.username,
                "first_name": r.first_name,
                "last_name": r.last_name,
                "bet_id": str(r.bet_id),
                "request_type": r.request_type,
                "new_predicted_home_score": r.new_predicted_home_score,
                "new_predicted_away_score": r.new_predicted_away_score,
                "original_home": r.original_home,
                "original_away": r.original_away,
                "fixture_id": str(r.fixture_id),
                "home_team": r.home_team,
                "away_team": r.away_team,
                "home_logo_url": r.home_logo_url,
                "away_logo_url": r.away_logo_url,
                "amount": str(r.amount),
                "group_id": str(r.group_id) if r.group_id else None,
                "reason": r.reason,
                "status": r.status,
                "admin_notes": r.admin_notes,
                "created_at": r.created_at.isoformat(),
                "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
                "match_date": r.fixture_match_date.isoformat(),
                "fixture_status": r.fixture_status,
                "admin_resolve_closes_at": (
                    (r.fixture_match_date - ADMIN_RESOLVE_BEFORE).isoformat()
                    if r.fixture_status == "scheduled"
                    else None
                ),
            }
            for r in rows
        ],
        "pagination": {"total": total, "page": page, "limit": limit, "total_pages": max(1, -(-total // limit))},
    }


@router.get("/bet-change-requests/pending-count")
@limiter.limit(ADMIN_RATE)
async def pending_change_request_count(
    request: Request,
    admin: CurrentAdmin,
    db: DBSession,
):
    total = (
        await db.execute(
            select(func.count()).select_from(BetChangeRequest).where(BetChangeRequest.status == "pending")
        )
    ).scalar() or 0
    return {"count": total}


class ApproveRejectIn(BaseModel):
    admin_notes: Optional[str] = None


@router.post("/bet-change-requests/{request_id}/approve")
@limiter.limit(ADMIN_RATE)
async def approve_change_request(
    request: Request,
    request_id: uuid.UUID,
    body: ApproveRejectIn,
    admin: CurrentAdmin,
    db: DBSession,
    redis: RedisClient,
):
    from datetime import datetime, timezone

    cr_res = await db.execute(select(BetChangeRequest).where(BetChangeRequest.id == request_id))
    cr = cr_res.scalar_one_or_none()
    if not cr:
        raise HTTPException(status_code=404, detail="Change request not found")
    if cr.status != "pending":
        raise HTTPException(status_code=409, detail="Request is already resolved")

    bet_res = await db.execute(select(Bet).where(Bet.id == cr.bet_id))
    bet = bet_res.scalar_one_or_none()
    if not bet:
        raise HTTPException(status_code=404, detail="Associated bet not found")

    fx_res = await db.execute(select(Fixture).where(Fixture.id == bet.fixture_id))
    fixture = fx_res.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
    if not can_resolve_change_request_for_fixture(fixture):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": {
                    "code": "CHANGE_REQUEST_WINDOW_CLOSED",
                    "message": "Fuera de plazo: no se puede resolver la solicitud (cierra 1 minuto antes del partido o partido no programado).",
                }
            },
        )

    if cr.request_type == "modify":
        from app.services.bet_service import assert_unique_prediction_for_fixture

        try:
            await assert_unique_prediction_for_fixture(
                db,
                bet.user_id,
                bet.fixture_id,
                cr.new_predicted_home_score,
                cr.new_predicted_away_score,
                exclude_bet_id=bet.id,
            )
        except ValueError as e:
            if str(e) == "DUPLICATE_PREDICTION_SCORE":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": {
                            "code": "DUPLICATE_PREDICTION_SCORE",
                            "message": (
                                "El nuevo marcador coincide con otra prediccion activa "
                                "del usuario en este partido."
                            ),
                        }
                    },
                )
            raise
        bet.predicted_home_score = cr.new_predicted_home_score
        bet.predicted_away_score = cr.new_predicted_away_score
    elif cr.request_type == "delete":
        if bet.group_id and bet.amount_confirmed and bet.amount > 0:
            group_res = await db.execute(select(Group).where(Group.id == bet.group_id))
            group = group_res.scalar_one_or_none()
            if group:
                group.prize_pool = max(Decimal("0"), group.prize_pool - bet.amount)
                member_res = await db.execute(
                    select(GroupMember).where(
                        and_(GroupMember.group_id == bet.group_id, GroupMember.user_id == bet.user_id)
                    )
                )
                member = member_res.scalar_one_or_none()
                if member:
                    member.total_amount_bet = max(Decimal("0"), member.total_amount_bet - bet.amount)
        await db.delete(bet)

    cr.status = "approved"
    cr.admin_notes = body.admin_notes
    cr.resolved_by = admin.id
    cr.resolved_at = datetime.now(timezone.utc)

    title, notif_body, payload = build_change_request_resolved(
        status="approved",
        request_type=cr.request_type,
        admin_notes=body.admin_notes,
        request_id=str(request_id),
        bet_id=str(cr.bet_id),
    )
    await create_notification(
        db, redis,
        user_id=cr.user_id,
        type="change_request_resolved",
        title=title,
        body=notif_body,
        payload=payload,
    )

    await resolve_actionable_notifications(
        db,
        redis,
        notification_type="change_request_pending",
        payload_match={"request_id": str(request_id)},
    )
    await log_action(db, user_id=admin.id, action="admin_approve_change_request", detail={
        "request_id": str(request_id), "bet_id": str(cr.bet_id), "type": cr.request_type,
        "user_id": str(cr.user_id),
    }, ip=request.client.host if request.client else None)
    await db.commit()
    logger.info("change_request_approved", request_id=str(request_id), admin=str(admin.id))
    return {"ok": True, "status": "approved"}


@router.post("/bet-change-requests/{request_id}/reject")
@limiter.limit(ADMIN_RATE)
async def reject_change_request(
    request: Request,
    request_id: uuid.UUID,
    body: ApproveRejectIn,
    admin: CurrentAdmin,
    db: DBSession,
    redis: RedisClient,
):
    from datetime import datetime, timezone

    cr_res = await db.execute(select(BetChangeRequest).where(BetChangeRequest.id == request_id))
    cr = cr_res.scalar_one_or_none()
    if not cr:
        raise HTTPException(status_code=404, detail="Change request not found")
    if cr.status != "pending":
        raise HTTPException(status_code=409, detail="Request is already resolved")

    bet_res = await db.execute(select(Bet).where(Bet.id == cr.bet_id))
    bet = bet_res.scalar_one_or_none()
    if not bet:
        raise HTTPException(status_code=404, detail="Associated bet not found")

    fx_res = await db.execute(select(Fixture).where(Fixture.id == bet.fixture_id))
    fixture = fx_res.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
    if not can_resolve_change_request_for_fixture(fixture):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": {
                    "code": "CHANGE_REQUEST_WINDOW_CLOSED",
                    "message": "Fuera de plazo: no se puede resolver la solicitud (cierra 1 minuto antes del partido o partido no programado).",
                }
            },
        )

    cr.status = "rejected"
    cr.admin_notes = body.admin_notes
    cr.resolved_by = admin.id
    cr.resolved_at = datetime.now(timezone.utc)

    title, notif_body, payload = build_change_request_resolved(
        status="rejected",
        request_type=cr.request_type,
        admin_notes=body.admin_notes,
        request_id=str(request_id),
        bet_id=str(cr.bet_id),
    )
    await create_notification(
        db, redis,
        user_id=cr.user_id,
        type="change_request_resolved",
        title=title,
        body=notif_body,
        payload=payload,
    )

    await resolve_actionable_notifications(
        db,
        redis,
        notification_type="change_request_pending",
        payload_match={"request_id": str(request_id)},
    )
    await log_action(db, user_id=admin.id, action="admin_reject_change_request", detail={
        "request_id": str(request_id), "bet_id": str(cr.bet_id), "type": cr.request_type,
        "user_id": str(cr.user_id), "notes": body.admin_notes,
    }, ip=request.client.host if request.client else None)
    await db.commit()
    logger.info("change_request_rejected", request_id=str(request_id), admin=str(admin.id))
    return {"ok": True, "status": "rejected"}


# ── Password reset requests ───────────────────────────────────────────

@router.get("/password-reset-requests")
@limiter.limit(ADMIN_RATE)
async def list_password_reset_requests(
    request: Request,
    admin: CurrentAdmin,
    db: DBSession,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    base = (
        select(
            PasswordResetRequest.id,
            PasswordResetRequest.user_id,
            PasswordResetRequest.message,
            PasswordResetRequest.status,
            PasswordResetRequest.admin_notes,
            PasswordResetRequest.created_at,
            PasswordResetRequest.resolved_at,
            User.username.label("username"),
            User.first_name.label("first_name"),
            User.last_name.label("last_name"),
        )
        .join(User, PasswordResetRequest.user_id == User.id)
    )
    if status_filter:
        base = base.where(PasswordResetRequest.status == status_filter)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    rows = (
        await db.execute(
            base.order_by(PasswordResetRequest.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()

    return {
        "data": [
            {
                "id": str(r.id),
                "user_id": str(r.user_id),
                "username": r.username,
                "first_name": r.first_name,
                "last_name": r.last_name,
                "message": r.message,
                "status": r.status,
                "admin_notes": r.admin_notes,
                "created_at": r.created_at.isoformat(),
                "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
            }
            for r in rows
        ],
        "pagination": {"total": total, "page": page, "limit": limit, "total_pages": max(1, -(-total // limit))},
    }


@router.get("/password-reset-requests/pending-count")
@limiter.limit(ADMIN_RATE)
async def pending_password_reset_count(
    request: Request,
    admin: CurrentAdmin,
    db: DBSession,
):
    total = (
        await db.execute(
            select(func.count()).select_from(PasswordResetRequest).where(
                PasswordResetRequest.status == "pending"
            )
        )
    ).scalar() or 0
    return {"count": total}


@router.post("/password-reset-requests/{request_id}/resolve")
@limiter.limit(ADMIN_RATE)
async def resolve_password_reset_request(
    request: Request,
    request_id: uuid.UUID,
    body: ApproveRejectIn,
    admin: CurrentAdmin,
    db: DBSession,
    redis: RedisClient,
):
    from datetime import datetime, timezone
    pr_res = await db.execute(
        select(PasswordResetRequest).where(PasswordResetRequest.id == request_id)
    )
    pr = pr_res.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Password reset request not found")
    if pr.status != "pending":
        raise HTTPException(status_code=409, detail="Request is already resolved")

    user_res = await db.execute(select(User).where(User.id == pr.user_id))
    user = user_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    temporary_password = generate_temporary_password()
    user.hashed_password = hash_password(temporary_password)
    user.must_change_password = True
    user.failed_login_attempts = 0
    user.locked_until = None

    rt_res = await db.execute(
        select(RefreshToken).where(
            and_(RefreshToken.user_id == user.id, RefreshToken.revoked == False)  # noqa: E712
        )
    )
    for rt in rt_res.scalars().all():
        rt.revoked = True

    pr.status = "resolved"
    pr.admin_notes = body.admin_notes
    pr.resolved_by = admin.id
    pr.resolved_at = datetime.now(timezone.utc)

    await resolve_actionable_notifications(
        db,
        redis,
        notification_type="password_reset_pending",
        payload_match={"request_id": str(request_id)},
    )
    pr_title, pr_body, pr_payload = build_password_reset_resolved()
    await create_notification(
        db,
        redis,
        user_id=user.id,
        type="password_reset_resolved",
        title=pr_title,
        body=pr_body,
        payload=pr_payload,
    )
    await log_action(
        db,
        user_id=admin.id,
        action="admin_password_reset",
        detail={"request_id": str(request_id), "user_id": str(user.id), "username": user.username},
        ip=request.client.host if request.client else None,
    )
    await db.commit()
    logger.info("password_reset_resolved", request_id=str(request_id), admin=str(admin.id))
    return {"ok": True, "status": "resolved", "temporary_password": temporary_password}


@router.post("/password-reset-requests/{request_id}/reject")
@limiter.limit(ADMIN_RATE)
async def reject_password_reset_request(
    request: Request,
    request_id: uuid.UUID,
    body: ApproveRejectIn,
    admin: CurrentAdmin,
    db: DBSession,
):
    from datetime import datetime, timezone

    pr_res = await db.execute(
        select(PasswordResetRequest).where(PasswordResetRequest.id == request_id)
    )
    pr = pr_res.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Password reset request not found")
    if pr.status != "pending":
        raise HTTPException(status_code=409, detail="Request is already resolved")

    pr.status = "rejected"
    pr.admin_notes = body.admin_notes
    pr.resolved_by = admin.id
    pr.resolved_at = datetime.now(timezone.utc)

    await resolve_actionable_notifications(
        db,
        None,
        notification_type="password_reset_pending",
        payload_match={"request_id": str(request_id)},
    )
    await log_action(
        db,
        user_id=admin.id,
        action="admin_reject_password_reset",
        detail={
            "request_id": str(request_id),
            "user_id": str(pr.user_id),
            "notes": body.admin_notes,
        },
        ip=request.client.host if request.client else None,
    )
    await db.commit()
    logger.info("password_reset_rejected", request_id=str(request_id), admin=str(admin.id))
    return {"ok": True, "status": "rejected"}


@router.post("/polla/repair-unpaid-extra-cancellations")
@limiter.limit("10/minute")
async def repair_unpaid_extra_cancellations_endpoint(
    request: Request, admin: CurrentAdmin, db: DBSession,
):
    """Cancel unpaid extras on closed fixtures and backfill missing audit log entries."""
    result = await repair_unpaid_extra_cancellations(db)
    await log_action(
        db,
        user_id=admin.id,
        action="admin_repair_unpaid_extra_cancellations",
        detail=result,
        ip=request.client.host if request.client else None,
    )
    await db.commit()
    return {"ok": True, **result}


@router.post("/polla/repair-unconfirmed-extra-settlements")
@limiter.limit("10/minute")
async def repair_unconfirmed_extra_settlements_endpoint(
    request: Request, admin: CurrentAdmin, db: DBSession,
):
    """Revert points wrongly assigned to extras that were never payment-confirmed."""
    repaired = await repair_unconfirmed_extra_settlement(db)
    await log_action(
        db,
        user_id=admin.id,
        action="admin_repair_unconfirmed_extras",
        detail={"repaired_bets": repaired},
        ip=request.client.host if request.client else None,
    )
    await db.commit()
    return {"ok": True, "repaired_bets": repaired}


@router.post("/polla/repair-challenge-ranking")
@limiter.limit("10/minute")
async def repair_polla_challenge_ranking(request: Request, admin: CurrentAdmin, db: DBSession):
    """
    Corrige ranking de perdedores de retos que conservaron pts del partido (bug anterior).
    """
    from app.services.challenge_service import repair_settled_challenge_loser_points

    result = await db.execute(
        select(Group).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)  # noqa: E712
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="No active polla")

    repaired = await repair_settled_challenge_loser_points(db, group.id)
    await log_action(
        db,
        user_id=admin.id,
        action="admin_repair_challenge_ranking",
        detail={"group_id": str(group.id), "members_adjusted": repaired},
        ip=request.client.host if request.client else None,
    )
    await db.commit()
    return {"ok": True, "members_adjusted": repaired, "group_id": str(group.id)}
