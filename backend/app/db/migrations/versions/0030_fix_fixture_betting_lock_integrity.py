"""Unlock scheduled fixtures where betting_open was re-enabled while is_locked stayed true."""
from alembic import op

revision = "0030"
down_revision = "0029_prize_structure_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE fixtures
        SET is_locked = false
        WHERE status = 'scheduled'
          AND betting_open = true
          AND is_locked = true
          AND match_date > NOW() + interval '1 minute'
        """
    )


def downgrade() -> None:
    pass
