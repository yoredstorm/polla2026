"""Add challenge_max_stake to groups."""
from alembic import op
import sqlalchemy as sa

revision = "0016_group_challenge_max_stake"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "groups",
        sa.Column("challenge_max_stake", sa.Integer(), nullable=False, server_default="10"),
    )


def downgrade() -> None:
    op.drop_column("groups", "challenge_max_stake")
