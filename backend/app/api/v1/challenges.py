"""1v1 challenges (Te reto)."""
import uuid
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, or_, desc, nulls_last

from app.api.deps import CurrentUser, DBSession, RedisClient
from app.core.rate_limiter import limiter, GLOBAL_RATE_LIMIT
from app.models.challenge import Challenge
from app.models.fixture import Fixture
from app.models.user import User
from app.services.avatar_service import avatar_display_path
from app.services.challenge_service import (
    create_challenge,
    accept_challenge,
    reject_challenge,
    available_points,
    search_challenge_opponents,
    get_challenge_max_stake,
    effective_max_stake_for_user,
    max_stake_by_balance,
    ranking_delta_for_user,
    duel_result_for_user,
    MIN_STAKE,
)

router = APIRouter(prefix="/challenges", tags=["Challenges"])


class ChallengeCreateIn(BaseModel):
    fixture_id: uuid.UUID
    challenged_username: str = Field(min_length=3, max_length=50)
    stake_points: int = Field(ge=MIN_STAKE, le=20)


class OpponentOut(BaseModel):
    username: str
    first_name: str | None = None
    last_name: str | None = None
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
    challenger_first_name: str | None = None
    challenger_last_name: str | None = None
    challenged_first_name: str | None = None
    challenged_last_name: str | None = None
    opponent_first_name: str | None = None
    opponent_last_name: str | None = None
    challenger_avatar_display: str | None = None
    challenged_avatar_display: str | None = None
    stake_points: int
    status: str
    winner_id: str | None
    challenger_fixture_points: int | None
    challenged_fixture_points: int | None
    created_at: str
    accepted_at: str | None
    settled_at: str | None
    fixture_home_team: str | None = None
    fixture_away_team: str | None = None
    fixture_match_date: str | None = None
    opponent_username: str | None = None
    my_fixture_points: int | None = None
    ranking_delta: int | None = None
    duel_result: str | None = None
    is_challenger: bool | None = None

    class Config:
        from_attributes = True


def _map_challenge(
    ch: Challenge,
    users: dict[uuid.UUID, dict],
    *,
    viewer_id: uuid.UUID | None = None,
    fixture: Fixture | None = None,
) -> ChallengeOut:
    ch_user = users.get(ch.challenger_id) or {}
    cd_user = users.get(ch.challenged_id) or {}
    return ChallengeOut(
        id=str(ch.id),
        fixture_id=str(ch.fixture_id),
        group_id=str(ch.group_id),
        challenger_id=str(ch.challenger_id),
        challenged_id=str(ch.challenged_id),
        challenger_username=ch_user.get("username"),
        challenged_username=cd_user.get("username"),
        challenger_first_name=ch_user.get("first_name"),
        challenger_last_name=ch_user.get("last_name"),
        challenged_first_name=cd_user.get("first_name"),
        challenged_last_name=cd_user.get("last_name"),
        opponent_first_name=(
            cd_user.get("first_name")
            if viewer_id == ch.challenger_id
            else ch_user.get("first_name")
            if viewer_id
            else None
        ),
        opponent_last_name=(
            cd_user.get("last_name")
            if viewer_id == ch.challenger_id
            else ch_user.get("last_name")
            if viewer_id
            else None
        ),
        challenger_avatar_display=ch_user.get("avatar_display"),
        challenged_avatar_display=cd_user.get("avatar_display"),
        stake_points=ch.stake_points,
        status=ch.status,
        winner_id=str(ch.winner_id) if ch.winner_id else None,
        challenger_fixture_points=ch.challenger_fixture_points,
        challenged_fixture_points=ch.challenged_fixture_points,
        created_at=ch.created_at.isoformat(),
        accepted_at=ch.accepted_at.isoformat() if ch.accepted_at else None,
        settled_at=ch.settled_at.isoformat() if ch.settled_at else None,
        fixture_home_team=fixture.home_team if fixture else None,
        fixture_away_team=fixture.away_team if fixture else None,
        fixture_match_date=fixture.match_date.isoformat() if fixture and fixture.match_date else None,
        opponent_username=(
            cd_user.get("username")
            if viewer_id == ch.challenger_id
            else ch_user.get("username")
            if viewer_id
            else None
        ),
        my_fixture_points=(
            ch.challenger_fixture_points
            if viewer_id == ch.challenger_id
            else ch.challenged_fixture_points
            if viewer_id == ch.challenged_id
            else None
        ),
        ranking_delta=ranking_delta_for_user(ch, viewer_id) if viewer_id else None,
        duel_result=duel_result_for_user(ch, viewer_id) if viewer_id else None,
        is_challenger=viewer_id == ch.challenger_id if viewer_id else None,
    )


