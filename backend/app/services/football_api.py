"""
Football API service — consumes API-Football (RapidAPI).
OWASP A10: SSRF protection via host whitelist.
Uses httpx async client with Redis caching and exponential retry.
"""
import json
import asyncio
from datetime import datetime, timezone
from typing import Any, Optional
import httpx
import structlog
import redis.asyncio as aioredis

from app.core.config import settings

logger = structlog.get_logger(__name__)

LIVE_CACHE_TTL = 300        # 5 minutes for live fixtures
SCHEDULED_CACHE_TTL = 3600  # 1 hour for scheduled fixtures


def _validate_api_host(host: str) -> bool:
    """OWASP A10: SSRF — only allow whitelisted hosts."""
    return host in settings.ALLOWED_EXTERNAL_HOSTS


class FootballAPIService:
    def __init__(self, redis_client: aioredis.Redis):
        self.redis = redis_client
        self.base_url = settings.FOOTBALL_API_BASE_URL
        self.headers = {
            "X-RapidAPI-Key": settings.FOOTBALL_API_KEY,
            "X-RapidAPI-Host": settings.FOOTBALL_API_HOST,
        }
        # A10: Validate host before any request
        if not _validate_api_host(settings.FOOTBALL_API_HOST):
            raise ValueError(f"API host {settings.FOOTBALL_API_HOST} is not in the whitelist")

    async def _get_cached(self, cache_key: str) -> Optional[dict]:
        cached = await self.redis.get(cache_key)
        if cached:
            return json.loads(cached)
        return None

    async def _set_cached(self, cache_key: str, data: dict, ttl: int) -> None:
        await self.redis.setex(cache_key, ttl, json.dumps(data, default=str))

    async def _request_with_retry(self, endpoint: str, params: dict, max_retries: int = 3) -> dict:
        """HTTP GET with exponential backoff retry."""
        url = f"{self.base_url}/{endpoint}"
        delay = 1.0
        last_exc: Exception | None = None

        async with httpx.AsyncClient(timeout=30.0) as client:
            for attempt in range(max_retries):
                try:
                    response = await client.get(url, headers=self.headers, params=params)
                    response.raise_for_status()
                    return response.json()
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429:
                        logger.warning("rate_limited_by_api", attempt=attempt, delay=delay)
                        await asyncio.sleep(delay)
                        delay *= 2
                        last_exc = e
                    else:
                        raise
                except httpx.RequestError as e:
                    logger.error("http_request_error", error=str(e), attempt=attempt)
                    await asyncio.sleep(delay)
                    delay *= 2
                    last_exc = e

        raise last_exc or RuntimeError("Max retries exceeded")

    async def fetch_fixtures_by_league(self, league_id: int, season: int) -> list[dict]:
        cache_key = f"fixtures:league:{league_id}:season:{season}"
        cached = await self._get_cached(cache_key)
        if cached:
            return cached

        data = await self._request_with_retry("fixtures", {"league": league_id, "season": season})
        fixtures = data.get("response", [])
        await self._set_cached(cache_key, fixtures, SCHEDULED_CACHE_TTL)
        return fixtures

    async def fetch_live_fixtures(self) -> list[dict]:
        cache_key = "fixtures:live"
        cached = await self._get_cached(cache_key)
        if cached:
            return cached

        data = await self._request_with_retry("fixtures", {"live": "all"})
        fixtures = data.get("response", [])
        await self._set_cached(cache_key, fixtures, LIVE_CACHE_TTL)
        return fixtures

    async def fetch_fixture_by_id(self, external_id: int) -> Optional[dict]:
        cache_key = f"fixture:{external_id}"
        cached = await self._get_cached(cache_key)
        if cached:
            return cached

        data = await self._request_with_retry("fixtures", {"id": external_id})
        fixtures = data.get("response", [])
        if fixtures:
            fixture = fixtures[0]
            await self._set_cached(cache_key, fixture, LIVE_CACHE_TTL)
            return fixture
        return None

    @staticmethod
    def parse_fixture(raw: dict) -> dict:
        """Normalize raw API-Football fixture to our DB format."""
        fixture = raw.get("fixture", {})
        teams = raw.get("teams", {})
        goals = raw.get("goals", {})
        league = raw.get("league", {})

        status_map = {
            "NS": "scheduled",
            "1H": "live", "HT": "live", "2H": "live", "ET": "live",
            "P": "live", "LIVE": "live",
            "FT": "finished", "AET": "finished", "PEN": "finished",
            "CANC": "cancelled", "ABD": "cancelled",
        }
        api_status = fixture.get("status", {}).get("short", "NS")

        return {
            "external_id": fixture.get("id"),
            "home_team": teams.get("home", {}).get("name", ""),
            "away_team": teams.get("away", {}).get("name", ""),
            "home_logo_url": teams.get("home", {}).get("logo"),
            "away_logo_url": teams.get("away", {}).get("logo"),
            "league_name": league.get("name", ""),
            "league_id": league.get("id"),
            "league_logo_url": league.get("logo"),
            "match_date": fixture.get("date"),  # ISO string with tz
            "status": status_map.get(api_status, "scheduled"),
            "home_score": goals.get("home"),
            "away_score": goals.get("away"),
            "round": league.get("round"),
            "season": league.get("season"),
        }
