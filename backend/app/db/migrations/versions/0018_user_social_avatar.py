"""User social moderation, avatars, comment mentions."""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "0018_user_social_avatar"
down_revision = "0017_social"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("social_muted_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("social_spam_strikes", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "users",
        sa.Column("avatar_preset", sa.String(32), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("avatar_url", sa.String(512), nullable=True),
    )

    op.create_table(
        "fixture_comment_mentions",
        sa.Column("comment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("fixture_comments.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("mentioned_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("ix_fixture_comment_mentions_user", "fixture_comment_mentions", ["mentioned_user_id"])


def downgrade() -> None:
    op.drop_index("ix_fixture_comment_mentions_user", table_name="fixture_comment_mentions")
    op.drop_table("fixture_comment_mentions")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "avatar_preset")
    op.drop_column("users", "social_spam_strikes")
    op.drop_column("users", "social_muted_until")
