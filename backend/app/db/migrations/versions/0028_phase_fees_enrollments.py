"""Phase fees, enrollments, entry proofs, current_phase_key, third_place support."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0028_phase_fees_enrollments"
down_revision = "0027_phase_winner_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "groups",
        sa.Column("current_phase_key", sa.String(32), nullable=False, server_default="groups"),
    )

    op.create_table(
        "group_phase_fees",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("group_id", UUID(as_uuid=True), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("phase_key", sa.String(32), nullable=False),
        sa.Column("entry_fee", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("extra_per_match", sa.Numeric(10, 2), nullable=True),
        sa.UniqueConstraint("group_id", "phase_key", name="uq_group_phase_fee"),
    )
    op.create_index("ix_group_phase_fees_group_id", "group_phase_fees", ["group_id"])

    op.create_table(
        "group_phase_enrollments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("group_id", UUID(as_uuid=True), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("phase_key", sa.String(32), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("entry_fee_paid", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("group_id", "user_id", "phase_key", name="uq_group_phase_enrollment"),
    )
    op.create_index("ix_group_phase_enrollments_group_id", "group_phase_enrollments", ["group_id"])

    op.create_table(
        "group_phase_entry_proofs",
        sa.Column("group_id", UUID(as_uuid=True), sa.ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("phase_key", sa.String(32), primary_key=True),
        sa.Column("file_path", sa.String(255), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("group_phase_entry_proofs")
    op.drop_index("ix_group_phase_enrollments_group_id", table_name="group_phase_enrollments")
    op.drop_table("group_phase_enrollments")
    op.drop_index("ix_group_phase_fees_group_id", table_name="group_phase_fees")
    op.drop_table("group_phase_fees")
    op.drop_column("groups", "current_phase_key")
