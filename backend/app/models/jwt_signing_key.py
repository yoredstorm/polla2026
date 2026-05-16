"""JWT signing keys for rotation (access / refresh purposes)."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class JwtSigningKey(Base):
    __tablename__ = "jwt_signing_keys"

    kid: Mapped[str] = mapped_column(String(64), primary_key=True)
    purpose: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    secret: Mapped[str] = mapped_column(String(512), nullable=False)
    active_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_jwt_signing_keys_purpose_active", "purpose", "active_from"),
    )
