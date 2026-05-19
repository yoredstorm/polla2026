from typing import Literal
import uuid
from datetime import datetime
from pydantic import BaseModel, field_validator, ConfigDict, model_validator
import re

from app.lib.user_display import validate_person_name


class UserRegister(BaseModel):
    username: str
    password: str
    first_name: str
    last_name: str

    @field_validator("first_name")
    @classmethod
    def validate_first_name(cls, v: str) -> str:
        return validate_person_name(v, "first_name")

    @field_validator("last_name")
    @classmethod
    def validate_last_name(cls, v: str) -> str:
        return validate_person_name(v, "last_name")

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_]{3,50}$", v):
            raise ValueError("Username must be 3-50 alphanumeric characters or underscores")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit")
        return v


class UserLogin(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^[a-zA-Z0-9_]{3,50}$", v):
            raise ValueError("Username must be 3-50 alphanumeric characters or underscores")
        return v


class ChangePassword(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit")
        return v


class AvatarUpdate(BaseModel):
    preset: str | None = None


class ProfileNameUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None

    @model_validator(mode="after")
    def both_or_neither(self):
        if (self.first_name is None) != (self.last_name is None):
            raise ValueError("first_name and last_name must be provided together")
        return self

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_names(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return validate_person_name(v)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    is_active: bool
    is_verified: bool
    created_at: datetime
    is_admin: bool = False
    bets_profile_visibility: Literal["public", "invite_only"] = "public"
    has_bets_profile_invite_code: bool = False
    show_bet_amounts: bool = True
    avatar_preset: str | None = None
    avatar_url: str | None = None
    avatar_display: str | None = None


class PublicUserSummary(BaseModel):
    user_id: uuid.UUID
    username: str
    first_name: str | None = None
    last_name: str | None = None
    bets_profile_visibility: Literal["public", "invite_only"]
    total_bets: int | None = None
    show_bet_amounts: bool = True
    avatar_preset: str | None = None
    avatar_url: str | None = None
    avatar_display: str | None = None


class BetsProfileUpdate(BaseModel):
    visibility: Literal["public", "invite_only"]
    rotate_code: bool = False
    show_bet_amounts: bool | None = None


class BetsProfileMeResponse(BaseModel):
    bets_profile_visibility: Literal["public", "invite_only"]
    has_invite_code: bool
    new_invite_code: str | None = None
    show_bet_amounts: bool = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str
