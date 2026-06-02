"""Phase winner history per tournament phase."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0027_phase_winner_history"
down_revision = "0026_group_challenges_enabled"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "phase_winner_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("group_id", UUID(as_uuid=True), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("phase_key", sa.String(32), nullable=False),
        sa.Column("winner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("winner_points", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("phase_prize_pool", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("top_snapshot", JSONB(), nullable=True),
        sa.Column("phase_closed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_by", sa.String(20), nullable=False, server_default="system"),
        sa.UniqueConstraint("group_id", "phase_key", name="uq_phase_winner_group_phase"),
    )
    op.create_index("ix_phase_winner_history_group_id", "phase_winner_history", ["group_id"])


def downgrade() -> None:
    op.drop_index("ix_phase_winner_history_group_id", table_name="phase_winner_history")
    op.drop_table("phase_winner_history")
