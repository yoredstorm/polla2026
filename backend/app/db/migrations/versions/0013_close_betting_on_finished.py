"""Close betting_open on finished/live/cancelled or locked fixtures

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-16 02:30:00.000000
"""
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE fixtures
        SET betting_open = false
        WHERE betting_open = true
          AND (
            status IN ('live', 'finished', 'cancelled')
            OR is_locked = true
          )
        """
    )


def downgrade() -> None:
    pass
