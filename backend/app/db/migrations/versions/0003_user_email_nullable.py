"""Make users.email nullable for username-only registration

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-14 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "email",
        existing_type=sa.String(255),
        nullable=True,
    )


def downgrade() -> None:
    op.execute("UPDATE users SET email = CONCAT('legacy_', id::text, '@placeholder.invalid') WHERE email IS NULL")
    op.alter_column(
        "users",
        "email",
        existing_type=sa.String(255),
        nullable=False,
    )
