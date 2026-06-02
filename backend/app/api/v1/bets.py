"""
Bets router — OWASP A01: Access Control (users can only see their own bets).
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import select, and_, func

from app.api.deps import CurrentUser, DBSession, RedisClient
from app.core.rate_limiter import limiter, GLOBAL_RATE_LIMIT
from app.models.bet import Bet
from app.models.bet_change_request import BetChangeRequest
from app.models.fixture import Fixture
from app.schemas.bet import BetCreate, BetOut, BetWithFixtureSummaryOut
from app.schemas.common import PaginatedResponse, PaginationMeta
from app.services.bet_service import create_bet as svc_create_bet
from app.services.bet_service import can_create_change_request_for_fixture
from app.services.audit import log_action
from app.models.user import User
from app.services.notification_service import (
    notify_admins,
    build_change_request_pending,
    build_extra_bet_pending,
    broadcast_event,
    notify_followers_of_new_bet,
)

router = APIRouter(prefix="/bets", tags=["Bets"])


async def _notify_followers_after_bet(
    db: DBSession,
    redis: RedisClient,
    *,
    user: User,
    bet: Bet,
) -> None:
    fx_res = await db.execute(select(Fixture).where(Fixture.id == bet.fixture_id))
    fixture = fx_res.scalar_one_or_none()
    if not fixture:
        return
    await notify_followers_of_new_bet(
        db,
        redis,
        actor_id=user.id,
        actor_username=user.username,
        bet_id=bet.id,
        fixture_id=bet.fixture_id,
        predicted_home=bet.predicted_home_score,
        predicted_away=bet.predicted_away_score,
        home_team=fixture.home_team,
        away_team=fixture.away_team,
    )


@router.post("", response_model=BetOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def create_bet(
    request: Request,
    data: BetCreate,
    current_user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    try:
        bet = await svc_create_bet(db, current_user.id, data)
        await log_action(db, user_id=current_user.id, action="bet_create", detail={
            "fixture_id": str(data.fixture_id), "home": data.predicted_home_score, "away": data.predicted_away_score,
            "group_id": str(data.group_id) if data.group_id else None, "amount": str(data.amount) if data.amount else "0",
        }, ip=request.client.host if request.client else None)
        if bet.group_id and not bet.amount_confirmed and bet.amount > 0:
            title, body, payload = build_extra_bet_pending(
                username=current_user.username,
                user_id=str(current_user.id),
                bet_id=str(bet.id),
                group_id=str(bet.group_id),
                fixture_id=str(bet.fixture_id),
                amount=str(bet.amount),
                predicted_home=bet.predicted_home_score,
                predicted_away=bet.predicted_away_score,
            )
            await notify_admins(
                db,
                redis,
                type="extra_bet_pending",
                title=title,
                body=body,
                payload=payload,
                exclude_user_id=current_user.id,
            )
        else:
            await _notify_followers_after_bet(db, redis, user=current_user, bet=bet)
            if bet.amount_confirmed:
                await broadcast_event(
                    db,
                    redis,
                    {"type": "data_refresh", "data": {"reason": "bet_placed"}},
                )
        return BetOut.model_validate(bet)
    except ValueError as e:
        error_code = str(e)
        messages = {
            "FIXTURE_NOT_FOUND": "Partido no encontrado",
            "BET_LOCKED": "Este partido ya no acepta apuestas (cierra 1 minuto antes del inicio o el partido no está programado).",
            "BET_ALREADY_EXISTS": "Ya tienes una apuesta para este partido",
            "BET_ALREADY_EXISTS_IN_GROUP": "Ya tienes una apuesta para este partido",
            "NOT_GROUP_MEMBER": "No eres miembro de este grupo",
            "NOT_POLLA_MEMBER": "Tu pago de entrada aún no ha sido confirmado",
            "NO_ACTIVE_POLLA": "No hay polla activa. Contacta al administrador.",
            "DUPLICATE_PREDICTION_SCORE": (
                "Ya tienes una prediccion con ese marcador en este partido. "
                "Cada apuesta (gratis o extra) debe usar un marcador distinto."
            ),
        }
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": error_code, "message": messages.get(error_code, "Cannot create bet")}},
        )




@router.get("/my-bets", response_model=PaginatedResponse[BetWithFixtureSummaryOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def my_bets(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
):
    count_base = (
        select(Bet.id)
        .join(Fixture, Bet.fixture_id == Fixture.id)
        .where(Bet.user_id == current_user.id)
    )
    count_result = await db.execute(select(func.count()).select_from(count_base.subquery()))
    total = count_result.scalar()

    base = (
        select(Bet, Fixture)
        .join(Fixture, Bet.fixture_id == Fixture.id)
        .where(Bet.user_id == current_user.id)
    )
    result = await db.execute(
        base.order_by(Bet.created_at.desc()).offset((page - 1) * limit).limit(limit)
    )
    rows = result.all()

    out: list[BetWithFixtureSummaryOut] = []
    for bet, fx in rows:
        d = BetOut.model_validate(bet).model_dump()
        d["fixture_match_date"] = fx.match_date
        d["fixture_home_team"] = fx.home_team
        d["fixture_away_team"] = fx.away_team
        d["fixture_status"] = fx.status
        out.append(BetWithFixtureSummaryOut(**d))

    return PaginatedResponse(
        data=out,
        pagination=PaginationMeta(total=total, page=page, limit=limit, total_pages=-(-total // limit)),
    )


@router.get("/my-bets/{fixture_id}", response_model=list[BetOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def my_bets_for_fixture(request: Request, fixture_id: uuid.UUID, current_user: CurrentUser, db: DBSession):
    # A01: Only return current user's bets for this fixture
    result = await db.execute(
        select(Bet).where(
            and_(Bet.user_id == current_user.id, Bet.fixture_id == fixture_id)
        )
    )
    return [BetOut.model_validate(b) for b in result.scalars().all()]


@router.get("/my-change-requests")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def my_change_requests(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    base = (
        select(
            BetChangeRequest,
            Bet.predicted_home_score,
            Bet.predicted_away_score,
            Bet.fixture_id,
            Fixture.match_date,
        )
        .join(Bet, BetChangeRequest.bet_id == Bet.id)
        .join(Fixture, Bet.fixture_id == Fixture.id)
        .where(BetChangeRequest.user_id == current_user.id)
    )

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
            ChangeRequestOut(
                id=str(cr.id),
                bet_id=str(cr.bet_id),
                request_type=cr.request_type,
                new_predicted_home_score=cr.new_predicted_home_score,
                new_predicted_away_score=cr.new_predicted_away_score,
                reason=cr.reason,
                status=cr.status,
                admin_notes=cr.admin_notes,
                created_at=cr.created_at.isoformat(),
                resolved_at=cr.resolved_at.isoformat() if cr.resolved_at else None,
                predicted_home_score=home,
                predicted_away_score=away,
                fixture_id=str(fid),
                fixture_match_date=fmd.isoformat(),
            )
            for cr, home, away, fid, fmd in rows
        ],
        "pagination": {"total": total, "page": page, "limit": limit, "total_pages": max(1, -(-total // limit))},
    }


@router.get("/{bet_id}", response_model=BetOut)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_bet(request: Request, bet_id: uuid.UUID, current_user: CurrentUser, db: DBSession):
    result = await db.execute(select(Bet).where(Bet.id == bet_id))
    bet = result.scalar_one_or_none()
    if not bet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "BET_NOT_FOUND", "message": "Bet not found"}},
        )
    # A01: Users can only access their own bets
    if bet.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "FORBIDDEN", "message": "Access denied"}},
        )
    return BetOut.model_validate(bet)


# ── Bulk copy ──────────────────────────────────────────────────────────

class BulkBetItem(BaseModel):
    fixture_id: uuid.UUID
    predicted_home_score: int
    predicted_away_score: int
    mode: Literal["free", "extra"] = "free"
    add_extra: bool = False  # legacy; ignored when mode is set explicitly by client


class BulkCopyIn(BaseModel):
    bets: list[BulkBetItem]
    source_user_id: uuid.UUID | None = None


class BulkCopyOut(BaseModel):
    created: int
    skipped: int
    errors: list[str]


@router.post("/bulk-copy", response_model=BulkCopyOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def bulk_copy_bets(
    request: Request,
    body: BulkCopyIn,
    current_user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    from app.models.group import Group
    from app.models.user import User

    source_username: str | None = None
    if body.source_user_id:
        src_res = await db.execute(select(User).where(User.id == body.source_user_id))
        src_user = src_res.scalar_one_or_none()
        if src_user:
            source_username = src_user.username

    polla_res = await db.execute(
        select(Group).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)
    )
    active_polla = polla_res.scalar_one_or_none()

    created = 0
    skipped = 0
    errors: list[str] = []

    extra_amount = Decimal("1")
    if active_polla and active_polla.fixed_bet_amount and active_polla.fixed_bet_amount > 0:
        extra_amount = active_polla.fixed_bet_amount

    for item in body.bets:
        copy_mode = item.mode

        existing_free = await db.execute(
            select(Bet).where(
                and_(Bet.user_id == current_user.id, Bet.fixture_id == item.fixture_id, Bet.group_id == None)
            )
        )
        has_free = existing_free.scalar_one_or_none() is not None

        if copy_mode == "free":
            if has_free:
                skipped += 1
                continue
            try:
                free_data = BetCreate(
                    fixture_id=item.fixture_id,
                    predicted_home_score=item.predicted_home_score,
                    predicted_away_score=item.predicted_away_score,
                    group_id=None,
                    amount=Decimal("0"),
                )
                bet = await svc_create_bet(db, current_user.id, free_data)
                await _notify_followers_after_bet(db, redis, user=current_user, bet=bet)
                created += 1
            except ValueError as e:
                code = str(e)
                if code == "BET_ALREADY_EXISTS":
                    skipped += 1
                else:
                    errors.append(f"{item.fixture_id}: {code}")
            continue

        if copy_mode == "extra":
            if not active_polla:
                errors.append(f"{item.fixture_id} extra: NO_ACTIVE_POLLA")
                continue
            try:
                extra_data = BetCreate(
                    fixture_id=item.fixture_id,
                    predicted_home_score=item.predicted_home_score,
                    predicted_away_score=item.predicted_away_score,
                    group_id=active_polla.id,
                    amount=extra_amount,
                )
                bet = await svc_create_bet(db, current_user.id, extra_data)
                if not (bet.group_id and not bet.amount_confirmed and bet.amount > 0):
                    await _notify_followers_after_bet(db, redis, user=current_user, bet=bet)
                created += 1
            except ValueError as e:
                errors.append(f"{item.fixture_id} extra: {str(e)}")

    await log_action(db, user_id=current_user.id, action="bulk_copy", detail={
        "total_items": len(body.bets),
        "created": created,
        "skipped": skipped,
        "error_count": len(errors),
        "source_user_id": str(body.source_user_id) if body.source_user_id else None,
        "source_username": source_username,
    }, ip=request.client.host if request.client else None)
    await db.commit()

    return BulkCopyOut(created=created, skipped=skipped, errors=errors)


# ── Change requests ────────────────────────────────────────────────────

class ChangeRequestIn(BaseModel):
    request_type: Literal["modify", "delete"]
    new_predicted_home_score: int | None = None
    new_predicted_away_score: int | None = None
    reason: str | None = None


class ChangeRequestOut(BaseModel):
    id: str
    bet_id: str
    request_type: str
    new_predicted_home_score: int | None
    new_predicted_away_score: int | None
    reason: str | None
    status: str
    admin_notes: str | None
    created_at: str
    resolved_at: str | None
    # bet snapshot
    predicted_home_score: int | None = None
    predicted_away_score: int | None = None
    fixture_id: str | None = None
    fixture_match_date: str | None = None


@router.post("/{bet_id}/change-request", status_code=status.HTTP_201_CREATED)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def create_change_request(
    request: Request,
    bet_id: uuid.UUID,
    body: ChangeRequestIn,
    current_user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    bet_res = await db.execute(select(Bet).where(Bet.id == bet_id))
    bet = bet_res.scalar_one_or_none()
    if not bet:
        raise HTTPException(status_code=404, detail="Bet not found")
    if bet.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # No duplicate pending request for same bet
    existing = await db.execute(
        select(BetChangeRequest).where(
            and_(
                BetChangeRequest.bet_id == bet_id,
                BetChangeRequest.status == "pending",
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ya tienes una solicitud pendiente para esta apuesta")

    fx_res = await db.execute(select(Fixture).where(Fixture.id == bet.fixture_id))
    fixture = fx_res.scalar_one_or_none()
    if not fixture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FIXTURE_NOT_FOUND", "message": "Partido no encontrado"}},
        )
    if not can_create_change_request_for_fixture(fixture):
        if fixture.status != "scheduled":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": {
                        "code": "CHANGE_REQUEST_NOT_ALLOWED",
                        "message": "No se pueden solicitar cambios para este partido.",
                    }
                },
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": {
                    "code": "CHANGE_REQUEST_WINDOW_CLOSED",
                    "message": "No se aceptan solicitudes de cambio en la ultima hora antes del partido.",
                }
            },
        )

    if body.request_type == "modify":
        if body.new_predicted_home_score is None or body.new_predicted_away_score is None:
            raise HTTPException(status_code=400, detail="Scores are required for modify requests")

    cr = BetChangeRequest(
        user_id=current_user.id,
        bet_id=bet_id,
        request_type=body.request_type,
        new_predicted_home_score=body.new_predicted_home_score,
        new_predicted_away_score=body.new_predicted_away_score,
        reason=body.reason,
        status="pending",
    )
    db.add(cr)
    await db.flush()
    await db.refresh(cr)

    title, notif_body, payload = build_change_request_pending(
        username=current_user.username,
        request_type=body.request_type,
        request_id=str(cr.id),
        bet_id=str(bet_id),
        fixture_id=str(bet.fixture_id),
        original_home=bet.predicted_home_score,
        original_away=bet.predicted_away_score,
        new_home=body.new_predicted_home_score,
        new_away=body.new_predicted_away_score,
        reason=body.reason,
    )
    await notify_admins(
        db, redis, type="change_request_pending", title=title, body=notif_body, payload=payload,
    )

    await log_action(db, user_id=current_user.id, action="bet_change_request", detail={
        "bet_id": str(bet_id), "type": body.request_type,
        "new_home": body.new_predicted_home_score, "new_away": body.new_predicted_away_score,
        "reason": body.reason,
    }, ip=request.client.host if request.client else None)
    await db.commit()

    return ChangeRequestOut(
        id=str(cr.id),
        bet_id=str(cr.bet_id),
        request_type=cr.request_type,
        new_predicted_home_score=cr.new_predicted_home_score,
        new_predicted_away_score=cr.new_predicted_away_score,
        reason=cr.reason,
        status=cr.status,
        admin_notes=cr.admin_notes,
        created_at=cr.created_at.isoformat(),
        resolved_at=cr.resolved_at.isoformat() if cr.resolved_at else None,
        predicted_home_score=bet.predicted_home_score,
        predicted_away_score=bet.predicted_away_score,
        fixture_id=str(bet.fixture_id),
        fixture_match_date=fixture.match_date.isoformat(),
    )
