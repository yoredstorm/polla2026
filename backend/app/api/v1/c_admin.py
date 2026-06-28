"""Competition-scoped admin API: /api/v1/c/{competition_slug}/admin/..."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import select, func, and_

from app.api.competition_deps import CompetitionAdminContext
from app.api.deps import CurrentUser, DBSession, RedisClient
from app.api.v1.admin import (
    ADMIN_RATE,
    AdminGroupPatch,
    AdminStatsOut,
    FixtureEditIn,
    FixtureGoalIn,
    FixtureLiveScoreIn,
    FixtureResultIn,
    FixtureStatusIn,
    SettleResponse,
    _group_payment_dict,
)
from app.core.rate_limiter import limiter
from app.models.bet import Bet
from app.models.bet_change_request import BetChangeRequest
from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
from app.models.user import User
from app.services.competition_admin_ops import build_competition_action_queue, competition_admin_stats
from app.services.competition_service import get_group_for_competition

router = APIRouter(prefix="/c/{competition_slug}/admin", tags=["Competition Admin"])


async def _pool_group(db, comp) -> Group:
    group = await get_group_for_competition(db, comp.id)
    if not group:
        raise HTTPException(status_code=404, detail="Pool not found for this competition")
    return group


async def _fixture_in_competition(db, fixture_id: uuid.UUID, competition_id: uuid.UUID) -> Fixture:
    result = await db.execute(
        select(Fixture).where(
            Fixture.id == fixture_id,
            Fixture.competition_id == competition_id,
        )
    )
    fixture = result.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
    return fixture


@router.get("/action-queue")
@limiter.limit(ADMIN_RATE)
async def competition_action_queue(
    request: Request,
    comp: CompetitionAdminContext,
    db: DBSession,
):
    group = await get_group_for_competition(db, comp.id)
    return await build_competition_action_queue(db, competition_id=comp.id, group=group)


@router.get("/stats", response_model=AdminStatsOut)
@limiter.limit(ADMIN_RATE)
async def competition_stats(request: Request, comp: CompetitionAdminContext, db: DBSession):
    group = await get_group_for_competition(db, comp.id)
    data = await competition_admin_stats(db, competition_id=comp.id, group=group)
    return AdminStatsOut(**data)


@router.get("/top-winners")
@limiter.limit(ADMIN_RATE)
async def competition_top_winners(
    request: Request,
    comp: CompetitionAdminContext,
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
            func.count(Bet.id).filter(and_(Bet.points_earned.isnot(None), Bet.points_earned == 0)).label(
                "wrong"
            ),
        )
        .join(Bet, Bet.user_id == User.id)
        .join(Fixture, Bet.fixture_id == Fixture.id)
        .where(Fixture.competition_id == comp.id)
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


@router.get("/fixtures")
@limiter.limit(ADMIN_RATE)
async def competition_admin_fixtures(
    request: Request,
    comp: CompetitionAdminContext,
    db: DBSession,
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    base = select(Fixture).where(Fixture.competition_id == comp.id)
    if status_filter:
        base = base.where(Fixture.status == status_filter)
    base = base.order_by(Fixture.match_date.desc())

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
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
                "group_name": f.group_name or f.group_label,
                "venue": f.venue,
                "is_locked": f.is_locked,
                "betting_open": f.betting_open,
                "bet_count": bet_counts.get(f.id, 0),
                "sync_mode": getattr(f, "sync_mode", "manual"),
                "last_scraped_home": getattr(f, "last_scraped_home", None),
                "last_scraped_away": getattr(f, "last_scraped_away", None),
                "last_scraped_status": getattr(f, "last_scraped_status", None),
                "consecutive_sync_failures": getattr(f, "consecutive_sync_failures", 0),
                "last_sync_at": (
                    f.last_sync_at.isoformat() if getattr(f, "last_sync_at", None) else None
                ),
            }
            for f in rows
        ],
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": max(1, -(-total // limit)),
        },
    }


@router.patch("/fixtures/{fixture_id}/result", response_model=SettleResponse)
@limiter.limit(ADMIN_RATE)
async def competition_update_fixture_result(
    request: Request,
    fixture_id: uuid.UUID,
    body: FixtureResultIn,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    from app.api.v1.admin import update_fixture_result

    await _fixture_in_competition(db, fixture_id, comp.id)
    return await update_fixture_result(request, fixture_id, body, admin, db, redis)


@router.patch("/fixtures/{fixture_id}/status")
@limiter.limit(ADMIN_RATE)
async def competition_update_fixture_status(
    request: Request,
    fixture_id: uuid.UUID,
    body: FixtureStatusIn,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    from app.api.v1.admin import update_fixture_status

    await _fixture_in_competition(db, fixture_id, comp.id)
    return await update_fixture_status(request, fixture_id, body, admin, db, redis)


@router.patch("/fixtures/{fixture_id}/live-score")
@limiter.limit(ADMIN_RATE)
async def competition_update_live_score(
    request: Request,
    fixture_id: uuid.UUID,
    body: FixtureLiveScoreIn,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    from app.api.v1.admin import update_fixture_live_score

    await _fixture_in_competition(db, fixture_id, comp.id)
    return await update_fixture_live_score(request, fixture_id, body, admin, db, redis)


@router.patch("/fixtures/{fixture_id}/goal")
@limiter.limit(ADMIN_RATE)
async def competition_record_goal(
    request: Request,
    fixture_id: uuid.UUID,
    body: FixtureGoalIn,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    from app.api.v1.admin import register_fixture_goal

    await _fixture_in_competition(db, fixture_id, comp.id)
    return await register_fixture_goal(request, fixture_id, body, admin, db, redis)


@router.get("/pool")
@limiter.limit(ADMIN_RATE)
async def competition_pool_detail(request: Request, comp: CompetitionAdminContext, db: DBSession):
    group = await _pool_group(db, comp)
    from app.services.group_service import sync_group_prize_pool

    if group.is_active:
        await sync_group_prize_pool(db, group)
        await db.commit()
    member_count = (
        await db.execute(
            select(func.count()).select_from(GroupMember).where(GroupMember.group_id == group.id)
        )
    ).scalar() or 0
    return {
        "id": str(group.id),
        "name": group.name,
        "owner_id": str(group.owner_id),
        "entry_fee": str(group.entry_fee),
        "prize_pool": str(group.prize_pool),
        "bet_amount_mode": group.bet_amount_mode,
        "fixed_bet_amount": str(group.fixed_bet_amount) if group.fixed_bet_amount is not None else None,
        "is_active": group.is_active,
        "challenge_max_stake": group.challenge_max_stake,
        "challenge_daily_limit": group.challenge_daily_limit,
        "challenge_tournament_limit": group.challenge_tournament_limit,
        "challenges_enabled": group.challenges_enabled,
        "member_count": int(member_count),
        "current_phase_key": group.current_phase_key,
        "prize_structure_mode": group.prize_structure_mode,
        "created_at": group.created_at.isoformat(),
        "competition_id": str(comp.id),
        "competition_slug": comp.slug,
        **_group_payment_dict(group),
    }


@router.patch("/pool")
@limiter.limit(ADMIN_RATE)
async def competition_patch_pool(
    request: Request,
    body: AdminGroupPatch,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
):
    group = await _pool_group(db, comp)
    from app.api.v1.admin import patch_group

    return await patch_group(request, group.id, body, admin, db)


@router.get("/pool/members")
@limiter.limit(ADMIN_RATE)
async def competition_pool_members(
    request: Request,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
):
    group = await _pool_group(db, comp)
    from app.api.v1.admin import list_group_members

    return await list_group_members(request, group.id, admin, db)


@router.get("/bet-change-requests")
@limiter.limit(ADMIN_RATE)
async def competition_change_requests(
    request: Request,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    from app.core.match_timing import ADMIN_RESOLVE_BEFORE

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
        .where(Fixture.competition_id == comp.id)
    )
    if status_filter:
        base = base.where(BetChangeRequest.status == status_filter)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
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
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": max(1, -(-total // limit)),
        },
    }


@router.post("/bet-change-requests/{request_id}/approve")
@limiter.limit(ADMIN_RATE)
async def competition_approve_change(
    request: Request,
    request_id: uuid.UUID,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    from app.api.v1.admin import ApproveRejectIn, approve_change_request

    await _validate_change_request_competition(db, request_id, comp.id)
    body = ApproveRejectIn()
    return await approve_change_request(request, request_id, body, admin, db, redis)


@router.post("/bet-change-requests/{request_id}/reject")
@limiter.limit(ADMIN_RATE)
async def competition_reject_change(
    request: Request,
    request_id: uuid.UUID,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    from app.api.v1.admin import ApproveRejectIn, reject_change_request

    await _validate_change_request_competition(db, request_id, comp.id)
    body = ApproveRejectIn()
    return await reject_change_request(request, request_id, body, admin, db, redis)


async def _validate_change_request_competition(db, request_id: uuid.UUID, competition_id: uuid.UUID):
    row = (
        await db.execute(
            select(Bet.fixture_id)
            .join(BetChangeRequest, BetChangeRequest.bet_id == Bet.id)
            .where(BetChangeRequest.id == request_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")
    fx = await db.get(Fixture, row)
    if not fx or fx.competition_id != competition_id:
        raise HTTPException(status_code=403, detail="Request not in this competition")


@router.get("/audit-log")
@limiter.limit(ADMIN_RATE)
async def competition_audit_log(
    request: Request,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    action: Optional[str] = Query(None),
):
    from app.models.audit_log import AuditLog
    from app.api.v1.admin import AuditLogOut
    from app.services.audit_formatter import enrich_audit_rows
    from app.services.competition_audit_service import competition_audit_log_filter

    group = await _pool_group(db, comp)
    scope = competition_audit_log_filter(comp, group.id)

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
        .where(scope)
    )
    if action:
        base = base.where(AuditLog.action == action)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (
        await db.execute(
            base.order_by(AuditLog.created_at.desc()).offset((page - 1) * limit).limit(limit)
        )
    ).all()
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
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": max(1, -(-total // limit)),
        },
    }


@router.patch("/fixtures/{fixture_id}/edit")
@limiter.limit(ADMIN_RATE)
async def competition_edit_fixture(
    request: Request,
    fixture_id: uuid.UUID,
    body: FixtureEditIn,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    from app.api.v1.admin import edit_fixture

    await _fixture_in_competition(db, fixture_id, comp.id)
    return await edit_fixture(request, fixture_id, body, admin, db, redis)


@router.get("/pool/non-members")
@limiter.limit(ADMIN_RATE)
async def competition_non_members(
    request: Request, comp: CompetitionAdminContext, admin: CurrentUser, db: DBSession
):
    group = await _pool_group(db, comp)
    from app.api.v1.admin import list_non_members

    return await list_non_members(request, group.id, admin, db)


@router.get("/pool/pending-extras")
@limiter.limit(ADMIN_RATE)
async def competition_pending_extras(
    request: Request, comp: CompetitionAdminContext, admin: CurrentUser, db: DBSession
):
    group = await _pool_group(db, comp)
    from app.api.v1.admin import list_pending_extras

    return await list_pending_extras(request, group.id, admin, db)


@router.post("/pool/confirm-extra/{bet_id}")
@limiter.limit(ADMIN_RATE)
async def competition_confirm_extra(
    request: Request,
    bet_id: uuid.UUID,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    group = await _pool_group(db, comp)
    from app.api.v1.admin import confirm_extra_bet

    return await confirm_extra_bet(request, group.id, bet_id, admin, db, redis)


@router.get("/pool/phase-fees")
@limiter.limit(ADMIN_RATE)
async def competition_phase_fees(
    request: Request, comp: CompetitionAdminContext, admin: CurrentUser, db: DBSession
):
    group = await _pool_group(db, comp)
    from app.api.v1.admin import get_group_phase_fees

    return await get_group_phase_fees(request, group.id, admin, db)


@router.get("/pool/phase-pending-entries")
@limiter.limit(ADMIN_RATE)
async def competition_phase_pending_entries(
    request: Request,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
    phase_key: str = Query(...),
):
    group = await _pool_group(db, comp)
    from app.api.v1.admin import list_phase_pending_entries

    return await list_phase_pending_entries(request, group.id, admin, db, phase_key=phase_key)


@router.get("/pool/all-phase-pending-entries")
@limiter.limit(ADMIN_RATE)
async def competition_all_phase_pending_entries(
    request: Request,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
):
    group = await _pool_group(db, comp)
    from app.api.v1.admin import list_all_phase_pending_entries_route

    return await list_all_phase_pending_entries_route(request, group.id, admin, db)


@router.get("/pool/phase-winners")
@limiter.limit(ADMIN_RATE)
async def competition_phase_winners(
    request: Request, comp: CompetitionAdminContext, admin: CurrentUser, db: DBSession
):
    group = await _pool_group(db, comp)
    from app.api.v1.admin import get_group_phase_winners

    return await get_group_phase_winners(request, group.id, admin, db)


@router.post("/pool/members", status_code=201)
@limiter.limit(ADMIN_RATE)
async def competition_add_member(
    request: Request,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    group = await _pool_group(db, comp)
    from app.api.v1.admin import AddMemberIn, add_group_member

    body = AddMemberIn(**(await request.json()))
    return await add_group_member(request, group.id, body, admin, db, redis)


@router.delete("/pool/members/{user_id}", status_code=200)
@limiter.limit(ADMIN_RATE)
async def competition_remove_member(
    request: Request,
    user_id: uuid.UUID,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    group = await _pool_group(db, comp)
    from app.api.v1.admin import remove_group_member

    return await remove_group_member(request, group.id, user_id, admin, db, redis)


@router.patch("/pool/phase-fees")
@limiter.limit(ADMIN_RATE)
async def competition_patch_phase_fees(
    request: Request,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
):
    group = await _pool_group(db, comp)
    from app.api.v1.admin import PhaseFeesPatchIn, patch_group_phase_fees

    body = PhaseFeesPatchIn(**(await request.json()))
    return await patch_group_phase_fees(request, group.id, body, admin, db)


@router.post("/pool/phase-enrollments", status_code=201)
@limiter.limit(ADMIN_RATE)
async def competition_confirm_phase_enrollment(
    request: Request,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    group = await _pool_group(db, comp)
    from app.api.v1.admin import PhaseEnrollmentIn, confirm_phase_enrollment_route

    body = PhaseEnrollmentIn(**(await request.json()))
    return await confirm_phase_enrollment_route(request, group.id, body, admin, db, redis)


@router.post("/pool/payment-qr", status_code=200)
@limiter.limit(ADMIN_RATE)
async def competition_upload_payment_qr(
    request: Request,
    comp: CompetitionAdminContext,
    admin: CurrentUser,
    db: DBSession,
    file: UploadFile = File(...),
):
    group = await _pool_group(db, comp)
    from app.api.v1.admin import upload_group_payment_qr

    return await upload_group_payment_qr(request, group.id, admin, db, file)
