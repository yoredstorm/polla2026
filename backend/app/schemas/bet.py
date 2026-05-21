import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, field_validator


class BetCreate(BaseModel):
    fixture_id: uuid.UUID
    group_id: Optional[uuid.UUID] = None
    predicted_home_score: int
    predicted_away_score: int
    amount: Optional[Decimal] = None

    @field_validator("predicted_home_score", "predicted_away_score")
    @classmethod
    def validate_score(cls, v: int) -> int:
        if v < 0 or v > 20:
            raise ValueError("Score must be between 0 and 20")
        return v

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v < 0:
            raise ValueError("Amount cannot be negative")
        return v


class BetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    fixture_id: uuid.UUID
    group_id: Optional[uuid.UUID] = None
    predicted_home_score: int
    predicted_away_score: int
    amount: Decimal
    amount_confirmed: bool = False
    points_earned: Optional[int] = None
    is_locked: bool
    cancelled_at: Optional[datetime] = None
    created_at: datetime


class BetWithFixtureSummaryOut(BetOut):
    """My bets list: fixture metadata for client-side change-request window UX."""

    fixture_match_date: datetime
    fixture_home_team: str
    fixture_away_team: str
    fixture_status: str


class BetWithFixture(BetOut):
    fixture: Optional[dict] = None


class BetWithUserOut(BetOut):
    """Bet with owning username (group bet lists)."""

    username: str
    first_name: str | None = None
    last_name: str | None = None
