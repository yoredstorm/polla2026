"""Add cancelled_at to bets; backfill unpaid extras on closed fixtures."""
from alembic import op
import sqlalchemy as sa

revision = "0023_bet_cancelled_at"
down_revision = "0022_challenge_limits"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bets",
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        """
        UPDATE bets b
        SET cancelled_at = NOW()
        FROM fixtures f
        WHERE b.fixture_id = f.id
          AND b.group_id IS NOT NULL
          AND b.amount > 0
          AND b.amount_confirmed = FALSE
          AND b.cancelled_at IS NULL
          AND (
            f.is_locked = TRUE
            OR f.betting_open = FALSE
            OR f.status != 'scheduled'
          )
        """
    )


def downgrade() -> None:
    op.drop_column("bets", "cancelled_at")
