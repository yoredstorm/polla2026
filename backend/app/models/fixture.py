import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Integer, Float, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.db.session import Base


class Fixture(Base):
    __tablename__ = "fixtures"
    __table_args__ = (
        UniqueConstraint("competition_id", "external_id", name="uq_fixtures_competition_external_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    home_team: Mapped[str] = mapped_column(String(100), nullable=False)
    away_team: Mapped[str] = mapped_column(String(100), nullable=False)
    home_logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    away_logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    league_name: Mapped[str] = mapped_column(String(100), nullable=False)
    league_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    league_logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    match_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="scheduled", nullable=False)  # scheduled|live|finished|cancelled
    home_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    round: Mapped[str | None] = mapped_column(String(100), nullable=True)
    group_name: Mapped[str | None] = mapped_column(String(20), nullable=True)   # e.g. "Group A"
    venue: Mapped[str | None] = mapped_column(String(200), nullable=True)       # stadium / city
    season: Mapped[int] = mapped_column(Integer, nullable=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    betting_open: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    score_timeline: Mapped[list | None] = mapped_column(JSON, nullable=True)
    competition_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("competitions.id", ondelete="CASCADE"), nullable=True, index=True
    )
    stage_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("competition_stages.id", ondelete="SET NULL"), nullable=True, index=True
    )
    group_label: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sync_mode: Mapped[str] = mapped_column(String(20), default="auto", nullable=False)
    google_match_sie: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consecutive_sync_failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_scraped_home: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_scraped_away: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_scraped_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sync_confirm_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    bets: Mapped[list["Bet"]] = relationship("Bet", back_populates="fixture", lazy="select")
    competition: Mapped["Competition | None"] = relationship("Competition", back_populates="fixtures", lazy="select")
    stage: Mapped["CompetitionStage | None"] = relationship("CompetitionStage", back_populates="fixtures", lazy="select")
