"""1v1 challenges (Te reto)."""
import uuid
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, or_

from app.api.deps import CurrentUser, DBSession, RedisClient
from app.core.rate_limiter import limiter, GLOBAL_RATE_LIMIT
from app.models.challenge import Challenge
from app.models.user import User
from app.services.challenge_service import (
    create_challenge,
    accept_challenge,
    reject_challenge,
    available_points,
    search_challenge_opponents,
    get_challenge_max_stake,
    effective_max_stake_for_user,
    max_stake_by_balance,
    MIN_STAKE,
)

router = APIRouter(prefix="/challenges", tags=["Challenges"])


class ChallengeCreateIn(BaseModel):
    fixture_id: uuid.UUID
    challenged_username: str = Field(min_length=3, max_length=50)
    stake_points: int = Field(ge=MIN_STAKE, le=20)


class OpponentOut(BaseModel):
    username: str
    total_points: int
    available_for_challenge: int


class ChallengeOut(BaseModel):
    id: str
    fixture_id: str
    group_id: str
    challenger_id: str
    challenged_id: str
    challenger_username: str | None = None
    challenged_username: str | None = None
    stake_points: int
    status: str
    winner_id: str | None
    challenger_fixture_points: int | None
    challenged_fixture_points: int | None
    created_at: str
    accepted_at: str | None
    settled_at: str | None

    class Config:
        from_attributes = True


def _map_challenge(ch: Challenge, users: dict[uuid.UUID, str]) -> ChallengeOut:
    return ChallengeOut(
        id=str(ch.id),
        fixture_id=str(ch.fixture_id),
        group_id=str(ch.group_id),
        challenger_id=str(ch.challenger_id),
        challenged_id=str(ch.challenged_id),
        challenger_username=users.get(ch.challenger_id),
        challenged_username=users.get(ch.challenged_id),
        stake_points=ch.stake_points,
        status=ch.status,
        winner_id=str(ch.winner_id) if ch.winner_id else None,
        challenger_fixture_points=ch.challenger_fixture_points,
        challenged_fixture_points=ch.challenged_fixture_points,
        created_at=ch.created_at.isoformat(),
        accepted_at=ch.accepted_at.isoformat() if ch.accepted_at else None,
        settled_at=ch.settled_at.isoformat() if ch.settled_at else None,
    )


async def _usernames(db, *user_ids: uuid.UUID) -> dict[uuid.UUID, str]:
    if not user_ids:
        return {}
    res = await db.execute(select(User.id, User.username).where(User.id.in_(user_ids)))
    return {row[0]: row[1] for row in res.all()}


