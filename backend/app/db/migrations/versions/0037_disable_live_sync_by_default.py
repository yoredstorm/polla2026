"""Disable live sync globally by default."""
from alembic import op
import sqlalchemy as sa

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO live_sync_settings (id, sync_enabled_globally)
            VALUES (1, false)
            ON CONFLICT (id) DO UPDATE
            SET sync_enabled_globally = false,
                updated_at = NOW()
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE live_sync_settings
            SET sync_enabled_globally = true,
                updated_at = NOW()
            WHERE id = 1
            """
        )
    )
