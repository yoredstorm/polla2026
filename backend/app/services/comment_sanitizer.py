"""Sanitize and parse @mentions in fixture comments."""
import re
import uuid

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.group import Group, GroupMember
from app.models.user import User
from app.services.avatar_service import avatar_display_path

MENTION_PATTERN = re.compile(r"@([a-zA-Z0-9_]{3,50})")
HTML_TAG_PATTERN = re.compile(r"<[^>]+>")
CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
MAX_MENTIONS = 5
MAX_BODY_LEN = 500


def sanitize_comment_body(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        raise ValueError("EMPTY_COMMENT")
    text = CONTROL_CHARS.sub("", text)
    text = HTML_TAG_PATTERN.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        raise ValueError("EMPTY_COMMENT")
    if len(text) > MAX_BODY_LEN:
        text = text[:MAX_BODY_LEN]
    return text


def extract_mention_usernames(text: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for m in MENTION_PATTERN.finditer(text):
        u = m.group(1).lower()
        if u not in seen:
            seen.add(u)
            out.append(m.group(1))
        if len(out) >= MAX_MENTIONS:
            break
    return out


def body_preview(text: str, limit: int = 120) -> str:
    t = text.replace("\n", " ").strip()
    return t if len(t) <= limit else t[: limit - 1] + "…"


async def _active_polla_id(db: AsyncSession) -> uuid.UUID | None:
    group_res = await db.execute(
        select(Group.id).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)  # noqa: E712
    )
    return group_res.scalar_one_or_none()


async def search_polla_mention_users(
    db: AsyncSession,
    *,
    author_id: uuid.UUID,
    q: str = "",
    limit: int = 8,
) -> list[dict[str, str | None]]:
    """Members of the active polla for @mention autocomplete (excludes author)."""
    group_id = await _active_polla_id(db)
    if not group_id:
        return []

    stmt = (
        select(User.username, User.avatar_preset, User.avatar_url)
        .join(GroupMember, GroupMember.user_id == User.id)
        .where(
            GroupMember.group_id == group_id,
            User.is_active == True,  # noqa: E712
            User.id != author_id,
        )
        .order_by(User.username.asc())
        .limit(min(limit, 15))
    )
    term = (q or "").strip()
    if term:
        stmt = stmt.where(User.username.ilike(f"%{term}%"))

    rows = (await db.execute(stmt)).all()
    return [
        {
            "username": username,
            "avatar_display": avatar_display_path(preset, url),
        }
        for username, preset, url in rows
    ]


async def resolve_polla_mentions(
    db: AsyncSession,
    *,
    author_id: uuid.UUID,
    usernames: list[str],
) -> list[User]:
    if not usernames:
        return []
    group_id = await _active_polla_id(db)
    if not group_id:
        return []

    resolved: list[User] = []
    for name in usernames[:MAX_MENTIONS]:
        q = (
            select(User)
            .join(GroupMember, GroupMember.user_id == User.id)
            .where(
                GroupMember.group_id == group_id,
                User.username.ilike(name),
                User.is_active == True,  # noqa: E712
                User.id != author_id,
            )
        )
        user = (await db.execute(q)).scalar_one_or_none()
        if user and user not in resolved:
            resolved.append(user)
    return resolved
