"""User bets profile visibility and invite hash

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-14 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("bets_profile_visibility", sa.String(20), nullable=False, server_default="public"),
    )
    op.add_column(
        "users",
        sa.Column("bets_profile_invite_hash", sa.String(64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "bets_profile_invite_hash")
    op.drop_column("users", "bets_profile_visibility")
