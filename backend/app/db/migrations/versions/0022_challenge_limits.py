"""Add challenge daily and tournament limits to groups."""
from alembic import op
import sqlalchemy as sa

revision = "0022_challenge_limits"
down_revision = "0021_password_reset"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "groups",
        sa.Column("challenge_daily_limit", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "groups",
        sa.Column("challenge_tournament_limit", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("groups", "challenge_tournament_limit")
    op.drop_column("groups", "challenge_daily_limit")
