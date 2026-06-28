"""Orchestrator: poll Google for live fixtures and apply automation."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import redis.asyncio as aioredis
import structlog
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.fixture import Fixture
from app.models.live_sync import FixtureSyncLog
from app.services.fixture_automation_service import (
    auto_settle_fixture,
    auto_start_live,
    auto_update_live_score,
)
from app.services.google_sports_scraper import fetch_google_match
from app.services.live_sync_settings_service import get_live_sync_settings
from app.services.notification_service import notify_admins

logger = structlog.get_logger(__name__)

LOCK_PREFIX = "fixture_sync:lock:"
LOG_RETENTION_PER_FIXTURE = 200


def apply_manual_score_control(
    fixture: Fixture,
    home_score: int,
    away_score: int,
    *,
    scraped_status: str | None = None,
) -> None:
    """Prevent Google live sync from overwriting an admin-entered score."""
    fixture.sync_mode = "manual"
    fixture.consecutive_sync_failures = 0
    fixture.sync_confirm_streak = 0
    fixture.last_scraped_home = home_score
    fixture.last_scraped_away = away_score
    if scraped_status is not None:
        fixture.last_scraped_status = scraped_status
    elif fixture.status == "finished":
        fixture.last_scraped_status = "finished"
    elif fixture.status == "live":
        fixture.last_scraped_status = "live"


def _effective_poll_interval(base_seconds: int, consecutive_failures: int) -> int:
    if consecutive_failures >= 2:
        return min(base_seconds * (2 ** min(consecutive_failures - 1, 3)), 60)
    return base_seconds


def _sync_window_end(fixture: Fixture) -> datetime:
    kickoff = fixture.match_date
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)
    return kickoff + timedelta(hours=3)


def _is_in_sync_window(fixture: Fixture, pre_kickoff_minutes: int, now: datetime) -> bool:
    kickoff = fixture.match_date
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)
    start = kickoff - timedelta(minutes=pre_kickoff_minutes)
    end = _sync_window_end(fixture)
    return start <= now <= end and fixture.status not in ("finished", "cancelled")


def _reading_key(scraped) -> tuple:
    return (scraped.home_score, scraped.away_score, scraped.status)


async def _acquire_lock(redis: aioredis.Redis, fixture_id: uuid.UUID, ttl: int = 30) -> bool:
    key = f"{LOCK_PREFIX}{fixture_id}"
    ok = await redis.set(key, "1", nx=True, ex=ttl)
    return bool(ok)


async def _release_lock(redis: aioredis.Redis, fixture_id: uuid.UUID) -> None:
    await redis.delete(f"{LOCK_PREFIX}{fixture_id}")


async def _purge_old_logs(db: AsyncSession, fixture_id: uuid.UUID) -> None:
    subq = (
        select(FixtureSyncLog.id)
        .where(FixtureSyncLog.fixture_id == fixture_id)
        .order_by(FixtureSyncLog.polled_at.desc())
        .offset(LOG_RETENTION_PER_FIXTURE)
    )
    old_ids = (await db.execute(subq)).scalars().all()
    if old_ids:
        await db.execute(delete(FixtureSyncLog).where(FixtureSyncLog.id.in_(old_ids)))


async def _write_sync_log(
    db: AsyncSession,
    fixture: Fixture,
    *,
    success: bool,
    search_url: str | None,
    google_match_sie: str | None,
    parsed_home: int | None,
    parsed_away: int | None,
    parsed_status: str | None,
    parsed_minute: int | None,
    raw_payload: dict | None,
    error_message: str | None,
    action_taken: str,
    response_ms: int | None,
) -> None:
    log = FixtureSyncLog(
        fixture_id=fixture.id,
        polled_at=datetime.now(timezone.utc),
        success=success,
        search_url=search_url,
        google_match_sie=google_match_sie,
        parsed_home=parsed_home,
        parsed_away=parsed_away,
        parsed_status=parsed_status,
        parsed_minute=parsed_minute,
        raw_payload=raw_payload,
        error_message=error_message,
        action_taken=action_taken,
        response_ms=response_ms,
    )
    db.add(log)
    fixture.last_sync_at = log.polled_at
    await _purge_old_logs(db, fixture.id)


async def _notify_sync_failed(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    fixture: Fixture,
    settings_row,
) -> None:
    title = f"Sync fallido: {fixture.home_team} vs {fixture.away_team}"
    body = (
        f"El scraping de Google falló {fixture.consecutive_sync_failures} veces. "
        f"Ingresa el resultado manualmente. Considera subir el intervalo "
        f"(actual: {settings_row.poll_interval_seconds}s)."
    )
    await notify_admins(
        db,
        redis,
        type="fixture_sync_failed_admin",
        title=title,
        body=body,
        payload={
            "fixture_id": str(fixture.id),
            "home_team": fixture.home_team,
            "away_team": fixture.away_team,
            "consecutive_failures": fixture.consecutive_sync_failures,
            "poll_interval_seconds": settings_row.poll_interval_seconds,
        },
    )


async def _notify_sync_ambiguous(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    fixture: Fixture,
) -> None:
    await notify_admins(
        db,
        redis,
        type="fixture_sync_ambiguous_admin",
        title=f"Sync ambiguo: {fixture.home_team} vs {fixture.away_team}",
        body="Google no confirmó los equipos del partido. Revisa manualmente.",
        payload={
            "fixture_id": str(fixture.id),
            "home_team": fixture.home_team,
            "away_team": fixture.away_team,
        },
    )


async def poll_fixture_sync(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    fixture: Fixture,
    settings_row,
) -> None:
    if fixture.sync_mode != "auto":
        await _write_sync_log(
            db,
            fixture,
            success=False,
            search_url=None,
            google_match_sie=fixture.google_match_sie,
            parsed_home=None,
            parsed_away=None,
            parsed_status=None,
            parsed_minute=None,
            raw_payload=None,
            error_message="sync_mode_not_auto",
            action_taken="skipped_manual",
            response_ms=None,
        )
        return

    use_playwright = getattr(settings, "GOOGLE_SYNC_USE_PLAYWRIGHT", False)
    scraped, response_ms = await fetch_google_match(
        fixture.home_team,
        fixture.away_team,
        google_match_sie=fixture.google_match_sie,
        use_playwright=use_playwright,
    )

    success = scraped.error is None and not scraped.ambiguous and scraped.status != "unknown"
    action_taken = "none"

    if scraped.google_match_sie and not fixture.google_match_sie:
        fixture.google_match_sie = scraped.google_match_sie

    if scraped.ambiguous:
        fixture.consecutive_sync_failures += 1
        await _notify_sync_ambiguous(db, redis, fixture)
        await _write_sync_log(
            db,
            fixture,
            success=False,
            search_url=scraped.search_url,
            google_match_sie=scraped.google_match_sie,
            parsed_home=scraped.home_score,
            parsed_away=scraped.away_score,
            parsed_status=scraped.status,
            parsed_minute=scraped.minute,
            raw_payload=scraped.raw,
            error_message=scraped.error or "ambiguous",
            action_taken="none",
            response_ms=response_ms,
        )
        return

    if not success:
        fixture.consecutive_sync_failures += 1
        if fixture.consecutive_sync_failures >= settings_row.failure_threshold:
            fixture.sync_mode = "failed"
            await _notify_sync_failed(db, redis, fixture, settings_row)
        await _write_sync_log(
            db,
            fixture,
            success=False,
            search_url=scraped.search_url,
            google_match_sie=scraped.google_match_sie,
            parsed_home=scraped.home_score,
            parsed_away=scraped.away_score,
            parsed_status=scraped.status,
            parsed_minute=scraped.minute,
            raw_payload=scraped.raw,
            error_message=scraped.error or "parse_failed",
            action_taken="none",
            response_ms=response_ms,
        )
        return

    fixture.consecutive_sync_failures = 0
    reading = _reading_key(scraped)
    prev_reading = (
        fixture.last_scraped_home,
        fixture.last_scraped_away,
        fixture.last_scraped_status,
    )
    if reading == prev_reading:
        fixture.sync_confirm_streak += 1
    else:
        fixture.sync_confirm_streak = 1
    fixture.last_scraped_home = scraped.home_score
    fixture.last_scraped_away = scraped.away_score
    fixture.last_scraped_status = scraped.status

    confirmed = fixture.sync_confirm_streak >= settings_row.confirm_reads_required
    now = datetime.now(timezone.utc)
    kickoff = fixture.match_date
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)

    if confirmed and fixture.status == "scheduled" and kickoff <= now:
        if scraped.status in ("live", "finished") or (
            scraped.home_score is not None
            and (scraped.home_score > 0 or (scraped.away_score or 0) > 0 or scraped.minute)
        ):
            await auto_start_live(db, redis, fixture)
            action_taken = "started_live"

    if (
        confirmed
        and fixture.status == "live"
        and scraped.home_score is not None
        and scraped.away_score is not None
    ):
        db_home = fixture.home_score if fixture.home_score is not None else 0
        db_away = fixture.away_score if fixture.away_score is not None else 0
        if scraped.home_score != db_home or scraped.away_score != db_away:
            await auto_update_live_score(
                db,
                redis,
                fixture,
                home_score=scraped.home_score,
                away_score=scraped.away_score,
            )
            action_taken = "score_updated"

    if (
        confirmed
        and scraped.status == "finished"
        and scraped.home_score is not None
        and scraped.away_score is not None
        and fixture.status != "finished"
    ):
        await auto_settle_fixture(
            db,
            redis,
            fixture,
            home_score=scraped.home_score,
            away_score=scraped.away_score,
        )
        action_taken = "settled"
        fixture.sync_mode = "auto"

    await _write_sync_log(
        db,
        fixture,
        success=True,
        search_url=scraped.search_url,
        google_match_sie=scraped.google_match_sie or fixture.google_match_sie,
        parsed_home=scraped.home_score,
        parsed_away=scraped.away_score,
        parsed_status=scraped.status,
        parsed_minute=scraped.minute,
        raw_payload=scraped.raw,
        error_message=None,
        action_taken=action_taken,
        response_ms=response_ms,
    )


async def run_live_sync_tick(db: AsyncSession, redis: aioredis.Redis | None) -> int:
    """One orchestrator tick. Returns number of fixtures polled."""
    settings_row = await get_live_sync_settings(db, redis)
    if not settings_row.sync_enabled_globally:
        return 0

    now = datetime.now(timezone.utc)
    pre_min = settings_row.pre_kickoff_minutes
    res = await db.execute(
        select(Fixture).where(
            Fixture.sync_mode == "auto",
            Fixture.status.not_in(("finished", "cancelled")),
        )
    )
    candidates = [f for f in res.scalars().all() if _is_in_sync_window(f, pre_min, now)]

    polled = 0
    max_concurrent = settings_row.max_concurrent_polls
    for fixture in candidates[: max_concurrent * 2]:
        if polled >= max_concurrent:
            break
        interval = _effective_poll_interval(
            settings_row.poll_interval_seconds,
            fixture.consecutive_sync_failures,
        )
        if fixture.last_sync_at:
            last = fixture.last_sync_at
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if (now - last).total_seconds() < interval:
                continue

        if redis is None:
            await poll_fixture_sync(db, redis, fixture, settings_row)
            polled += 1
            continue

        if not await _acquire_lock(redis, fixture.id):
            continue
        try:
            await poll_fixture_sync(db, redis, fixture, settings_row)
            polled += 1
        finally:
            await _release_lock(redis, fixture.id)

    return polled


async def get_live_sync_status_summary(db: AsyncSession) -> dict:
    settings_row = await get_live_sync_settings(db, redis=None)
    now = datetime.now(timezone.utc)
    pre_min = settings_row.pre_kickoff_minutes

    res = await db.execute(select(Fixture))
    all_fixtures = res.scalars().all()
    in_window = [f for f in all_fixtures if _is_in_sync_window(f, pre_min, now) and f.sync_mode == "auto"]
    failed = [f for f in all_fixtures if f.sync_mode == "failed"]
    manual = [f for f in all_fixtures if f.sync_mode == "manual" and _is_in_sync_window(f, pre_min, now)]

    est_rpm = 0
    if in_window and settings_row.poll_interval_seconds > 0:
        est_rpm = int(len(in_window) * 60 / settings_row.poll_interval_seconds)

    return {
        "settings": {
            "poll_interval_seconds": settings_row.poll_interval_seconds,
            "pre_kickoff_minutes": settings_row.pre_kickoff_minutes,
            "max_concurrent_polls": settings_row.max_concurrent_polls,
            "failure_threshold": settings_row.failure_threshold,
            "confirm_reads_required": settings_row.confirm_reads_required,
            "sync_enabled_globally": settings_row.sync_enabled_globally,
        },
        "active_sync_count": len(in_window),
        "failed_sync_count": len(failed),
        "manual_sync_count": len(manual),
        "estimated_requests_per_minute": est_rpm,
    }


async def list_sync_fixtures(db: AsyncSession, limit: int = 50) -> list[dict]:
    settings_row = await get_live_sync_settings(db, redis=None)
    now = datetime.now(timezone.utc)
    pre_min = settings_row.pre_kickoff_minutes

    res = await db.execute(
        select(Fixture)
        .where(Fixture.status.not_in(("cancelled",)))
        .order_by(Fixture.match_date.asc())
        .limit(limit * 3)
    )
    rows = []
    for f in res.scalars().all():
        in_window = _is_in_sync_window(f, pre_min, now) or f.sync_mode == "failed"
        if not in_window and f.status == "finished":
            continue
        if f.status == "finished" and f.sync_mode == "auto":
            continue
        if not in_window:
            continue
        rows.append(
            {
                "id": str(f.id),
                "home_team": f.home_team,
                "away_team": f.away_team,
                "match_date": f.match_date.isoformat(),
                "status": f.status,
                "sync_mode": f.sync_mode,
                "home_score": f.home_score,
                "away_score": f.away_score,
                "last_scraped_home": f.last_scraped_home,
                "last_scraped_away": f.last_scraped_away,
                "last_scraped_status": f.last_scraped_status,
                "consecutive_sync_failures": f.consecutive_sync_failures,
                "sync_confirm_streak": f.sync_confirm_streak,
                "last_sync_at": f.last_sync_at.isoformat() if f.last_sync_at else None,
                "google_match_sie": f.google_match_sie,
                "competition_id": str(f.competition_id) if f.competition_id else None,
            }
        )
        if len(rows) >= limit:
            break
    return rows


async def get_fixture_sync_logs(
    db: AsyncSession,
    fixture_id: uuid.UUID,
    *,
    page: int = 1,
    limit: int = 50,
) -> dict:
    total = (
        await db.execute(
            select(func.count()).select_from(FixtureSyncLog).where(FixtureSyncLog.fixture_id == fixture_id)
        )
    ).scalar() or 0
    offset = (page - 1) * limit
    res = await db.execute(
        select(FixtureSyncLog)
        .where(FixtureSyncLog.fixture_id == fixture_id)
        .order_by(FixtureSyncLog.polled_at.desc())
        .offset(offset)
        .limit(limit)
    )
    logs = []
    for row in res.scalars().all():
        logs.append(
            {
                "id": str(row.id),
                "polled_at": row.polled_at.isoformat(),
                "success": row.success,
                "search_url": row.search_url,
                "google_match_sie": row.google_match_sie,
                "parsed_home": row.parsed_home,
                "parsed_away": row.parsed_away,
                "parsed_status": row.parsed_status,
                "parsed_minute": row.parsed_minute,
                "raw_payload": row.raw_payload,
                "error_message": row.error_message,
                "action_taken": row.action_taken,
                "response_ms": row.response_ms,
            }
        )
    return {
        "data": logs,
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": max(1, -(-total // limit)),
        },
    }


async def retry_fixture_sync(db: AsyncSession, fixture: Fixture) -> None:
    fixture.sync_mode = "auto"
    fixture.consecutive_sync_failures = 0
    fixture.sync_confirm_streak = 0
    fixture.last_sync_at = None
    await db.flush()
