"""Prize structure mode: single_tournament, groups_knockout, full_milestones."""
from alembic import op
import sqlalchemy as sa

revision = "0029_prize_structure_mode"
down_revision = "0028_phase_fees_enrollments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("groups")}
    if "prize_structure_mode" in columns:
        return
    op.add_column(
        "groups",
        sa.Column(
            "prize_structure_mode",
            sa.String(32),
            nullable=False,
            server_default="full_milestones",
        ),
    )


def downgrade() -> None:
    op.drop_column("groups", "prize_structure_mode")
