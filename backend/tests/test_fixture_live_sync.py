"""Tests for Google live sync parser and orchestrator."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from unittest.mock import AsyncMock
from sqlalchemy import select

from app.models.fixture import Fixture
from app.models.live_sync import FixtureSyncLog, LiveSyncSettings
from app.services.fixture_live_sync_service import poll_fixture_sync, run_live_sync_tick
from app.services.google_sports_scraper import parse_google_sports_html
from app.services.live_sync_settings_service import get_live_sync_settings

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "google"


def _load_html(name: str) -> str:
    return (FIXTURES_DIR / name).read_text(encoding="utf-8")


def test_parse_finished_match():
    html = _load_html("colombia_portugal_finished.html")
    result = parse_google_sports_html(
        html,
        home_team="Colombia",
        away_team="Portugal",
        search_url="https://www.google.com/search?q=colombia+vs+portugal",
    )
    assert result.home_score == 2
    assert result.away_score == 1
    assert result.status == "finished"
    assert result.google_match_sie is not None
    assert "/g/11ms2k2435" in result.google_match_sie


def test_parse_live_match():
    html = _load_html("colombia_portugal_live.html")
    result = parse_google_sports_html(
        html,
        home_team="Colombia",
        away_team="Portugal",
        search_url="https://example.com",
    )
    assert result.home_score == 1
    assert result.away_score == 0
    assert result.status == "live"
    assert result.minute == 67


@pytest.mark.asyncio
async def test_poll_fixture_sync_logs_success(db_session, monkeypatch):
    settings = LiveSyncSettings(id=1)
    db_session.add(settings)
    now = datetime.now(timezone.utc)
    fixture = Fixture(
        id=uuid4(),
        external_id=9001,
        home_team="Colombia",
        away_team="Portugal",
        league_name="Test",
        league_id=1,
        match_date=now - timedelta(minutes=5),
        season=2026,
        status="scheduled",
        sync_mode="auto",
    )
    db_session.add(fixture)
    await db_session.flush()

    html = _load_html("colombia_portugal_live.html")

    async def fake_fetch(*_args, **_kwargs):
        from app.services.google_sports_scraper import parse_google_sports_html

        parsed = parse_google_sports_html(
            html,
            home_team="Colombia",
            away_team="Portugal",
            search_url="https://example.com",
        )
        return parsed, 42

    monkeypatch.setattr(
        "app.services.fixture_live_sync_service.fetch_google_match",
        fake_fetch,
    )
    monkeypatch.setattr("app.services.fixture_live_sync_service.notify_admins", lambda *a, **k: None)

    settings_row = await get_live_sync_settings(db_session, redis=None)
    settings_row.confirm_reads_required = 1
    await poll_fixture_sync(db_session, None, fixture, settings_row)
    await db_session.flush()

    logs = (
        await db_session.execute(select(FixtureSyncLog).where(FixtureSyncLog.fixture_id == fixture.id))
    ).scalars().all()
    assert len(logs) == 1
    assert logs[0].success is True
    assert logs[0].parsed_home == 1
    assert fixture.status == "live"


@pytest.mark.asyncio
async def test_confirm_reads_before_settle(db_session, monkeypatch):
    settings = LiveSyncSettings(id=1, confirm_reads_required=2)
    db_session.add(settings)
    now = datetime.now(timezone.utc)
    fixture = Fixture(
        id=uuid4(),
        external_id=9002,
        home_team="Colombia",
        away_team="Portugal",
        league_name="Test",
        league_id=1,
        match_date=now - timedelta(hours=2),
        season=2026,
        status="live",
        home_score=1,
        away_score=0,
        sync_mode="auto",
    )
    db_session.add(fixture)
    await db_session.flush()

    html = _load_html("colombia_portugal_finished.html")

    async def fake_fetch(*_args, **_kwargs):
        from app.services.google_sports_scraper import parse_google_sports_html

        parsed = parse_google_sports_html(
            html,
            home_team="Colombia",
            away_team="Portugal",
            search_url="https://example.com",
        )
        return parsed, 30

    monkeypatch.setattr(
        "app.services.fixture_live_sync_service.fetch_google_match",
        fake_fetch,
    )
    monkeypatch.setattr("app.services.fixture_live_sync_service.notify_admins", lambda *a, **k: None)
    monkeypatch.setattr(
        "app.services.fixture_live_sync_service.auto_settle_fixture",
        AsyncMock(),
    )

    settings_row = await get_live_sync_settings(db_session, redis=None)
    settings_row.confirm_reads_required = 2

    await poll_fixture_sync(db_session, None, fixture, settings_row)
    assert fixture.status == "live"
    assert fixture.sync_confirm_streak == 1

    await poll_fixture_sync(db_session, None, fixture, settings_row)
    assert fixture.sync_confirm_streak == 2


@pytest.mark.asyncio
async def test_sync_failure_threshold(db_session, monkeypatch):
    settings = LiveSyncSettings(id=1, failure_threshold=3)
    db_session.add(settings)
    now = datetime.now(timezone.utc)
    fixture = Fixture(
        id=uuid4(),
        external_id=9003,
        home_team="Colombia",
        away_team="Portugal",
        league_name="Test",
        league_id=1,
        match_date=now - timedelta(minutes=5),
        season=2026,
        status="scheduled",
        sync_mode="auto",
    )
    db_session.add(fixture)
    await db_session.flush()

    from app.services.google_sports_scraper import ScrapedMatch

    async def fake_fetch(*_args, **_kwargs):
        return ScrapedMatch(
            home_score=None,
            away_score=None,
            status="unknown",
            minute=None,
            google_match_sie=None,
            search_url="https://example.com",
            error="parse_failed",
        ), 10

    notified = []

    async def fake_notify(db, redis, **kwargs):
        notified.append(kwargs.get("type"))

    monkeypatch.setattr(
        "app.services.fixture_live_sync_service.fetch_google_match",
        fake_fetch,
    )
    monkeypatch.setattr("app.services.fixture_live_sync_service.notify_admins", fake_notify)

    settings_row = await get_live_sync_settings(db_session, redis=None)
    settings_row.failure_threshold = 3

    for _ in range(3):
        await poll_fixture_sync(db_session, None, fixture, settings_row)

    assert fixture.sync_mode == "failed"
    assert "fixture_sync_failed_admin" in notified
