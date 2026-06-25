"""
Groups router — OWASP A01: members only see group data if they belong.
"""
import uuid
from typing import Literal

from datetime import datetime, timezone

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from app.core.cors_utils import apply_cors_headers
from sqlalchemy import select, and_, func, desc, nulls_last

from app.api.deps import CurrentUser, DBSession, RedisClient
from app.core.rate_limiter import limiter, GLOBAL_RATE_LIMIT
from app.models.group import Group, GroupMember, GroupEntryProof
from app.models.group_phase import GroupPhaseEntryProof
from app.models.bet import Bet
from app.models.user import User
from app.models.fixture import Fixture
from app.schemas.group import (
    GroupCreate,
    GroupJoin,
    GroupOut,
    GroupMemberOut,
    LeaderboardEntry,
    GroupFixtureStandingEntry,
    FixturePredictionsBoardOut,
)
from app.schemas.bet import BetOut, BetWithUserOut
from app.services.group_service import (
    create_group,
    join_group,
    get_group_leaderboard,
    sync_group_prize_pool,
)
from app.services.bet_service import allocate_first_place_prizes
from app.services.audit import log_action
from app.services.notification_service import build_entry_pending, notify_admins
from app.services.payment_upload_service import (
    payment_qr_data_url,
    payment_qr_public_url,
    resolve_readable_path,
    save_entry_proof,
    save_phase_entry_proof,
)

from decimal import Decimal
from pydantic import BaseModel, Field

router = APIRouter(prefix="/groups", tags=["Groups"])


class EnrollmentChoiceOut(BaseModel):
    phase_key: str
    label: str
    entry_fee: str
    has_uploaded_proof: bool = False


class ActivePollaOut(BaseModel):
    id: uuid.UUID
    name: str
    entry_fee: Decimal
    prize_pool: Decimal
    currency: str
    per_match_amount: Decimal | None
    is_member: bool
    member_count: int
    payment_contact_name: str | None = None
    payment_phone: str | None = None
    payment_qr_url: str | None = None
    payment_qr_data_url: str | None = None
    has_uploaded_proof: bool = False
    challenges_enabled: bool = True
    current_phase_key: str = "groups"
    current_phase_label: str = "Grupos"
    current_phase_entry_fee: str = "0.00"
    current_phase_extra_per_match: str | None = None
    phase_enrollment_status: str = "none"
    prize_structure_mode: str = "full_milestones"
    payment_target_phase_key: str | None = None
    payment_target_phase_label: str | None = None
    payment_target_entry_fee: str | None = None
    early_enrollment_available: bool = False
    enrollment_choices: list[EnrollmentChoiceOut] = Field(default_factory=list)


async def _get_active_group(db: DBSession) -> Group | None:
    result = await db.execute(
        select(Group).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)  # noqa: E712
    )
    return result.scalar_one_or_none()


