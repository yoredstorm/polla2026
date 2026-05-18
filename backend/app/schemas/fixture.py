import uuid
from datetime import datetime
from typing import Optional, TYPE_CHECKING

from pydantic import BaseModel, ConfigDict

from app.core.match_timing import fixture_deadline_fields

if TYPE_CHECKING:
    from app.models.fixture import Fixture


class FixtureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    external_id: int
    home_team: str
    away_team: str
    home_logo_url: Optional[str] = None
    away_logo_url: Optional[str] = None
    league_name: str
    league_id: int
    league_logo_url: Optional[str] = None
    match_date: datetime
    status: str
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    round: Optional[str] = None
    group_name: Optional[str] = None
    venue: Optional[str] = None
    season: int
    is_locked: bool
    betting_open: bool
    betting_closes_at: Optional[datetime] = None
    change_request_closes_at: Optional[datetime] = None
    admin_resolve_closes_at: Optional[datetime] = None


def fixture_to_out(fixture: "Fixture") -> FixtureOut:
    return FixtureOut.model_validate(
        {**{c.key: getattr(fixture, c.key) for c in fixture.__table__.columns}, **fixture_deadline_fields(fixture)}
    )


class FixtureFilter(BaseModel):
    league_id: Optional[int] = None
    group_name: Optional[str] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    status: Optional[str] = None
    page: int = 1
    limit: int = 20
