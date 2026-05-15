import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


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


class FixtureFilter(BaseModel):
    league_id: Optional[int] = None
    group_name: Optional[str] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    status: Optional[str] = None
    page: int = 1
    limit: int = 20
