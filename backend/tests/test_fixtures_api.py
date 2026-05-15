"""
Tests for World Cup 2026 JSON fixture loader.
No external API or network required.
"""
import pytest
from datetime import timezone

from app.services.worldcup_loader import load_fixtures, _parse_match_datetime, _flag_url


class TestDatetimeParsing:
    """Tests for UTC-offset datetime parsing."""

    def test_utc_minus_6(self):
        dt = _parse_match_datetime("2026-06-11", "13:00 UTC-6")
        assert dt.tzinfo == timezone.utc
        assert dt.hour == 19  # 13 + 6
        assert dt.minute == 0

    def test_utc_minus_4(self):
        dt = _parse_match_datetime("2026-06-15", "12:00 UTC-4")
        assert dt.hour == 16  # 12 + 4

    def test_utc_zero(self):
        dt = _parse_match_datetime("2026-07-19", "15:00 UTC±0")
        assert dt.hour == 15

    def test_utc_minus_7(self):
        dt = _parse_match_datetime("2026-06-14", "21:00 UTC-7")
        # 21 + 7 = 28 → next day 04:00
        assert dt.day == 15
        assert dt.hour == 4


class TestFlagUrl:
    def test_known_team(self):
        url = _flag_url("Argentina")
        assert url == "https://flagcdn.com/w40/ar.png"

    def test_scotland(self):
        url = _flag_url("Scotland")
        assert url == "https://flagcdn.com/w40/gb-sct.png"

    def test_england(self):
        url = _flag_url("England")
        assert url == "https://flagcdn.com/w40/gb-eng.png"

    def test_unknown_team_returns_none(self):
        assert _flag_url("TBD") is None
        assert _flag_url("W74") is None


class TestLoadFixtures:
    def test_loads_all_matches(self):
        records = load_fixtures()
        # The JSON has 104 matches (72 group + 16 R32 + 8 R16 + 4 QF + 2 SF + 1 3rd + 1 Final)
        assert len(records) == 104

    def test_group_stage_has_group_name(self):
        records = load_fixtures()
        group_matches = [r for r in records if r["group_name"] is not None]
        # 12 groups × 6 matches = 72 group stage matches
        assert len(group_matches) == 72

    def test_knockout_has_no_group_name(self):
        records = load_fixtures()
        knockout = [r for r in records if r["round"] in ("Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final")]
        assert all(r["group_name"] is None for r in knockout)

    def test_all_records_have_required_fields(self):
        records = load_fixtures()
        required = {"external_id", "home_team", "away_team", "league_id", "league_name",
                    "match_date", "status", "season", "round"}
        for rec in records:
            assert required.issubset(rec.keys()), f"Missing keys in {rec}"

    def test_season_is_2026(self):
        records = load_fixtures()
        assert all(r["season"] == 2026 for r in records)

    def test_status_is_scheduled(self):
        records = load_fixtures()
        assert all(r["status"] == "scheduled" for r in records)

    def test_dates_are_utc(self):
        from datetime import timezone
        records = load_fixtures()
        for rec in records:
            assert rec["match_date"].tzinfo == timezone.utc

    def test_no_duplicate_external_ids(self):
        records = load_fixtures()
        ids = [r["external_id"] for r in records]
        assert len(ids) == len(set(ids)), "Duplicate external_id found"
