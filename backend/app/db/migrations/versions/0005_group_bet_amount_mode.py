"""Add bet_amount_mode and fixed_bet_amount to groups

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-14 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "groups",
        sa.Column("bet_amount_mode", sa.String(20), nullable=False, server_default="single_entry"),
    )
    op.add_column(
        "groups",
        sa.Column("fixed_bet_amount", sa.Numeric(10, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("groups", "fixed_bet_amount")
    op.drop_column("groups", "bet_amount_mode")
