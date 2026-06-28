"""Google Sports search scraper for live match scores."""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote_plus

import httpx
import structlog

logger = structlog.get_logger(__name__)

GOOGLE_SEARCH_BASE = "https://www.google.com/search"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# Search aliases for team names stored in fixtures
TEAM_SEARCH_ALIASES: dict[str, str] = {
    "USA": "Estados Unidos",
    "South Korea": "Corea del Sur",
    "Ivory Coast": "Costa de Marfil",
    "Bosnia & Herzegovina": "Bosnia",
    "Curaçao": "Curazao",
    "Czech Republic": "República Checa",
}

SIE_FRAGMENT_RE = re.compile(r"#sie=m;([^\"'\s<>]+)", re.IGNORECASE)
SIE_INLINE_RE = re.compile(r"sie=m;(/g/[^\"'\s<>]+)", re.IGNORECASE)
SCORE_RE = re.compile(
    r"(?:data-score|aria-label=[\"'].*?)(?P<home>\d+)\s*[-–—]\s*(?P<away>\d+)",
    re.IGNORECASE,
)
SCORE_SIMPLE_RE = re.compile(
    r"(?<![\d.])(?P<home>\d+)\s*[-–—]\s*(?P<away>\d+)(?![\d.])"
)
STATUS_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("finished", re.compile(r"\b(finalizado|final|ft|full[- ]time|terminado)\b", re.I)),
    ("live", re.compile(r"\b(en vivo|live|en curso|1[º°]?\s*tiempo|2[º°]?\s*tiempo|descanso)\b", re.I)),
    ("scheduled", re.compile(r"\b(programado|scheduled|pr[oó]ximamente|vs\.?)\b", re.I)),
]
MINUTE_RE = re.compile(
    r"(?P<m>\d{1,3})\s*['\u2019]|(?:min(?:uto)?\.?\s*)(?P<m2>\d{1,3})",
    re.I,
)


@dataclass
class ScrapedMatch:
    home_score: int | None
    away_score: int | None
    status: str  # scheduled|live|finished|unknown
    minute: int | None
    google_match_sie: str | None
    search_url: str
    raw: dict[str, Any] = field(default_factory=dict)
    ambiguous: bool = False
    error: str | None = None


def team_search_name(team: str) -> str:
    return TEAM_SEARCH_ALIASES.get(team, team)


def build_search_url(home_team: str, away_team: str, *, google_match_sie: str | None = None) -> str:
    q = f"{team_search_name(home_team)} vs {team_search_name(away_team)}"
    url = f"{GOOGLE_SEARCH_BASE}?q={quote_plus(q)}&hl=es"
    if google_match_sie:
        url = f"{url}#sie=m;{google_match_sie};tl;fp;1;;;;-1"
    return url


def _normalize_team(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _teams_match(html: str, home_team: str, away_team: str) -> bool:
    norm_html = _normalize_team(html)
    home_ok = _normalize_team(home_team) in norm_html or _normalize_team(team_search_name(home_team)) in norm_html
    away_ok = _normalize_team(away_team) in norm_html or _normalize_team(team_search_name(away_team)) in norm_html
    return home_ok and away_ok


def _extract_sie(html: str) -> str | None:
    m = SIE_FRAGMENT_RE.search(html)
    if m:
        return m.group(1).split(";tl")[0].split(";ln")[0].split(";ms")[0]
    m = SIE_INLINE_RE.search(html)
    if m:
        return m.group(1)
    return None


def _extract_status(html: str) -> str:
    for name, pattern in STATUS_PATTERNS:
        if pattern.search(html):
            return name
    return "unknown"


def _extract_scores(html: str) -> tuple[int | None, int | None]:
    for pattern in (SCORE_RE, SCORE_SIMPLE_RE):
        for m in pattern.finditer(html):
            home, away = int(m.group("home")), int(m.group("away"))
            if 0 <= home <= 30 and 0 <= away <= 30:
                return home, away
    return None, None


def _extract_minute(html: str) -> int | None:
    m = MINUTE_RE.search(html)
    if m:
        val = int(m.group("m") or m.group("m2"))
        if 0 <= val <= 130:
            return val
    return None


def parse_google_sports_html(
    html: str,
    *,
    home_team: str,
    away_team: str,
    search_url: str,
) -> ScrapedMatch:
    if not html or len(html) < 100:
        return ScrapedMatch(
            home_score=None,
            away_score=None,
            status="unknown",
            minute=None,
            google_match_sie=None,
            search_url=search_url,
            error="empty_response",
        )

    if not _teams_match(html, home_team, away_team):
        return ScrapedMatch(
            home_score=None,
            away_score=None,
            status="unknown",
            minute=None,
            google_match_sie=_extract_sie(html),
            search_url=search_url,
            ambiguous=True,
            error="teams_not_found_in_page",
        )

    home_score, away_score = _extract_scores(html)
    status = _extract_status(html)
    minute = _extract_minute(html)
    sie = _extract_sie(html)

    if status == "unknown" and minute is not None:
        status = "live"
    if status == "unknown" and home_score is not None and (home_score > 0 or away_score > 0):
        status = "live"

    return ScrapedMatch(
        home_score=home_score,
        away_score=away_score,
        status=status,
        minute=minute,
        google_match_sie=sie,
        search_url=search_url,
        raw={
            "status": status,
            "home_score": home_score,
            "away_score": away_score,
            "minute": minute,
            "google_match_sie": sie,
        },
    )


async def fetch_google_match(
    home_team: str,
    away_team: str,
    *,
    google_match_sie: str | None = None,
    use_playwright: bool = False,
) -> tuple[ScrapedMatch, int]:
    """Fetch and parse Google Sports page. Returns (result, response_ms)."""
    url = build_search_url(home_team, away_team, google_match_sie=google_match_sie)
    start = time.perf_counter()

    try:
        if use_playwright:
            html = await _fetch_with_playwright(url)
        else:
            html = await _fetch_with_httpx(url)
    except Exception as exc:
        ms = int((time.perf_counter() - start) * 1000)
        result = ScrapedMatch(
            home_score=None,
            away_score=None,
            status="unknown",
            minute=None,
            google_match_sie=google_match_sie,
            search_url=url,
            error=str(exc),
        )
        return result, ms

    ms = int((time.perf_counter() - start) * 1000)
    parsed = parse_google_sports_html(
        html,
        home_team=home_team,
        away_team=away_team,
        search_url=url,
    )
    if google_match_sie and not parsed.google_match_sie:
        parsed.google_match_sie = google_match_sie
    return parsed, ms


async def _fetch_with_httpx(url: str) -> str:
    async with httpx.AsyncClient(
        timeout=20.0,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "es-ES,es;q=0.9"},
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.text


async def _fetch_with_playwright(url: str) -> str:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            page = await browser.new_page(user_agent=USER_AGENT, locale="es-ES")
            await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            await page.wait_for_timeout(1500)
            return await page.content()
        finally:
            await browser.close()
