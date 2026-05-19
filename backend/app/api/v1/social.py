"""Social layer: follow users, fixture comments and reactions."""
import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, delete, or_

from app.api.deps import CurrentUser, CurrentAdmin, DBSession, RedisClient
from app.core.rate_limiter import limiter, GLOBAL_RATE_LIMIT
from app.models.bet import Bet
from app.models.fixture import Fixture
from app.models.social import (
    UserFollow,
    FixtureComment,
    FixtureCommentMention,
    FixtureReaction,
    REACTION_TYPES,
)
from app.models.user import User
from app.models.challenge import Challenge
from app.services.challenge_service import duel_result_for_user
from app.services.audit import log_action
from app.services.avatar_service import avatar_display_path
from app.services.comment_sanitizer import sanitize_comment_body, search_polla_mention_users
from app.services.social_comment_flow import create_comment_with_side_effects
from app.services.social_spam_guard import ensure_not_social_muted, record_comment_burst
from app.services.badge_notify_service import notify_new_badges_for_user_social

router = APIRouter(prefix="/social", tags=["Social"])

ReactionType = Literal[
    "like", "fire", "trophy", "wow", "skull", "sad", "angry", "clown", "heart",
]


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=500)


class ReactionIn(BaseModel):
    reaction_type: ReactionType


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _user_avatar_fields(user: User) -> dict:
    return {
        "avatar_preset": user.avatar_preset,
        "avatar_url": user.avatar_url,
        "avatar_display": avatar_display_path(user.avatar_preset, user.avatar_url),
    }


async def _mentions_for_comments(db: DBSession, comment_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[str]]:
    if not comment_ids:
        return {}
    res = await db.execute(
        select(FixtureCommentMention.comment_id, User.username)
        .join(User, User.id == FixtureCommentMention.mentioned_user_id)
        .where(FixtureCommentMention.comment_id.in_(comment_ids))
    )
    out: dict[uuid.UUID, list[str]] = {}
    for cid, uname in res.all():
        out.setdefault(cid, []).append(uname)
    return out


