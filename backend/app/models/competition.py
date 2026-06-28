"""Multi-competition platform models."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    String,
    Boolean,
    DateTime,
    Integer,
    Numeric,
    ForeignKey,
    Text,
    UniqueConstraint,
    JSON,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.session import Base

COMPETITION_STATUSES = ("draft", "scheduled", "open", "in_progress", "finished", "archived")
COMPETITION_FORMATS = ("league", "groups_knockout", "knockout_only", "custom")
COMPETITION_VISIBILITY = ("public", "invite_only")
ADMIN_ROLES = ("owner", "co_admin")


class Competition(Base):
    __tablename__ = "competitions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    sport: Mapped[str] = mapped_column(String(50), default="football", nullable=False)
    format_type: Mapped[str] = mapped_column(String(32), default="groups_knockout", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    visibility: Mapped[str] = mapped_column(String(20), default="public", nullable=False)
    invite_code: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    settings_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    stages: Mapped[list["CompetitionStage"]] = relationship(
        "CompetitionStage", back_populates="competition", lazy="select"
    )
    admins: Mapped[list["CompetitionAdmin"]] = relationship(
        "CompetitionAdmin", back_populates="competition", lazy="select"
    )
    scoring_rule: Mapped["ScoringRule | None"] = relationship(
        "ScoringRule", back_populates="competition", uselist=False, lazy="select"
    )
    payment_setting: Mapped["PaymentSetting | None"] = relationship(
        "PaymentSetting", back_populates="competition", uselist=False, lazy="select"
    )
    prize_rows: Mapped[list["PrizeDistribution"]] = relationship(
        "PrizeDistribution", back_populates="competition", lazy="select"
    )
    pool: Mapped["Group | None"] = relationship(
        "Group", back_populates="competition", uselist=False, lazy="select"
    )
    fixtures: Mapped[list["Fixture"]] = relationship("Fixture", back_populates="competition", lazy="select")


class CompetitionStage(Base):
    __tablename__ = "competition_stages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    stage_type: Mapped[str] = mapped_column(String(32), default="custom", nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    scoring_rules_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    competition: Mapped["Competition"] = relationship("Competition", back_populates="stages")
    fixtures: Mapped[list["Fixture"]] = relationship("Fixture", back_populates="stage", lazy="select")


class CompetitionAdmin(Base):
    __tablename__ = "competition_admins"
    __table_args__ = (UniqueConstraint("competition_id", "user_id", name="uq_competition_admin"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), default="owner", nullable=False)

    competition: Mapped["Competition"] = relationship("Competition", back_populates="admins")
    user: Mapped["User"] = relationship("User", lazy="select")


class ScoringRule(Base):
    __tablename__ = "scoring_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("competitions.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    exact_score_points: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    winner_points: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    wrong_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    competition: Mapped["Competition"] = relationship("Competition", back_populates="scoring_rule")


class PrizeDistribution(Base):
    __tablename__ = "prize_distribution"
    __table_args__ = (UniqueConstraint("competition_id", "place", name="uq_prize_place"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    place: Mapped[int] = mapped_column(Integer, nullable=False)
    percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)

    competition: Mapped["Competition"] = relationship("Competition", back_populates="prize_rows")


class PaymentSetting(Base):
    __tablename__ = "payment_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("competitions.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    contact_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    qr_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    instructions_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    competition: Mapped["Competition"] = relationship("Competition", back_populates="payment_setting")
