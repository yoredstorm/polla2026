"""Competition promotional marquee — read/update with mandatory audit logging."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.competition_marquee import CompetitionMarquee
from app.models.site_marquee import MARQUEE_SINGLETON_ID, SiteMarquee
from app.models.user import User
from app.services.audit import log_action

MARQUEE_MAX_LENGTH = 280
_TAG_PATTERN = re.compile(r"<[^>]+>")


class MarqueeValidationError(ValueError):
    """Invalid marquee message."""


class _MarqueeRow(Protocol):
    message: str
    is_enabled: bool
    updated_at: datetime | None
    updated_by: User | None


def normalize_marquee_message(raw: str) -> str:
    """Plain text only: strip HTML tags, collapse whitespace, enforce max length."""
    text = _TAG_PATTERN.sub("", raw or "")
    text = " ".join(text.split())
    if len(text) > MARQUEE_MAX_LENGTH:
        raise MarqueeValidationError("MARQUEE_MESSAGE_TOO_LONG")
    if "<" in text or ">" in text:
        raise MarqueeValidationError("MARQUEE_INVALID_CHARACTERS")
    return text


def public_marquee_payload(marquee: _MarqueeRow) -> dict[str, bool | str]:
    message = (marquee.message or "").strip()
    enabled = bool(marquee.is_enabled and message)
    return {
        "enabled": enabled,
        "message": message if enabled else "",
    }


def admin_marquee_payload(marquee: _MarqueeRow) -> dict:
    username = marquee.updated_by.username if marquee.updated_by else None
    return {
        "enabled": marquee.is_enabled,
        "message": marquee.message or "",
        "updated_at": marquee.updated_at.isoformat() if marquee.updated_at else None,
        "updated_by_username": username,
    }


async def get_competition_marquee(db: AsyncSession, competition_id: uuid.UUID) -> CompetitionMarquee:
    result = await db.execute(
        select(CompetitionMarquee)
        .where(CompetitionMarquee.competition_id == competition_id)
        .options(selectinload(CompetitionMarquee.updated_by))
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = CompetitionMarquee(competition_id=competition_id, message="", is_enabled=False)
        db.add(row)
        await db.flush()
        await db.refresh(row, attribute_names=["updated_by"])
    return row


async def update_competition_marquee(
    db: AsyncSession,
    *,
    competition_id: uuid.UUID,
    competition_slug: str,
    admin: User,
    message: str,
    is_enabled: bool,
    ip: str | None,
) -> CompetitionMarquee:
    marquee = await get_competition_marquee(db, competition_id)
    previous_message = marquee.message or ""
    previous_enabled = marquee.is_enabled

    normalized = normalize_marquee_message(message)

    marquee.message = normalized
    marquee.is_enabled = is_enabled
    marquee.updated_by_id = admin.id
    marquee.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(marquee, attribute_names=["updated_by"])

    await log_action(
        db,
        user_id=admin.id,
        action="admin_marquee_update",
        detail={
            "enabled": is_enabled,
            "message": normalized,
            "previous_enabled": previous_enabled,
            "previous_message": previous_message,
            "competition_slug": competition_slug,
        },
        ip=ip,
        competition_id=competition_id,
    )
    return marquee


# Legacy singleton — kept for migration compatibility; public site endpoint is deprecated.
async def get_marquee(db: AsyncSession) -> SiteMarquee:
    result = await db.execute(
        select(SiteMarquee)
        .where(SiteMarquee.id == MARQUEE_SINGLETON_ID)
        .options(selectinload(SiteMarquee.updated_by))
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = SiteMarquee(id=MARQUEE_SINGLETON_ID, message="", is_enabled=False)
        db.add(row)
        await db.flush()
        await db.refresh(row)
    return row
