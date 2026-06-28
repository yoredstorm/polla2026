"""Per-competition promotional marquees."""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "competition_marquees",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "competition_id",
            UUID(as_uuid=True),
            sa.ForeignKey("competitions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("message", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_by_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.UniqueConstraint("competition_id", name="uq_competition_marquee_competition"),
    )
    op.create_index(
        "ix_competition_marquees_competition_id",
        "competition_marquees",
        ["competition_id"],
    )

    conn = op.get_bind()
    competitions = conn.execute(sa.text("SELECT id FROM competitions")).fetchall()
    site_row = conn.execute(
        sa.text("SELECT message, is_enabled, updated_at, updated_by_id FROM site_marquee WHERE id = 1")
    ).fetchone()
    default_message = ""
    default_enabled = False
    default_updated_at = None
    default_updated_by = None
    if site_row:
        default_message = site_row[0] or ""
        default_enabled = bool(site_row[1])
        default_updated_at = site_row[2]
        default_updated_by = site_row[3]

    for (comp_id,) in competitions:
        conn.execute(
            sa.text(
                """
                INSERT INTO competition_marquees
                    (id, competition_id, message, is_enabled, updated_at, updated_by_id)
                VALUES
                    (:id, :competition_id, :message, :is_enabled, COALESCE(:updated_at, NOW()), :updated_by_id)
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "competition_id": str(comp_id),
                "message": default_message,
                "is_enabled": default_enabled,
                "updated_at": default_updated_at,
                "updated_by_id": str(default_updated_by) if default_updated_by else None,
            },
        )


def downgrade() -> None:
    op.drop_index("ix_competition_marquees_competition_id", table_name="competition_marquees")
    op.drop_table("competition_marquees")
