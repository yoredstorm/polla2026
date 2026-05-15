"""Add betting_open to fixtures

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-15 06:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "fixtures",
        sa.Column("betting_open", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("fixtures", "betting_open")
