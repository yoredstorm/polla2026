"""Per-phase fees, enrollments, and entry proofs for polla milestones."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import String, DateTime, Numeric, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.session import Base


class GroupPhaseFee(Base):
    __tablename__ = "group_phase_fees"
    __table_args__ = (UniqueConstraint("group_id", "phase_key", name="uq_group_phase_fee"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    phase_key: Mapped[str] = mapped_column(String(32), nullable=False)
    entry_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    extra_per_match: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    group: Mapped["Group"] = relationship("Group", back_populates="phase_fees")


class GroupPhaseEnrollment(Base):
    __tablename__ = "group_phase_enrollments"
    __table_args__ = (
        UniqueConstraint("group_id", "user_id", "phase_key", name="uq_group_phase_enrollment"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    phase_key: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    entry_fee_paid: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    group: Mapped["Group"] = relationship("Group", back_populates="phase_enrollments")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])


class GroupPhaseEntryProof(Base):
    __tablename__ = "group_phase_entry_proofs"
    __table_args__ = (
        UniqueConstraint("group_id", "user_id", "phase_key", name="uq_group_phase_entry_proof"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    phase_key: Mapped[str] = mapped_column(String(32), primary_key=True)
    file_path: Mapped[str] = mapped_column(String(255), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    group: Mapped["Group"] = relationship("Group", back_populates="phase_entry_proofs")
    user: Mapped["User"] = relationship("User")
