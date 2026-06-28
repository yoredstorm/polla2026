"""Live sync: fixture sync fields, sync logs, global settings."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "fixtures",
        sa.Column("sync_mode", sa.String(20), nullable=False, server_default="auto"),
    )
    op.add_column("fixtures", sa.Column("google_match_sie", sa.String(500), nullable=True))
    op.add_column("fixtures", sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "fixtures",
        sa.Column("consecutive_sync_failures", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("fixtures", sa.Column("last_scraped_home", sa.Integer(), nullable=True))
    op.add_column("fixtures", sa.Column("last_scraped_away", sa.Integer(), nullable=True))
    op.add_column("fixtures", sa.Column("last_scraped_status", sa.String(50), nullable=True))
    op.add_column(
        "fixtures",
        sa.Column("sync_confirm_streak", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "fixture_sync_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "fixture_id",
            UUID(as_uuid=True),
            sa.ForeignKey("fixtures.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("polled_at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("search_url", sa.String(1000), nullable=True),
        sa.Column("google_match_sie", sa.String(500), nullable=True),
        sa.Column("parsed_home", sa.Integer(), nullable=True),
        sa.Column("parsed_away", sa.Integer(), nullable=True),
        sa.Column("parsed_status", sa.String(50), nullable=True),
        sa.Column("parsed_minute", sa.Integer(), nullable=True),
        sa.Column("raw_payload", JSONB(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("action_taken", sa.String(30), nullable=False, server_default="none"),
        sa.Column("response_ms", sa.Integer(), nullable=True),
    )

    op.create_table(
        "live_sync_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "poll_interval_seconds",
            sa.Integer(),
            nullable=False,
            server_default="5",
        ),
        sa.Column(
            "pre_kickoff_minutes",
            sa.Integer(),
            nullable=False,
            server_default="10",
        ),
        sa.Column(
            "max_concurrent_polls",
            sa.Integer(),
            nullable=False,
            server_default="3",
        ),
        sa.Column(
            "failure_threshold",
            sa.Integer(),
            nullable=False,
            server_default="6",
        ),
        sa.Column(
            "confirm_reads_required",
            sa.Integer(),
            nullable=False,
            server_default="2",
        ),
        sa.Column(
            "sync_enabled_globally",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.execute(sa.text("INSERT INTO live_sync_settings (id) VALUES (1)"))


def downgrade() -> None:
    op.drop_table("live_sync_settings")
    op.drop_table("fixture_sync_logs")
    op.drop_column("fixtures", "sync_confirm_streak")
    op.drop_column("fixtures", "last_scraped_status")
    op.drop_column("fixtures", "last_scraped_away")
    op.drop_column("fixtures", "last_scraped_home")
    op.drop_column("fixtures", "consecutive_sync_failures")
    op.drop_column("fixtures", "last_sync_at")
    op.drop_column("fixtures", "google_match_sie")
    op.drop_column("fixtures", "sync_mode")
