"""Multi-competition platform: competitions table + scoped FKs + Mundial 2026 seed."""
import json
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None

DEFAULT_SLUG = "mundial-2026"


def _drop_fixture_external_id_unique() -> None:
    """Drop legacy global unique on external_id (index or constraint name varies by migration history)."""
    conn = op.get_bind()
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_fixtures_external_id"))
    conn.execute(
        sa.text("ALTER TABLE fixtures DROP CONSTRAINT IF EXISTS fixtures_external_id_key")
    )


def upgrade() -> None:
    op.create_table(
        "competitions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("sport", sa.String(50), nullable=False, server_default="football"),
        sa.Column("format_type", sa.String(32), nullable=False, server_default="groups_knockout"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("visibility", sa.String(20), nullable=False, server_default="public"),
        sa.Column("invite_code", sa.String(32), nullable=True),
        sa.Column("settings_json", JSONB(), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_competitions_slug", "competitions", ["slug"], unique=True)
    op.create_index("ix_competitions_status", "competitions", ["status"])

    op.create_table(
        "competition_stages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("competition_id", UUID(as_uuid=True), sa.ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("stage_type", sa.String(32), nullable=False, server_default="custom"),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("scoring_rules_json", JSONB(), nullable=True),
    )
    op.create_index("ix_competition_stages_competition_id", "competition_stages", ["competition_id"])

    op.create_table(
        "competition_admins",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("competition_id", UUID(as_uuid=True), sa.ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="owner"),
        sa.UniqueConstraint("competition_id", "user_id", name="uq_competition_admin"),
    )
    op.create_index("ix_competition_admins_competition_id", "competition_admins", ["competition_id"])
    op.create_index("ix_competition_admins_user_id", "competition_admins", ["user_id"])

    op.create_table(
        "scoring_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("competition_id", UUID(as_uuid=True), sa.ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("exact_score_points", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("winner_points", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("wrong_points", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("competition_id", name="uq_scoring_rules_competition"),
    )

    op.create_table(
        "prize_distribution",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("competition_id", UUID(as_uuid=True), sa.ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("place", sa.Integer(), nullable=False),
        sa.Column("percent", sa.Numeric(5, 2), nullable=False),
        sa.UniqueConstraint("competition_id", "place", name="uq_prize_place"),
    )
    op.create_index("ix_prize_distribution_competition_id", "prize_distribution", ["competition_id"])

    op.create_table(
        "payment_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("competition_id", UUID(as_uuid=True), sa.ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contact_name", sa.String(120), nullable=True),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column("qr_path", sa.String(255), nullable=True),
        sa.Column("instructions_text", sa.Text(), nullable=True),
        sa.UniqueConstraint("competition_id", name="uq_payment_settings_competition"),
    )

    op.add_column("fixtures", sa.Column("competition_id", UUID(as_uuid=True), nullable=True))
    op.add_column("fixtures", sa.Column("stage_id", UUID(as_uuid=True), nullable=True))
    op.add_column("fixtures", sa.Column("group_label", sa.String(20), nullable=True))
    op.create_foreign_key("fk_fixtures_competition_id", "fixtures", "competitions", ["competition_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key("fk_fixtures_stage_id", "fixtures", "competition_stages", ["stage_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_fixtures_competition_id", "fixtures", ["competition_id"])

    op.add_column("groups", sa.Column("competition_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_groups_competition_id", "groups", "competitions", ["competition_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_groups_competition_id", "groups", ["competition_id"], unique=True)

    op.add_column("bets", sa.Column("competition_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_bets_competition_id", "bets", "competitions", ["competition_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_bets_competition_id", "bets", ["competition_id"])

    op.add_column("audit_logs", sa.Column("competition_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_audit_logs_competition_id", "audit_logs", "competitions", ["competition_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_audit_logs_competition_id", "audit_logs", ["competition_id"])

    op.add_column("notifications", sa.Column("competition_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_notifications_competition_id", "notifications", "competitions", ["competition_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_notifications_competition_id", "notifications", ["competition_id"])

    conn = op.get_bind()
    comp_id = uuid.uuid4()
    settings = json.dumps({
        "currency": "USD",
        "branding": {"logo_url": None, "primary_color": "#22c55e"},
    })

    conn.execute(
        sa.text(
            """
            INSERT INTO competitions (id, slug, name, sport, format_type, status, visibility, settings_json)
            VALUES (:id, :slug, :name, 'football', 'groups_knockout', 'in_progress', 'public', CAST(:settings AS jsonb))
            """
        ),
        {"id": comp_id, "slug": DEFAULT_SLUG, "name": "Mundial 2026", "settings": settings},
    )

    conn.execute(
        sa.text("UPDATE fixtures SET competition_id = :cid, group_label = group_name WHERE competition_id IS NULL"),
        {"cid": comp_id},
    )

    conn.execute(
        sa.text(
            """
            UPDATE groups SET competition_id = :cid
            WHERE id = (
                SELECT id FROM groups WHERE is_active = true ORDER BY created_at ASC LIMIT 1
            )
            """
        ),
        {"cid": comp_id},
    )

    conn.execute(
        sa.text(
            """
            UPDATE bets SET competition_id = :cid
            WHERE competition_id IS NULL
            AND fixture_id IN (SELECT id FROM fixtures WHERE competition_id = :cid)
            """
        ),
        {"cid": comp_id},
    )

    conn.execute(
        sa.text(
            """
            INSERT INTO scoring_rules (id, competition_id, exact_score_points, winner_points, wrong_points)
            VALUES (:id, :cid, 2, 1, 0)
            """
        ),
        {"id": uuid.uuid4(), "cid": comp_id},
    )

    conn.execute(
        sa.text(
            """
            INSERT INTO prize_distribution (id, competition_id, place, percent)
            VALUES (:id, :cid, 1, 100.00)
            """
        ),
        {"id": uuid.uuid4(), "cid": comp_id},
    )

    conn.execute(
        sa.text(
            """
            INSERT INTO payment_settings (id, competition_id, contact_name, phone, qr_path)
            SELECT :pid, :cid, g.payment_contact_name, g.payment_phone, g.payment_qr_path
            FROM groups g WHERE g.competition_id = :cid LIMIT 1
            """
        ),
        {"pid": uuid.uuid4(), "cid": comp_id},
    )

    conn.execute(
        sa.text(
            """
            INSERT INTO competition_admins (id, competition_id, user_id, role)
            SELECT gen_random_uuid(), :cid, u.id, 'owner'
            FROM users u
            WHERE u.is_admin = true
            AND NOT EXISTS (
                SELECT 1 FROM competition_admins ca WHERE ca.competition_id = :cid AND ca.user_id = u.id
            )
            """
        ),
        {"cid": comp_id},
    )

    _drop_fixture_external_id_unique()
    op.create_unique_constraint(
        "uq_fixtures_competition_external", "fixtures", ["competition_id", "external_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_fixtures_competition_external", "fixtures", type_="unique")
    op.create_index("ix_fixtures_external_id", "fixtures", ["external_id"], unique=True)

    op.drop_index("ix_notifications_competition_id", "notifications")
    op.drop_constraint("fk_notifications_competition_id", "notifications", type_="foreignkey")
    op.drop_column("notifications", "competition_id")

    op.drop_index("ix_audit_logs_competition_id", "audit_logs")
    op.drop_constraint("fk_audit_logs_competition_id", "audit_logs", type_="foreignkey")
    op.drop_column("audit_logs", "competition_id")

    op.drop_index("ix_bets_competition_id", "bets")
    op.drop_constraint("fk_bets_competition_id", "bets", type_="foreignkey")
    op.drop_column("bets", "competition_id")

    op.drop_index("ix_groups_competition_id", "groups")
    op.drop_constraint("fk_groups_competition_id", "groups", type_="foreignkey")
    op.drop_column("groups", "competition_id")

    op.drop_index("ix_fixtures_competition_id", "fixtures")
    op.drop_constraint("fk_fixtures_stage_id", "fixtures", type_="foreignkey")
    op.drop_constraint("fk_fixtures_competition_id", "fixtures", type_="foreignkey")
    op.drop_column("fixtures", "group_label")
    op.drop_column("fixtures", "stage_id")
    op.drop_column("fixtures", "competition_id")

    op.drop_table("payment_settings")
    op.drop_table("prize_distribution")
    op.drop_table("scoring_rules")
    op.drop_table("competition_admins")
    op.drop_table("competition_stages")
    op.drop_index("ix_competitions_status", "competitions")
    op.drop_index("ix_competitions_slug", "competitions")
    op.drop_table("competitions")
