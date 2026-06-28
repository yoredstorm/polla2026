"""Backfill audit_logs.competition_id from legacy detail JSON."""
from alembic import op
import sqlalchemy as sa

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE audit_logs al
            SET competition_id = g.competition_id
            FROM groups g
            WHERE al.competition_id IS NULL
              AND g.competition_id IS NOT NULL
              AND al.detail IS NOT NULL
              AND al.detail LIKE '%' || g.id::text || '%'
            """
        )
    )
    conn.execute(
        sa.text(
            """
            UPDATE audit_logs al
            SET competition_id = f.competition_id
            FROM fixtures f
            WHERE al.competition_id IS NULL
              AND f.competition_id IS NOT NULL
              AND al.detail IS NOT NULL
              AND al.detail LIKE '%' || f.id::text || '%'
            """
        )
    )
    conn.execute(
        sa.text(
            """
            UPDATE audit_logs al
            SET competition_id = b.competition_id
            FROM bets b
            WHERE al.competition_id IS NULL
              AND b.competition_id IS NOT NULL
              AND al.detail IS NOT NULL
              AND al.detail LIKE '%' || b.id::text || '%'
            """
        )
    )


def downgrade() -> None:
    pass
