"""Add show_bet_amounts to users

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("show_bet_amounts", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("users", "show_bet_amounts")