async def _user_has_proof(db: DBSession, group_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    res = await db.execute(
        select(GroupEntryProof).where(
            and_(GroupEntryProof.group_id == group_id, GroupEntryProof.user_id == user_id)
        )
    )
    return res.scalar_one_or_none() is not None


def _active_polla_payment_fields(group: Group) -> tuple[str | None, str | None, str | None]:
    qr_url = payment_qr_public_url(group.id) if group.payment_qr_path else None
    return group.payment_contact_name, group.payment_phone, qr_url


@router.get("/pool/active", response_model=ActivePollaOut | None)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_active_polla(request: Request, current_user: CurrentUser, db: DBSession):
    """Returns the first active group (the 'polla') and whether current user is a member."""
    from app.services.phase_enrollment_service import (
        ensure_phase_fees_for_group,
        resolve_payment_target_phase,
        get_phase_fee,
        get_new_user_enrollment_choices,
    )
    from app.services.prize_structure_service import get_effective_phases, phase_label, is_effective_phase

    group = await _get_active_group(db)
    if not group:
        return None

    await ensure_phase_fees_for_group(db, group)

    member_res = await db.execute(
        select(GroupMember).where(
            and_(GroupMember.group_id == group.id, GroupMember.user_id == current_user.id)
        )
    )
    is_member = member_res.scalar_one_or_none() is not None

    count_res = await db.execute(select(func.count()).where(GroupMember.group_id == group.id))
    member_count = int(count_res.scalar() or 0)

    per_match = None
    if group.fixed_bet_amount and group.fixed_bet_amount > 0:
        per_match = group.fixed_bet_amount

    contact_name, phone, qr_url = _active_polla_payment_fields(group)
    phase_key = group.current_phase_key or get_effective_phases(group)[0]
    phase_fee = await get_phase_fee(db, group.id, phase_key)
    phase_entry = phase_fee.entry_fee if phase_fee else group.entry_fee
    phase_extra = phase_fee.extra_per_match if phase_fee else group.fixed_bet_amount

    payment_target = await resolve_payment_target_phase(
        db, group, current_user.id, is_member=is_member
    )

    enrollment_choices_out: list[EnrollmentChoiceOut] = []
    if not is_member:
        for choice in await get_new_user_enrollment_choices(db, group, current_user.id):
            enrollment_choices_out.append(
                EnrollmentChoiceOut(
                    phase_key=choice.phase_key,
                    label=choice.label,
                    entry_fee=str(choice.entry_fee),
                    has_uploaded_proof=choice.has_uploaded_proof,
                )
            )

    has_proof = False
    enroll_status = "confirmed"
    qr_data_url: str | None = None
    payment_target_key: str | None = None
    payment_target_label: str | None = None
    payment_target_fee: str | None = None
    early_enrollment = False

    if payment_target:
        has_proof = payment_target.has_uploaded_proof
        enroll_status = payment_target.enrollment_status
        payment_target_key = payment_target.phase_key
        payment_target_label = payment_target.label
        payment_target_fee = str(payment_target.entry_fee)
        early_enrollment = payment_target.is_early_enrollment
        if group.payment_qr_path:
            qr_data_url = payment_qr_data_url(group.payment_qr_path)
    elif not is_member:
        enroll_status = "none"

    confirmed_pool = await sync_group_prize_pool(db, group)
    await db.commit()

    return ActivePollaOut(
        id=group.id,
        name=group.name,
        entry_fee=group.entry_fee,
        prize_pool=confirmed_pool,
        currency=group.currency,
        per_match_amount=per_match,
        is_member=is_member,
        member_count=member_count,
        payment_contact_name=contact_name,
        payment_phone=phone,
        payment_qr_url=qr_url,
        payment_qr_data_url=qr_data_url,
        has_uploaded_proof=has_proof,
        challenges_enabled=getattr(group, "challenges_enabled", True),
        current_phase_key=phase_key,
        current_phase_label=phase_label(phase_key, group),
        prize_structure_mode=group.prize_structure_mode,
        current_phase_entry_fee=str(phase_entry),
        current_phase_extra_per_match=str(phase_extra) if phase_extra else None,
        phase_enrollment_status=enroll_status,
        payment_target_phase_key=payment_target_key,
        payment_target_phase_label=payment_target_label,
        payment_target_entry_fee=payment_target_fee,
        early_enrollment_available=early_enrollment,
        enrollment_choices=enrollment_choices_out,
    )


@router.get("/payment-qr/{group_id}")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_payment_qr(
    request: Request,
    group_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    """Serve payment QR for the active polla (authenticated users)."""
    group = await _get_active_group(db)
    if not group or group.id != group_id:
        raise HTTPException(status_code=404, detail="Payment QR not found")
    if not group.payment_qr_path:
        raise HTTPException(status_code=404, detail="Payment QR not configured")
    path = resolve_readable_path(group.payment_qr_path)
    response = FileResponse(path, media_type="image/jpeg")
    return apply_cors_headers(request, response)


@router.post("/pool/active/entry-proof", status_code=201)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def upload_entry_proof(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
    file: UploadFile = File(...),
):
    """Upload entry payment proof while not yet a member of the active polla."""
    group = await _get_active_group(db)
    if not group:
        raise HTTPException(status_code=404, detail="No active polla")

    member_res = await db.execute(
        select(GroupMember).where(
            and_(GroupMember.group_id == group.id, GroupMember.user_id == current_user.id)
        )
    )
    if member_res.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Already a member")

    file_path = await save_entry_proof(group.id, current_user.id, file)
    existing = await db.execute(
        select(GroupEntryProof).where(
            and_(GroupEntryProof.group_id == group.id, GroupEntryProof.user_id == current_user.id)
        )
    )
    proof = existing.scalar_one_or_none()
    if proof:
        proof.file_path = file_path
        proof.uploaded_at = datetime.now(timezone.utc)
    else:
        proof = GroupEntryProof(
            group_id=group.id,
            user_id=current_user.id,
            file_path=file_path,
        )
        db.add(proof)
    await db.flush()
    await log_action(
        db,
        user_id=current_user.id,
        action="entry_proof_uploaded",
        detail={
            "group_id": str(group.id),
            "user_id": str(current_user.id),
            "username": current_user.username,
        },
        ip=request.client.host if request.client else None,
    )
    title, body, payload = build_entry_pending(
        username=current_user.username,
        user_id=str(current_user.id),
        group_id=str(group.id),
        has_proof=True,
    )
    await notify_admins(
        db, redis, type="entry_pending", title=title, body=body, payload=payload,
    )
    await db.commit()
    return {"ok": True, "has_uploaded_proof": True}


@router.post("/pool/active/phase-entry-proof", status_code=201)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def upload_phase_entry_proof(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
    file: UploadFile = File(...),
    phase_key: str | None = Query(None),
):
    """Upload payment proof for current or next tournament phase (re-enrollment)."""
    from app.services.phase_enrollment_service import (
        enrollment_status_for_phase,
        is_allowed_proof_phase_key,
        new_user_dual_enrollment_available,
    )
    from app.services.prize_structure_service import get_effective_phases, phase_label, is_effective_phase

    group = await _get_active_group(db)
    if not group:
        raise HTTPException(status_code=404, detail="No active polla")

    first_phase = get_effective_phases(group)[0]
    member_res = await db.execute(
        select(GroupMember).where(
            and_(GroupMember.group_id == group.id, GroupMember.user_id == current_user.id)
        )
    )
    is_member = member_res.scalar_one_or_none() is not None

    current = group.current_phase_key or first_phase
    current_status = (
        await enrollment_status_for_phase(db, group.id, current_user.id, current)
        if is_member
        else "none"
    )

    if phase_key:
        if not is_effective_phase(phase_key, group):
            raise HTTPException(status_code=400, detail="Invalid phase key")
        if not is_allowed_proof_phase_key(
            group,
            is_member=is_member,
            current_status=current_status,
            phase_key=phase_key,
        ):
            raise HTTPException(status_code=403, detail="Phase enrollment not allowed")
        target_key = phase_key
    elif not is_member and new_user_dual_enrollment_available(group):
        raise HTTPException(status_code=400, detail="Select a phase for enrollment")
    else:
        from app.services.phase_enrollment_service import resolve_payment_target_phase

        payment_target = await resolve_payment_target_phase(
            db, group, current_user.id, is_member=is_member
        )
        if not payment_target:
            raise HTTPException(status_code=403, detail="Already enrolled in this phase")
        target_key = payment_target.phase_key

    target_status = await enrollment_status_for_phase(
        db, group.id, current_user.id, target_key
    )
    if target_status == "confirmed":
        raise HTTPException(status_code=403, detail="Already enrolled in this phase")

    file_path = await save_phase_entry_proof(group.id, current_user.id, target_key, file)
    existing = await db.execute(
        select(GroupPhaseEntryProof).where(
            and_(
                GroupPhaseEntryProof.group_id == group.id,
                GroupPhaseEntryProof.user_id == current_user.id,
                GroupPhaseEntryProof.phase_key == target_key,
            )
        )
    )
    proof = existing.scalar_one_or_none()
    if proof:
        proof.file_path = file_path
        proof.uploaded_at = datetime.now(timezone.utc)
    else:
        db.add(
            GroupPhaseEntryProof(
                group_id=group.id,
                user_id=current_user.id,
                phase_key=target_key,
                file_path=file_path,
            )
        )
    await db.flush()
    await log_action(
        db,
        user_id=current_user.id,
        action="phase_entry_proof_uploaded",
        detail={
            "group_id": str(group.id),
            "phase_key": target_key,
            "username": current_user.username,
        },
        ip=request.client.host if request.client else None,
    )
    title = f"Inscripción pendiente — {phase_label(target_key, group)}"
    body = f"{current_user.username} subió comprobante para la fase {target_key}."
    await notify_admins(
        db,
        redis,
        type="phase_entry_pending",
        title=title,
        body=body,
        payload={
            "group_id": str(group.id),
            "user_id": str(current_user.id),
            "phase_key": target_key,
            "has_proof": True,
        },
    )
    await db.commit()
    return {"ok": True, "phase_key": target_key, "has_uploaded_proof": True}


class WinnerEntry(BaseModel):
    position: int
    user_id: str
    username: str
    first_name: str | None = None
    last_name: str | None = None
    total_points: int
    prize_amount: str


class WinnersOut(BaseModel):
    group_id: str
    group_name: str
    prize_pool: str
    currency: str
    winners: list[WinnerEntry]
    podium: list[WinnerEntry] = Field(default_factory=list)
    tied_for_first: bool = False


@router.get("/pool/active/winners", response_model=WinnersOut | None)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_active_polla_winners(request: Request, current_user: CurrentUser, db: DBSession):
    result = await db.execute(
        select(Group).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)  # noqa: E712
    )
    group = result.scalar_one_or_none()
    if not group:
        return None

    prize_pool = await sync_group_prize_pool(db, group)
    await db.commit()

    leaderboard = await get_group_leaderboard(db, group.id, sort="points", min_bets=1)
    allocations = allocate_first_place_prizes(leaderboard, prize_pool)
    winners: list[WinnerEntry] = []
    for entry, amount in allocations:
        winners.append(
            WinnerEntry(
                position=entry.position,
                user_id=str(entry.user_id),
                username=entry.username,
                first_name=entry.first_name,
                last_name=entry.last_name,
                total_points=entry.total_points,
                prize_amount=str(amount),
            )
        )
    podium: list[WinnerEntry] = []
    for entry in leaderboard[:3]:
        podium.append(
            WinnerEntry(
                position=entry.position,
                user_id=str(entry.user_id),
                username=entry.username,
                first_name=entry.first_name,
                last_name=entry.last_name,
                total_points=entry.total_points,
                prize_amount="0.00",
            )
        )
    return WinnersOut(
        group_id=str(group.id),
        group_name=group.name,
        prize_pool=str(prize_pool),
        currency=group.currency,
        winners=winners,
        podium=podium,
        tied_for_first=len(winners) > 1,
    )


class PhaseWinnerBrief(BaseModel):
    user_id: str
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    points: int
    prize_pool: str


class PhaseProgressItem(BaseModel):
    phase_key: str
    label: str
    total_fixtures: int
    finished_fixtures: int
    status: str
    milestone_end: int
    winner: dict | None = None


class TournamentProgressOut(BaseModel):
    group_id: str
    total_fixtures: int
    finished_fixtures: int
    current_phase_key: str | None
    phases: list[PhaseProgressItem]
    phase_winners: list[dict] = Field(default_factory=list)


@router.get("/pool/active/tournament-progress", response_model=TournamentProgressOut | None)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_active_tournament_progress(request: Request, current_user: CurrentUser, db: DBSession):
    from app.services.tournament_phase_service import build_tournament_progress

    result = await db.execute(
        select(Group).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)  # noqa: E712
    )
    group = result.scalar_one_or_none()
    if not group:
        return None
    progress = await build_tournament_progress(db, group.id)
    return TournamentProgressOut(group_id=str(group.id), **progress)


