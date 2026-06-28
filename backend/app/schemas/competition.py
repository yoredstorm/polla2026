"""Pydantic schemas for competitions."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

CompetitionStatus = Literal["draft", "scheduled", "open", "in_progress", "finished", "archived"]
CompetitionFormat = Literal["league", "groups_knockout", "knockout_only", "custom"]
CompetitionVisibility = Literal["public", "invite_only"]
AdminRole = Literal["owner", "co_admin"]


class CompetitionBranding(BaseModel):
    logo_url: str | None = None
    primary_color: str = "#22c55e"


class CompetitionSettings(BaseModel):
    currency: str = "USD"
    entry_fee: Decimal | None = None
    bet_amount_mode: str = "single_entry"
    branding: CompetitionBranding = Field(default_factory=CompetitionBranding)


class CompetitionCardOut(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    sport: str
    format_type: str
    status: str
    visibility: str
    logo_url: str | None = None
    primary_color: str = "#22c55e"
    is_member: bool = False
    member_count: int = 0

    model_config = {"from_attributes": True}


class CompetitionDetailOut(CompetitionCardOut):
    settings_json: dict[str, Any] | None = None
    created_at: datetime


class CompetitionCreateIn(BaseModel):
    slug: str = Field(min_length=2, max_length=80)
    name: str = Field(min_length=2, max_length=150)
    sport: str = "football"
    format_type: CompetitionFormat = "groups_knockout"
    status: CompetitionStatus = "draft"
    visibility: CompetitionVisibility = "public"
    settings: CompetitionSettings | None = None

    @field_validator("slug")
    @classmethod
    def normalize_slug(cls, v: str) -> str:
        return v.strip().lower().replace(" ", "-")


class CompetitionUpdateIn(BaseModel):
    name: str | None = None
    sport: str | None = None
    format_type: CompetitionFormat | None = None
    status: CompetitionStatus | None = None
    visibility: CompetitionVisibility | None = None
    settings: CompetitionSettings | None = None


class ScoringRuleIn(BaseModel):
    exact_score_points: int = Field(default=2, ge=0, le=10)
    winner_points: int = Field(default=1, ge=0, le=10)
    wrong_points: int = Field(default=0, ge=0, le=10)


class ScoringRuleOut(ScoringRuleIn):
    competition_id: uuid.UUID


class PrizePlaceIn(BaseModel):
    place: int = Field(ge=1, le=20)
    percent: Decimal = Field(ge=0, le=100)


class PaymentSettingIn(BaseModel):
    contact_name: str | None = None
    phone: str | None = None
    instructions_text: str | None = None


class PaymentSettingOut(PaymentSettingIn):
    competition_id: uuid.UUID
    qr_path: str | None = None


class CompetitionAdminIn(BaseModel):
    user_id: uuid.UUID
    role: AdminRole = "co_admin"


class CompetitionAdminOut(BaseModel):
    user_id: uuid.UUID
    username: str
    role: str


class CompetitionStageIn(BaseModel):
    name: str
    stage_type: str = "custom"
    order: int = 0


class CompetitionStageOut(CompetitionStageIn):
    id: uuid.UUID
    competition_id: uuid.UUID