@router.post("", response_model=ChallengeOut, status_code=201)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def post_challenge(
    request: Request,
    body: ChallengeCreateIn,
    current_user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    try:
        ch = await create_challenge(
            db,
            redis,
            challenger_id=current_user.id,
            challenged_username=body.challenged_username.strip(),
            fixture_id=body.fixture_id,
            stake_points=body.stake_points,
            ip=request.client.host if request.client else None,
        )
        await db.commit()
    except ValueError as e:
        await db.rollback()
        code = str(e)
        messages = {
            "INVALID_STAKE": "Apuesta invalida",
            "NO_ACTIVE_POLLA": "No hay polla activa",
            "FIXTURE_NOT_OPEN": "Partido no disponible para retos",
            "USER_NOT_FOUND": "Usuario no encontrado",
            "CANNOT_CHALLENGE_SELF": "No puedes retarte a ti mismo",
            "NOT_POLLA_MEMBER": "Ambos deben ser miembros de la polla",
            "INSUFFICIENT_POINTS": "Puntos insuficientes",
            "OPPONENT_INSUFFICIENT_POINTS": "Tu rival no tiene puntos suficientes para esta apuesta",
            "CHALLENGE_EXISTS": "Ya existe un reto activo entre ustedes en este partido",
            "BOTH_NEED_BET": "Debes tener apuesta en este partido antes de retar",
            "STAKE_ABOVE_MAX": "Supera el maximo de puntos por duelo de la polla",
            "STAKE_ABOVE_HALF_BALANCE": "No puedes apostar mas del 50% de tus puntos disponibles",
        }
        raise HTTPException(status_code=400, detail={"error": {"code": code, "message": messages.get(code, code)}})

    users = await _usernames(db, ch.challenger_id, ch.challenged_id)
    return _map_challenge(ch, users)


@router.get("/opponents", response_model=list[OpponentOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_opponents(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    q: str = Query("", min_length=0, max_length=50),
    limit: int = Query(10, ge=1, le=20),
):
    rows = await search_challenge_opponents(db, current_user.id, q, limit=limit)
    return [OpponentOut(**row) for row in rows]


@router.post("/{challenge_id}/accept", response_model=ChallengeOut)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def post_accept(
    request: Request,
    challenge_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    try:
        ch = await accept_challenge(
            db, redis, challenge_id=challenge_id, user_id=current_user.id,
            ip=request.client.host if request.client else None,
        )
        await db.commit()
    except ValueError as e:
        await db.rollback()
        code = str(e)
        messages = {
            "INSUFFICIENT_POINTS": "Puntos insuficientes",
            "BOTH_NEED_BET": "Ambos deben tener apuesta en este partido",
            "FIXTURE_LOCKED": "Partido ya bloqueado",
            "NOT_FOUND": "Reto no encontrado",
            "INVALID_STATUS": "Estado invalido",
        }
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": code, "message": messages.get(code, code)}},
        )

    users = await _usernames(db, ch.challenger_id, ch.challenged_id)
    return _map_challenge(ch, users)


@router.post("/{challenge_id}/reject", response_model=ChallengeOut)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def post_reject(
    request: Request,
    challenge_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    try:
        ch = await reject_challenge(
            db, redis, challenge_id=challenge_id, user_id=current_user.id,
            ip=request.client.host if request.client else None,
        )
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=404, detail=str(e))

    users = await _usernames(db, ch.challenger_id, ch.challenged_id)
    return _map_challenge(ch, users)


@router.get("/my", response_model=list[ChallengeOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_my_challenges(request: Request, current_user: CurrentUser, db: DBSession):
    res = await db.execute(
        select(Challenge)
        .where(
            or_(Challenge.challenger_id == current_user.id, Challenge.challenged_id == current_user.id)
        )
        .order_by(Challenge.created_at.desc())
        .limit(50)
    )
    rows = res.scalars().all()
    ids: set[uuid.UUID] = set()
    for ch in rows:
        ids.add(ch.challenger_id)
        ids.add(ch.challenged_id)
    users = await _usernames(db, *ids)
    return [_map_challenge(ch, users) for ch in rows]


@router.get("/fixture/{fixture_id}", response_model=list[ChallengeOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_fixture_challenges(
    request: Request,
    fixture_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    res = await db.execute(
        select(Challenge).where(
            Challenge.fixture_id == fixture_id,
            or_(Challenge.challenger_id == current_user.id, Challenge.challenged_id == current_user.id),
        )
    )
    rows = res.scalars().all()
    ids: set[uuid.UUID] = set()
    for ch in rows:
        ids.add(ch.challenger_id)
        ids.add(ch.challenged_id)
    users = await _usernames(db, *ids)
    return [_map_challenge(ch, users) for ch in rows]


@router.get("/available-points")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_available_points(request: Request, current_user: CurrentUser, db: DBSession):
    from app.services.challenge_service import _get_active_group

    group = await _get_active_group(db)
    if not group:
        return {"available": 0, "max_stake": 0, "max_by_balance": 0, "effective_max": 0}
    pts = await available_points(db, current_user.id, group.id)
    group_max = await get_challenge_max_stake(db, group)
    eff = await effective_max_stake_for_user(db, current_user.id, group.id)
    return {
        "available": pts,
        "max_stake": group_max,
        "max_by_balance": max_stake_by_balance(pts),
        "effective_max": eff,
    }
