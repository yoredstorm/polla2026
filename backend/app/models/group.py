import uuid
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import String, Boolean, DateTime, Integer, Numeric, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.db.session import Base
from app.core.security import generate_invite_code


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    invite_code: Mapped[str] = mapped_column(String(20), unique=True, index=True, default=generate_invite_code, nullable=False)
    max_members: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    entry_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    prize_pool: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    bet_amount_mode: Mapped[str] = mapped_column(String(20), default="single_entry", nullable=False)
    fixed_bet_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    challenge_max_stake: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    challenge_daily_limit: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    challenge_tournament_limit: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    challenges_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    payment_contact_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    payment_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    payment_qr_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    owner: Mapped["User"] = relationship("User", back_populates="owned_groups")
    entry_proofs: Mapped[list["GroupEntryProof"]] = relationship(
        "GroupEntryProof", back_populates="group", lazy="select"
    )
    members: Mapped[list["GroupMember"]] = relationship("GroupMember", back_populates="group", lazy="select")
    bets: Mapped[list["Bet"]] = relationship("Bet", back_populates="group", lazy="select")
    phase_winners: Mapped[list["PhaseWinnerHistory"]] = relationship(
        "PhaseWinnerHistory", back_populates="group", lazy="select"
    )


class GroupMember(Base):
    __tablename__ = "group_members"

    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    total_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_amount_bet: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)

    group: Mapped["Group"] = relationship("Group", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="group_memberships")


class GroupEntryProof(Base):
    __tablename__ = "group_entry_proofs"

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    file_path: Mapped[str] = mapped_column(String(255), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    group: Mapped["Group"] = relationship("Group", back_populates="entry_proofs")
    user: Mapped["User"] = relationship("User")