async def _assert_member(db, group_id: uuid.UUID, user_id: uuid.UUID):
    result = await db.execute(
        select(GroupMember).where(and_(GroupMember.group_id == group_id, GroupMember.user_id == user_id))
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "FORBIDDEN", "message": "You are not a member of this group"}},
        )


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def create_group_route(request: Request, data: GroupCreate, current_user: CurrentUser, db: DBSession):
    group = await create_group(db, current_user.id, data)
    member_count = 1
    out = GroupOut.model_validate(group)
    out.member_count = member_count
    return out


@router.get("", response_model=list[GroupOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def my_groups(request: Request, current_user: CurrentUser, db: DBSession):
    result = await db.execute(
        select(Group)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .where(GroupMember.user_id == current_user.id)
    )
    groups = result.scalars().all()
    out = []
    for g in groups:
        count_res = await db.execute(select(func.count()).where(GroupMember.group_id == g.id))
        go = GroupOut.model_validate(g)
        go.member_count = count_res.scalar()
        out.append(go)
    return out


@router.get("/{group_id}", response_model=GroupOut)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_group(request: Request, group_id: uuid.UUID, current_user: CurrentUser, db: DBSession):
    await _assert_member(db, group_id, current_user.id)
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail={"error": {"code": "GROUP_NOT_FOUND", "message": "Group not found"}})
    count_res = await db.execute(select(func.count()).where(GroupMember.group_id == group_id))
    go = GroupOut.model_validate(group)
    go.member_count = count_res.scalar()
    return go


@router.post("/join", response_model=GroupOut)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def join_group_route(request: Request, data: GroupJoin, current_user: CurrentUser, db: DBSession):
    try:
        group = await join_group(db, current_user.id, data.invite_code)
        count_res = await db.execute(select(func.count()).where(GroupMember.group_id == group.id))
        go = GroupOut.model_validate(group)
        go.member_count = count_res.scalar()
        return go
    except ValueError as e:
        code = str(e)
        msgs = {
            "GROUP_NOT_FOUND": "Group not found or inactive",
            "ALREADY_MEMBER": "You are already a member of this group",
            "GROUP_FULL": "This group has reached its maximum members",
        }
        raise HTTPException(status_code=400, detail={"error": {"code": code, "message": msgs.get(code, "Cannot join group")}})


@router.get("/{group_id}/members", response_model=list[GroupMemberOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def group_members(request: Request, group_id: uuid.UUID, current_user: CurrentUser, db: DBSession):
    await _assert_member(db, group_id, current_user.id)
    result = await db.execute(
        select(GroupMember, User)
        .join(User, GroupMember.user_id == User.id)
        .where(GroupMember.group_id == group_id)
    )
    return [
        GroupMemberOut(
            user_id=member.user_id,
            username=user.username,
            first_name=user.first_name,
            last_name=user.last_name,
            joined_at=member.joined_at,
            total_points=member.total_points,
            total_amount_bet=member.total_amount_bet,
        )
        for member, user in result.all()
    ]


@router.get("/{group_id}/leaderboard", response_model=list[LeaderboardEntry])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def group_leaderboard(
    request: Request,
    group_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
    sort: Literal["points", "accuracy", "bets"] = Query("points"),
    min_bets: int = Query(1, ge=1, le=500),
):
    await _assert_member(db, group_id, current_user.id)
    return await get_group_leaderboard(db, group_id, sort=sort, min_bets=min_bets)


@router.get("/{group_id}/fixtures/{fixture_id}/standings", response_model=list[GroupFixtureStandingEntry])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def group_fixture_standings(
    request: Request,
    group_id: uuid.UUID,
    fixture_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    await _assert_member(db, group_id, current_user.id)
    fx_res = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = fx_res.scalar_one_or_none()
    if not fixture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FIXTURE_NOT_FOUND", "message": "Fixture not found"}},
        )
    if fixture.status != "finished" or fixture.home_score is None or fixture.away_score is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "FIXTURE_NOT_FINISHED",
                    "message": "Standings are only available once the match is finished and scored.",
                }
            },
        )

    result = await db.execute(
        select(Bet, User.username, User.first_name, User.last_name)
        .join(User, Bet.user_id == User.id)
        .where(and_(Bet.group_id == group_id, Bet.fixture_id == fixture_id))
        .order_by(nulls_last(desc(Bet.points_earned)), Bet.created_at.desc())
    )
    rows = []
    for bet, username, first_name, last_name in result.all():
        rows.append(
            GroupFixtureStandingEntry(
                user_id=bet.user_id,
                username=username,
                first_name=first_name,
                last_name=last_name,
                predicted_home_score=bet.predicted_home_score,
                predicted_away_score=bet.predicted_away_score,
                points_earned=bet.points_earned,
                amount=bet.amount,
            )
        )
    return rows


