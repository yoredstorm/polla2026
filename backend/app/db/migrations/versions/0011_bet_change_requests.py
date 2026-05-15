"""Create bet_change_requests table

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-15 10:00:00.000000
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bet_change_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bet_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_type", sa.String(10), nullable=False),
        sa.Column("new_predicted_home_score", sa.Integer, nullable=True),
        sa.Column("new_predicted_away_score", sa.Integer, nullable=True),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("admin_notes", sa.Text, nullable=True),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_bet_change_requests_user_id", "bet_change_requests", ["user_id"])
    op.create_index("ix_bet_change_requests_bet_id", "bet_change_requests", ["bet_id"])
    op.create_index("ix_bet_change_requests_status", "bet_change_requests", ["status"])


def downgrade() -> None:
    op.drop_index("ix_bet_change_requests_status")
    op.drop_index("ix_bet_change_requests_bet_id")
    op.drop_index("ix_bet_change_requests_user_id")
    op.drop_table("bet_change_requests")
