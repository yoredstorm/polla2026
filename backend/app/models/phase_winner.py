"""Historial de ganadores por fase del torneo (polla global)."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import String, DateTime, Integer, Numeric, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.session import Base


class PhaseWinnerHistory(Base):
    __tablename__ = "phase_winner_history"
    __table_args__ = (UniqueConstraint("group_id", "phase_key", name="uq_phase_winner_group_phase"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    phase_key: Mapped[str] = mapped_column(String(32), nullable=False)
    winner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    winner_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    phase_prize_pool: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    top_snapshot: Mapped[list | None] = mapped_column(JSON, nullable=True)
    phase_closed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    closed_by: Mapped[str] = mapped_column(String(20), default="system", nullable=False)

    group: Mapped["Group"] = relationship("Group", back_populates="phase_winners")
    winner: Mapped["User | None"] = relationship("User")