@router.get("/mention-suggestions")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def mention_suggestions(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    q: str = Query("", max_length=50),
    limit: int = Query(8, ge=1, le=15),
):
    """Polla members matching partial username for @mention autocomplete."""
    rows = await search_polla_mention_users(
        db, author_id=current_user.id, q=q, limit=limit
    )
    return {"data": rows}


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
    await log_action(
        db,
        user_id=current_user.id,
        action="social_follow",
        detail={"following_username": target.username, "following_id": str(target.id)},
        ip=_client_ip(request),
    )
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
    await log_action(
        db,
        user_id=current_user.id,
        action="social_unfollow",
        detail={"following_username": target.username, "following_id": str(target.id)},
        ip=_client_ip(request),
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


_CHALLENGE_RANK = {"settled": 4, "active": 3, "pending_accept": 2, "rejected": 1, "cancelled": 0}


async def _challenges_by_fixture_user(
    db: DBSession,
    rows: list,
) -> dict[tuple[uuid.UUID, uuid.UUID], Challenge]:
    if not rows:
        return {}
    fixture_ids = {r.fixture_id for r in rows}
    user_ids = {r.user_id for r in rows}
    res = await db.execute(
        select(Challenge).where(
            Challenge.fixture_id.in_(fixture_ids),
            or_(
                Challenge.challenger_id.in_(user_ids),
                Challenge.challenged_id.in_(user_ids),
            ),
            Challenge.status.in_(["pending_accept", "active", "settled"]),
        )
    )
    best: dict[tuple[uuid.UUID, uuid.UUID], Challenge] = {}
    for ch in res.scalars().all():
        for uid in (ch.challenger_id, ch.challenged_id):
            if uid not in user_ids:
                continue
            key = (ch.fixture_id, uid)
            prev = best.get(key)
            if prev is None or _CHALLENGE_RANK.get(ch.status, 0) > _CHALLENGE_RANK.get(prev.status, 0):
                best[key] = ch
    return best


def _challenge_feed_fields(
    ch: Challenge,
    bet_user_id: uuid.UUID,
    users_by_id: dict[uuid.UUID, User],
) -> dict:
    opponent_id = ch.challenged_id if ch.challenger_id == bet_user_id else ch.challenger_id
    opp = users_by_id.get(opponent_id)
    return {
        "challenge_id": str(ch.id),
        "challenge_status": ch.status,
        "challenge_stake": ch.stake_points,
        "challenge_opponent_username": opp.username if opp else None,
        "challenge_opponent_first_name": opp.first_name if opp else None,
        "challenge_opponent_last_name": opp.last_name if opp else None,
        "challenge_result": duel_result_for_user(ch, bet_user_id),
    }


@router.get("/feed/following")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def following_bets_feed(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    limit: int = Query(20, ge=1, le=50),
):
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
            Bet.user_id,
            Bet.predicted_home_score,
            Bet.predicted_away_score,
            Bet.created_at,
            User.username,
            User.first_name,
            User.last_name,
            User.avatar_preset,
            User.avatar_url,
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
    challenge_map = await _challenges_by_fixture_user(db, rows)

    opponent_ids: set[uuid.UUID] = set()
    for ch in challenge_map.values():
        for uid in (ch.challenger_id, ch.challenged_id):
            opponent_ids.add(uid)
    users_by_id: dict[uuid.UUID, User] = {}
    if opponent_ids:
        un_res = await db.execute(select(User).where(User.id.in_(opponent_ids)))
        users_by_id = {u.id: u for u in un_res.scalars().all()}

    out = []
    for r in rows:
        item = {
            "bet_id": str(r.id),
            "fixture_id": str(r.fixture_id),
            "username": r.username,
            "first_name": r.first_name,
            "last_name": r.last_name,
            "avatar_display": avatar_display_path(r.avatar_preset, r.avatar_url),
            "predicted_home_score": r.predicted_home_score,
            "predicted_away_score": r.predicted_away_score,
            "home_team": r.home_team,
            "away_team": r.away_team,
            "match_date": r.match_date.isoformat(),
            "created_at": r.created_at.isoformat(),
            "challenge": None,
        }
        ch = challenge_map.get((r.fixture_id, r.user_id))
        if ch:
            item["challenge"] = _challenge_feed_fields(ch, r.user_id, users_by_id)
        out.append(item)
    return {"data": out}


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
            User.first_name,
            User.last_name,
            User.avatar_preset,
            User.avatar_url,
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
    cids = [r.id for r in rows]
    mentions_map = await _mentions_for_comments(db, cids)
    return {
        "data": [
            {
                "id": str(r.id),
                "body": r.body,
                "username": r.username,
                "first_name": r.first_name,
                "last_name": r.last_name,
                "user_id": str(r.user_id),
                "is_mine": r.user_id == current_user.id,
                "created_at": r.created_at.isoformat(),
                "mentions": mentions_map.get(r.id, []),
                "avatar_display": avatar_display_path(r.avatar_preset, r.avatar_url),
            }
            for r in rows
        ]
    }


@router.post("/fixtures/{fixture_id}/comments", status_code=201)
@limiter.limit("10/minute")
async def create_fixture_comment(
    request: Request,
    fixture_id: uuid.UUID,
    body: CommentIn,
    current_user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    await db.refresh(current_user)
    ensure_not_social_muted(current_user)
    if not body.body.strip():
        raise HTTPException(status_code=400, detail="Empty comment")

    fixture = await db.get(Fixture, fixture_id)
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
    if fixture.status == "cancelled":
        raise HTTPException(status_code=400, detail="Comments disabled for this fixture")

    await record_comment_burst(db, redis, current_user, ip=_client_ip(request))

    try:
        c, mention_names = await create_comment_with_side_effects(
            db,
            redis,
            fixture=fixture,
            author=current_user,
            raw_body=body.body,
            ip=_client_ip(request),
        )
    except ValueError as e:
        if str(e) == "EMPTY_COMMENT":
            raise HTTPException(status_code=400, detail="Empty comment") from e
        raise

    await notify_new_badges_for_user_social(db, redis, current_user.id)
    await db.commit()
    await db.refresh(c)
    return {
        "id": str(c.id),
        "body": c.body,
        "username": current_user.username,
        "user_id": str(current_user.id),
        "is_mine": True,
        "created_at": c.created_at.isoformat(),
        "mentions": mention_names,
        **_user_avatar_fields(current_user),
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
    await log_action(
        db,
        user_id=current_user.id,
        action="comment_deleted",
        detail={"fixture_id": str(fixture_id), "comment_id": str(comment_id)},
        ip=_client_ip(request),
    )
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
@limiter.limit("30/minute")
async def set_fixture_reaction(
    request: Request,
    fixture_id: uuid.UUID,
    body: ReactionIn,
    current_user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
):
    await db.refresh(current_user)
    ensure_not_social_muted(current_user)

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

    previous = existing.reaction_type if existing else None
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

    await log_action(
        db,
        user_id=current_user.id,
        action="reaction_set",
        detail={
            "fixture_id": str(fixture_id),
            "reaction_type": body.reaction_type,
            "previous_type": previous,
        },
        ip=_client_ip(request),
    )
    await notify_new_badges_for_user_social(db, redis, current_user.id)
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
    ensure_not_social_muted(current_user)
    res = await db.execute(
        select(FixtureReaction).where(
            FixtureReaction.fixture_id == fixture_id,
            FixtureReaction.user_id == current_user.id,
        )
    )
    existing = res.scalar_one_or_none()
    if existing:
        await log_action(
            db,
            user_id=current_user.id,
            action="reaction_cleared",
            detail={
                "fixture_id": str(fixture_id),
                "reaction_type": existing.reaction_type,
            },
            ip=_client_ip(request),
        )
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
    await log_action(
        db,
        user_id=admin.id,
        action="comment_hidden",
        detail={
            "comment_id": str(comment_id),
            "fixture_id": str(c.fixture_id),
            "is_hidden": hidden,
        },
        ip=_client_ip(request),
    )
    await db.commit()
    return {"ok": True, "is_hidden": c.is_hidden}
