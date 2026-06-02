"""Add challenges_enabled toggle to groups."""
from alembic import op
import sqlalchemy as sa

revision = "0026_group_challenges_enabled"
down_revision = "0025_user_push_preferences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "groups",
        sa.Column("challenges_enabled", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("groups", "challenges_enabled")
