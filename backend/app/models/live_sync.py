"""Models for Google live sync telemetry and settings."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class FixtureSyncLog(Base):
    __tablename__ = "fixture_sync_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fixture_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fixtures.id", ondelete="CASCADE"), index=True, nullable=False
    )
    polled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    search_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    google_match_sie: Mapped[str | None] = mapped_column(String(500), nullable=True)
    parsed_home: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parsed_away: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parsed_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    parsed_minute: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    action_taken: Mapped[str] = mapped_column(String(30), default="none", nullable=False)
    response_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)


class LiveSyncSettings(Base):
    __tablename__ = "live_sync_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    poll_interval_seconds: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    pre_kickoff_minutes: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    max_concurrent_polls: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    failure_threshold: Mapped[int] = mapped_column(Integer, default=6, nullable=False)
    confirm_reads_required: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    sync_enabled_globally: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
