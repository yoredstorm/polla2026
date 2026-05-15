"""
Groups router — OWASP A01: members only see group data if they belong.
"""
import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import select, and_, func, desc, nulls_last

from app.api.deps import CurrentUser, DBSession
from app.core.rate_limiter import limiter, GLOBAL_RATE_LIMIT
from app.models.group import Group, GroupMember
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
)
from app.schemas.bet import BetOut, BetWithUserOut
from app.services.group_service import create_group, join_group, get_group_leaderboard

from decimal import Decimal
from pydantic import BaseModel

router = APIRouter(prefix="/groups", tags=["Groups"])


class ActivePollaOut(BaseModel):
    id: uuid.UUID
    name: str
    entry_fee: Decimal
    prize_pool: Decimal
    currency: str
    per_match_amount: Decimal | None
    is_member: bool
    member_count: int


@router.get("/pool/active", response_model=ActivePollaOut | None)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_active_polla(request: Request, current_user: CurrentUser, db: DBSession):
    """Returns the first active group (the 'polla') and whether current user is a member."""
    result = await db.execute(
        select(Group).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)
    )
    group = result.scalar_one_or_none()
    if not group:
        return None

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

    return ActivePollaOut(
        id=group.id,
        name=group.name,
        entry_fee=group.entry_fee,
        prize_pool=group.prize_pool,
        currency=group.currency,
        per_match_amount=per_match,
        is_member=is_member,
        member_count=member_count,
    )


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
        select(Bet, User.username)
        .join(User, Bet.user_id == User.id)
        .where(and_(Bet.group_id == group_id, Bet.fixture_id == fixture_id))
        .order_by(nulls_last(desc(Bet.points_earned)), Bet.created_at.desc())
    )
    rows = []
    for bet, username in result.all():
        rows.append(
            GroupFixtureStandingEntry(
                user_id=bet.user_id,
                username=username,
                predicted_home_score=bet.predicted_home_score,
                predicted_away_score=bet.predicted_away_score,
                points_earned=bet.points_earned,
                amount=bet.amount,
            )
        )
    return rows


@router.get("/{group_id}/bets", response_model=list[BetWithUserOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def group_bets(request: Request, group_id: uuid.UUID, current_user: CurrentUser, db: DBSession):
    # A01: Only visible to group members
    await _assert_member(db, group_id, current_user.id)
    result = await db.execute(
        select(Bet, User.username)
        .join(User, Bet.user_id == User.id)
        .where(Bet.group_id == group_id)
        .order_by(nulls_last(desc(Bet.points_earned)), Bet.created_at.desc())
    )
    out: list[BetWithUserOut] = []
    for bet, username in result.all():
        base = BetOut.model_validate(bet).model_dump()
        out.append(BetWithUserOut(**base, username=username))
    return out
