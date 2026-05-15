"""Add venue and group_name to fixtures

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-13 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("fixtures", sa.Column("group_name", sa.String(20), nullable=True))
    op.add_column("fixtures", sa.Column("venue", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("fixtures", "venue")
    op.drop_column("fixtures", "group_name")
