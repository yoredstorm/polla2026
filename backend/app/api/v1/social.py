"""Social layer: follow users, fixture comments and reactions."""
import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, delete, desc

from app.api.deps import CurrentUser, CurrentAdmin, DBSession
from app.core.rate_limiter import limiter, GLOBAL_RATE_LIMIT
from app.models.bet import Bet
from app.models.fixture import Fixture
from app.models.social import UserFollow, FixtureComment, FixtureReaction, REACTION_TYPES
from app.models.user import User

router = APIRouter(prefix="/social", tags=["Social"])

ReactionType = Literal["like", "fire", "trophy"]


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=500)


class ReactionIn(BaseModel):
    reaction_type: ReactionType


@router.post("/follow/{username}", status_code=201)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def follow_user(
    request: Request,
    username: str,
    current_user: CurrentUser,
    db: DBSession,
):
    target = (
        await db.execute(select(User).where(User.username == username, User.is_active == True))  # noqa: E712
    ).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    existing = await db.execute(
        select(UserFollow).where(
            UserFollow.follower_id == current_user.id,
            UserFollow.following_id == target.id,
        )
    )
    if existing.scalar_one_or_none():
        return {"ok": True, "following": True}
    db.add(UserFollow(follower_id=current_user.id, following_id=target.id))
    await db.commit()
    return {"ok": True, "following": True, "username": target.username}


@router.delete("/follow/{username}", status_code=200)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def unfollow_user(
    request: Request,
    username: str,
    current_user: CurrentUser,
    db: DBSession,
):
    target = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.execute(
        delete(UserFollow).where(
            UserFollow.follower_id == current_user.id,
            UserFollow.following_id == target.id,
        )
    )
    await db.commit()
    return {"ok": True, "following": False}


@router.get("/follow/{username}/status")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def follow_status(
    request: Request,
    username: str,
    current_user: CurrentUser,
    db: DBSession,
):
    target = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id:
        return {"following": False, "is_self": True}
    row = await db.execute(
        select(UserFollow.id).where(
            UserFollow.follower_id == current_user.id,
            UserFollow.following_id == target.id,
        )
    )
    return {"following": row.scalar_one_or_none() is not None, "is_self": False}


