"""
World Cup 2026 — JSON fixture loader.
Replaces the external API-Football integration.
Reads from /asset/worldcup.json and /asset/worldcup.teams_meta.json.
"""
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import structlog

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_ASSET_DIR = Path(__file__).parent.parent.parent / "asset"
_FIXTURES_FILE = _ASSET_DIR / "worldcup.json"
_TEAMS_META_FILE = _ASSET_DIR / "worldcup.teams_meta.json"

# Fixed values for the tournament
WORLDCUP_LEAGUE_ID = 1
WORLDCUP_LEAGUE_NAME = "FIFA World Cup 2026"
WORLDCUP_SEASON = 2026

# ---------------------------------------------------------------------------
# Flag URLs (ISO 3166-1 alpha-2 via flagcdn.com)
# ---------------------------------------------------------------------------
_FLAG_ISO2: dict[str, str] = {
    "Mexico": "mx",
    "South Africa": "za",
    "South Korea": "kr",
    "Czech Republic": "cz",
    "Canada": "ca",
    "Bosnia & Herzegovina": "ba",
    "Qatar": "qa",
    "Switzerland": "ch",
    "Brazil": "br",
    "Haiti": "ht",
    "Scotland": "gb-sct",
    "Morocco": "ma",
    "USA": "us",
    "Paraguay": "py",
    "Australia": "au",
    "Turkey": "tr",
    "Germany": "de",
    "Curaçao": "cw",
    "Ivory Coast": "ci",
    "Ecuador": "ec",
    "Netherlands": "nl",
    "Japan": "jp",
    "Sweden": "se",
    "Tunisia": "tn",
    "Belgium": "be",
    "Egypt": "eg",
    "Iran": "ir",
    "New Zealand": "nz",
    "Spain": "es",
    "Cape Verde": "cv",
    "Saudi Arabia": "sa",
    "Uruguay": "uy",
    "France": "fr",
    "Senegal": "sn",
    "Iraq": "iq",
    "Norway": "no",
    "Argentina": "ar",
    "Algeria": "dz",
    "Austria": "at",
    "Jordan": "jo",
    "Portugal": "pt",
    "DR Congo": "cd",
    "Uzbekistan": "uz",
    "Colombia": "co",
    "England": "gb-eng",
    "Croatia": "hr",
    "Ghana": "gh",
    "Panama": "pa",
}


def _flag_url(team_name: str) -> Optional[str]:
    iso2 = _FLAG_ISO2.get(team_name)
    if iso2:
        return f"https://flagcdn.com/w40/{iso2}.png"
    return None


# ---------------------------------------------------------------------------
# Date / time parsing
# ---------------------------------------------------------------------------
_UTC_OFFSET_RE = re.compile(r"UTC([+\-±])(\d+)")


def _parse_utc_offset(tz_str: str) -> timedelta:
    """
    Parse strings like 'UTC-6', 'UTC+1', 'UTC±0'.
    Returns a timedelta representing the offset.
    """
    m = _UTC_OFFSET_RE.search(tz_str)
    if not m:
        return timedelta(0)
    sign, hours = m.group(1), int(m.group(2))
    if sign == "+":
        return timedelta(hours=hours)
    elif sign == "-":
        return timedelta(hours=-hours)
    else:  # ±
        return timedelta(0)


def _parse_match_datetime(date_str: str, time_str: str) -> datetime:
    """
    Convert "2026-06-11" + "13:00 UTC-6" into a timezone-aware UTC datetime.
    """
    parts = time_str.rsplit(" ", 1)
    time_part = parts[0]
    tz_part = parts[1] if len(parts) > 1 else "UTC+0"

    hour, minute = map(int, time_part.split(":"))
    offset = _parse_utc_offset(tz_part)

    year, month, day = map(int, date_str.split("-"))
    local_tz = timezone(offset)
    local_dt = datetime(year, month, day, hour, minute, tzinfo=local_tz)
    return local_dt.astimezone(timezone.utc)


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------

def load_fixtures() -> list[dict]:
    """
    Read worldcup.json and return a list of dicts ready to upsert into the
    `fixtures` table.  Each dict maps to Fixture model fields.
    """
    with open(_FIXTURES_FILE, encoding="utf-8") as f:
        data = json.load(f)

    matches = data.get("matches", [])
    records: list[dict] = []

    for idx, match in enumerate(matches, start=1):
        date_str: str = match.get("date", "")
        time_str: str = match.get("time", "00:00 UTC+0")
        round_name: str = match.get("round", "")
        team1: str = match.get("team1", "TBD")
        team2: str = match.get("team2", "TBD")
        group: str | None = match.get("group")          # e.g. "Group A"
        ground: str = match.get("ground", "")
        num: int | None = match.get("num")               # set on knockout matches

        try:
            match_date = _parse_match_datetime(date_str, time_str)
        except Exception:
            logger.warning("failed_to_parse_datetime", date=date_str, time=time_str)
            continue

        # Betting is only open when both teams are confirmed (i.e., real team names known).
        # Placeholder names like "2A", "1E", "3A/B/C/D/F" are NOT in _FLAG_ISO2.
        teams_confirmed = team1 in _FLAG_ISO2 and team2 in _FLAG_ISO2
        records.append(
            {
                "external_id": num if num else idx,
                "home_team": team1,
                "away_team": team2,
                "home_logo_url": _flag_url(team1),
                "away_logo_url": _flag_url(team2),
                "league_name": WORLDCUP_LEAGUE_NAME,
                "league_id": WORLDCUP_LEAGUE_ID,
                "league_logo_url": None,
                "match_date": match_date,
                "status": "scheduled",
                "home_score": None,
                "away_score": None,
                "round": round_name,
                "group_name": group,
                "venue": ground,
                "season": WORLDCUP_SEASON,
                "betting_open": teams_confirmed,
            }
        )

    logger.info("worldcup_fixtures_loaded", total=len(records))
    return records