async def _user_meta(db, *user_ids: uuid.UUID) -> dict[uuid.UUID, dict]:
    if not user_ids:
        return {}
    res = await db.execute(
        select(
            User.id,
            User.username,
            User.first_name,
            User.last_name,
            User.avatar_preset,
            User.avatar_url,
        ).where(User.id.in_(user_ids))
    )
    out: dict[uuid.UUID, dict] = {}
    for uid, username, first_name, last_name, preset, url in res.all():
        out[uid] = {
            "username": username,
            "first_name": first_name,
            "last_name": last_name,
            "avatar_display": avatar_display_path(preset, url),
        }
    return out


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
            "DAILY_CHALLENGE_LIMIT": "Agotaste tus retos de hoy. Se reinician a medianoche.",
            "TOURNAMENT_CHALLENGE_LIMIT": "Agotaste tus retos del mundial.",
            "CHALLENGES_DISABLED": "El sistema de retos esta desactivado por el administrador.",
        }
        raise HTTPException(status_code=400, detail={"error": {"code": code, "message": messages.get(code, code)}})

    users = await _user_meta(db, ch.challenger_id, ch.challenged_id)
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
            "CHALLENGES_DISABLED": "El sistema de retos esta desactivado por el administrador.",
        }
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": code, "message": messages.get(code, code)}},
        )

    users = await _user_meta(db, ch.challenger_id, ch.challenged_id)
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

    users = await _user_meta(db, ch.challenger_id, ch.challenged_id)
    return _map_challenge(ch, users)


@router.get("/my", response_model=list[ChallengeOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_my_challenges(request: Request, current_user: CurrentUser, db: DBSession):
    res = await db.execute(
        select(Challenge)
        .where(
            or_(Challenge.challenger_id == current_user.id, Challenge.challenged_id == current_user.id)
        )
        .order_by(nulls_last(desc(Challenge.settled_at)), Challenge.created_at.desc())
        .limit(100)
    )
    rows = res.scalars().all()
    ids: set[uuid.UUID] = set()
    fixture_ids: set[uuid.UUID] = set()
    for ch in rows:
        ids.add(ch.challenger_id)
        ids.add(ch.challenged_id)
        fixture_ids.add(ch.fixture_id)
    users = await _user_meta(db, *ids)
    fixtures: dict[uuid.UUID, Fixture] = {}
    if fixture_ids:
        fx = await db.execute(select(Fixture).where(Fixture.id.in_(fixture_ids)))
        fixtures = {f.id: f for f in fx.scalars().all()}
    return [
        _map_challenge(
            ch,
            users,
            viewer_id=current_user.id,
            fixture=fixtures.get(ch.fixture_id),
        )
        for ch in rows
    ]


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
    users = await _user_meta(db, *ids)
    return [_map_challenge(ch, users) for ch in rows]


@router.get("/available-points")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_available_points(request: Request, current_user: CurrentUser, db: DBSession):
    from app.services.challenge_service import _get_active_group, get_challenge_quota

    group = await _get_active_group(db)
    if not group:
        return {
            "available": 0,
            "max_stake": 0,
            "max_by_balance": 0,
            "effective_max": 0,
            "daily_limit": None,
            "daily_used": 0,
            "daily_remaining": None,
            "tournament_limit": None,
            "tournament_used": 0,
            "tournament_remaining": None,
            "daily_resets_at": None,
            "timezone": None,
        }
    pts = await available_points(db, current_user.id, group.id)
    group_max = await get_challenge_max_stake(db, group)
    eff = await effective_max_stake_for_user(db, current_user.id, group.id)
    quota = await get_challenge_quota(db, current_user.id, group)
    return {
        "available": pts,
        "max_stake": group_max,
        "max_by_balance": max_stake_by_balance(pts),
        "effective_max": eff,
        **quota,
    }
