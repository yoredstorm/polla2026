import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, field_validator


class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    max_members: int = 20
    entry_fee: Decimal = Decimal("0.00")
    currency: str = "USD"
    bet_amount_mode: Literal["single_entry", "per_bet"] = "single_entry"
    fixed_bet_amount: Optional[Decimal] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if len(v) < 3 or len(v) > 100:
            raise ValueError("Group name must be 3-100 characters")
        return v

    @field_validator("max_members")
    @classmethod
    def validate_max_members(cls, v: int) -> int:
        if v < 2 or v > 100:
            raise ValueError("Max members must be between 2 and 100")
        return v


class GroupJoin(BaseModel):
    invite_code: str


class GroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: Optional[str] = None
    owner_id: uuid.UUID
    invite_code: str
    max_members: int
    entry_fee: Decimal
    prize_pool: Decimal
    currency: str
    bet_amount_mode: str = "single_entry"
    fixed_bet_amount: Optional[Decimal] = None
    is_active: bool
    created_at: datetime
    member_count: Optional[int] = None


class GroupMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    username: str
    first_name: str | None = None
    last_name: str | None = None
    joined_at: datetime
    total_points: int
    total_amount_bet: Decimal


class BadgeOut(BaseModel):
    id: str
    label: str
    description: str


class LeaderboardEntry(BaseModel):
    position: int
    user_id: uuid.UUID
    username: str
    first_name: str | None = None
    last_name: str | None = None
    avatar_preset: str | None = None
    avatar_url: str | None = None
    avatar_display: str | None = None
    total_points: int
    total_bets: int
    correct_results: int
    accuracy_pct: float
    wrong_results: int = 0
    miss_pct: float = 0.0
    bets_profile_visibility: Literal["public", "invite_only"] = "public"
    wager_count: int = 0
    show_bet_amounts: bool = True
    total_wagered: Decimal = Decimal("0")
    bet_points: int = 0
    challenge_pts_won: int = 0
    challenge_pts_lost: int = 0
    challenge_pts_net: int = 0
    challenges_won: int = 0
    challenges_lost: int = 0
    challenges_active: int = 0
    badges: list[BadgeOut] = []


class GroupFixtureStandingEntry(BaseModel):
    """Per-user standing for one fixture inside one group."""

    user_id: uuid.UUID
    username: str
    first_name: str | None = None
    last_name: str | None = None
    predicted_home_score: int
    predicted_away_score: int
    points_earned: Optional[int] = None
    amount: Decimal