@router.get("/following")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_following(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    limit: int = Query(50, ge=1, le=100),
):
    q = (
        select(User.username, UserFollow.created_at)
        .join(User, User.id == UserFollow.following_id)
        .where(UserFollow.follower_id == current_user.id)
        .order_by(UserFollow.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(q)).all()
    return {
        "data": [
            {"username": r.username, "followed_at": r.created_at.isoformat()}
            for r in rows
        ]
    }


@router.get("/feed/following")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def following_bets_feed(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    limit: int = Query(20, ge=1, le=50),
):
    """Recent bets from followed users with public profiles."""
    following_ids = (
        await db.execute(
            select(UserFollow.following_id).where(UserFollow.follower_id == current_user.id)
        )
    ).scalars().all()
    if not following_ids:
        return {"data": []}

    q = (
        select(
            Bet.id,
            Bet.fixture_id,
            Bet.predicted_home_score,
            Bet.predicted_away_score,
            Bet.created_at,
            User.username,
            Fixture.home_team,
            Fixture.away_team,
            Fixture.match_date,
        )
        .join(User, Bet.user_id == User.id)
        .join(Fixture, Bet.fixture_id == Fixture.id)
        .where(
            Bet.user_id.in_(following_ids),
            User.bets_profile_visibility == "public",
        )
        .order_by(Bet.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(q)).all()
    return {
        "data": [
            {
                "bet_id": str(r.id),
                "fixture_id": str(r.fixture_id),
                "username": r.username,
                "predicted_home_score": r.predicted_home_score,
                "predicted_away_score": r.predicted_away_score,
                "home_team": r.home_team,
                "away_team": r.away_team,
                "match_date": r.match_date.isoformat(),
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
    }


@router.get("/fixtures/{fixture_id}/comments")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_fixture_comments(
    request: Request,
    fixture_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
    limit: int = Query(50, ge=1, le=100),
):
    fixture = await db.get(Fixture, fixture_id)
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")

    q = (
        select(
            FixtureComment.id,
            FixtureComment.body,
            FixtureComment.created_at,
            FixtureComment.user_id,
            User.username,
        )
        .join(User, FixtureComment.user_id == User.id)
        .where(
            FixtureComment.fixture_id == fixture_id,
            FixtureComment.is_hidden == False,  # noqa: E712
        )
        .order_by(FixtureComment.created_at.asc())
        .limit(limit)
    )
    rows = (await db.execute(q)).all()
    return {
        "data": [
            {
                "id": str(r.id),
                "body": r.body,
                "username": r.username,
                "user_id": str(r.user_id),
                "is_mine": r.user_id == current_user.id,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
    }


@router.post("/fixtures/{fixture_id}/comments", status_code=201)
@limiter.limit("30/minute")
async def create_fixture_comment(
    request: Request,
    fixture_id: uuid.UUID,
    body: CommentIn,
    current_user: CurrentUser,
    db: DBSession,
):
    fixture = await db.get(Fixture, fixture_id)
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
    if fixture.status == "cancelled":
        raise HTTPException(status_code=400, detail="Comments disabled for this fixture")

    text = body.body.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty comment")

    c = FixtureComment(fixture_id=fixture_id, user_id=current_user.id, body=text)
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return {
        "id": str(c.id),
        "body": c.body,
        "username": current_user.username,
        "user_id": str(current_user.id),
        "is_mine": True,
        "created_at": c.created_at.isoformat(),
    }


@router.delete("/fixtures/{fixture_id}/comments/{comment_id}", status_code=200)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def delete_fixture_comment(
    request: Request,
    fixture_id: uuid.UUID,
    comment_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    c = await db.get(FixtureComment, comment_id)
    if not c or c.fixture_id != fixture_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    if c.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.delete(c)
    await db.commit()
    return {"ok": True}


@router.get("/fixtures/{fixture_id}/reactions")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_fixture_reactions(
    request: Request,
    fixture_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    fixture = await db.get(Fixture, fixture_id)
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")

    counts_q = (
        select(FixtureReaction.reaction_type, func.count())
        .where(FixtureReaction.fixture_id == fixture_id)
        .group_by(FixtureReaction.reaction_type)
    )
    counts = {row[0]: int(row[1]) for row in (await db.execute(counts_q)).all()}

    mine_q = await db.execute(
        select(FixtureReaction.reaction_type).where(
            FixtureReaction.fixture_id == fixture_id,
            FixtureReaction.user_id == current_user.id,
        )
    )
    mine = mine_q.scalar_one_or_none()

    return {
        "counts": {t: counts.get(t, 0) for t in REACTION_TYPES},
        "my_reaction": mine,
    }


@router.put("/fixtures/{fixture_id}/reactions")
@limiter.limit("60/minute")
async def set_fixture_reaction(
    request: Request,
    fixture_id: uuid.UUID,
    body: ReactionIn,
    current_user: CurrentUser,
    db: DBSession,
):
    if body.reaction_type not in REACTION_TYPES:
        raise HTTPException(status_code=400, detail="Invalid reaction")
    fixture = await db.get(Fixture, fixture_id)
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")

    existing = (
        await db.execute(
            select(FixtureReaction).where(
                FixtureReaction.fixture_id == fixture_id,
                FixtureReaction.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()

    if existing:
        existing.reaction_type = body.reaction_type
    else:
        db.add(
            FixtureReaction(
                fixture_id=fixture_id,
                user_id=current_user.id,
                reaction_type=body.reaction_type,
            )
        )
    await db.commit()
    return {"ok": True, "reaction_type": body.reaction_type}


@router.delete("/fixtures/{fixture_id}/reactions", status_code=200)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def clear_fixture_reaction(
    request: Request,
    fixture_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    await db.execute(
        delete(FixtureReaction).where(
            FixtureReaction.fixture_id == fixture_id,
            FixtureReaction.user_id == current_user.id,
        )
    )
    await db.commit()
    return {"ok": True}


@router.patch("/admin/comments/{comment_id}/hide")
@limiter.limit("30/minute")
async def admin_hide_comment(
    request: Request,
    comment_id: uuid.UUID,
    admin: CurrentAdmin,
    db: DBSession,
    hidden: bool = Query(True),
):
    c = await db.get(FixtureComment, comment_id)
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    c.is_hidden = hidden
    await db.commit()
    return {"ok": True, "is_hidden": c.is_hidden}
