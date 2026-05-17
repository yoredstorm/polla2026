"""Create challenges table for 1v1 duels

Revision ID: 0015
Revises: 0014
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "challenges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("fixture_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("fixtures.id", ondelete="CASCADE"), nullable=False),
        sa.Column("group_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("challenger_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("challenged_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stake_points", sa.Integer, nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending_accept"),
        sa.Column("winner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("challenger_fixture_points", sa.Integer, nullable=True),
        sa.Column("challenged_fixture_points", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_challenges_fixture_id", "challenges", ["fixture_id"])
    op.create_index("ix_challenges_challenger_id", "challenges", ["challenger_id"])
    op.create_index("ix_challenges_challenged_id", "challenges", ["challenged_id"])
    op.create_index("ix_challenges_status", "challenges", ["status"])


def downgrade() -> None:
    op.drop_index("ix_challenges_status", table_name="challenges")
    op.drop_index("ix_challenges_challenged_id", table_name="challenges")
    op.drop_index("ix_challenges_challenger_id", table_name="challenges")
    op.drop_index("ix_challenges_fixture_id", table_name="challenges")
    op.drop_table("challenges")
