"""Shared helpers for creating comments with mentions and notifications."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.models.fixture import Fixture
from app.models.social import FixtureComment, FixtureCommentMention
from app.models.user import User
from app.services.audit import log_action
from app.services.comment_sanitizer import (
    body_preview,
    extract_mention_usernames,
    resolve_polla_mentions,
    sanitize_comment_body,
)
from app.services.notification_service import build_comment_mention, create_notification


async def create_comment_with_side_effects(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    *,
    fixture: Fixture,
    author: User,
    raw_body: str,
    ip: str | None,
) -> tuple[FixtureComment, list[str]]:
    text = sanitize_comment_body(raw_body)
    mention_users = await resolve_polla_mentions(
        db, author_id=author.id, usernames=extract_mention_usernames(text)
    )

    c = FixtureComment(fixture_id=fixture.id, user_id=author.id, body=text)
    db.add(c)
    await db.flush()

    mention_names: list[str] = []
    for mu in mention_users:
        db.add(FixtureCommentMention(comment_id=c.id, mentioned_user_id=mu.id))
        mention_names.append(mu.username)

    preview = body_preview(text)
    await log_action(
        db,
        user_id=author.id,
        action="comment_created",
        detail={
            "fixture_id": str(fixture.id),
            "comment_id": str(c.id),
            "body_preview": preview,
            "mentioned_usernames": mention_names,
            "mentioned_user_ids": [str(u.id) for u in mention_users],
        },
        ip=ip,
    )

    for mu in mention_users:
        title, body, payload = build_comment_mention(
            author_username=author.username,
            fixture_id=str(fixture.id),
            comment_id=str(c.id),
            home_team=fixture.home_team,
            away_team=fixture.away_team,
            body_preview=preview,
        )
        await create_notification(
            db,
            redis,
            user_id=mu.id,
            type="comment_mention",
            title=title,
            body=body,
            payload=payload,
        )

    return c, mention_names