@router.get(
    "/{group_id}/fixtures/{fixture_id}/predictions-board",
    response_model=FixturePredictionsBoardOut,
)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def group_fixture_predictions_board(
    request: Request,
    group_id: uuid.UUID,
    fixture_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
    at_home: int | None = Query(None, ge=0),
    at_away: int | None = Query(None, ge=0),
):
    await _assert_member(db, group_id, current_user.id)
    from app.services.fixture_predictions_service import build_fixture_predictions_board

    score_home = at_home if at_home is not None and at_away is not None else None
    score_away = at_away if at_home is not None and at_away is not None else None

    try:
        data = await build_fixture_predictions_board(
            db,
            group_id,
            fixture_id,
            current_user.id,
            viewer_is_admin=bool(getattr(current_user, "is_admin", False)),
            score_home=score_home,
            score_away=score_away,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "FIXTURE_NOT_FOUND":
            raise HTTPException(status_code=404, detail="Fixture not found")
        if code == "FIXTURE_NOT_LIVE":
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "FIXTURE_NOT_LIVE",
                        "message": "Predictions board is only available during live or finished matches.",
                    }
                },
            )
        raise
    return FixturePredictionsBoardOut(**data)


@router.get("/{group_id}/bets", response_model=list[BetWithUserOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def group_bets(request: Request, group_id: uuid.UUID, current_user: CurrentUser, db: DBSession):
    # A01: Only visible to group members
    await _assert_member(db, group_id, current_user.id)
    result = await db.execute(
        select(Bet, User.username, User.first_name, User.last_name)
        .join(User, Bet.user_id == User.id)
        .where(Bet.group_id == group_id)
        .order_by(nulls_last(desc(Bet.points_earned)), Bet.created_at.desc())
    )
    out: list[BetWithUserOut] = []
    for bet, username, first_name, last_name in result.all():
        base = BetOut.model_validate(bet).model_dump()
        out.append(
            BetWithUserOut(**base, username=username, first_name=first_name, last_name=last_name)
        )
    return out
