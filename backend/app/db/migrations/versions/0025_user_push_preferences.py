"""Per-user Web Push category preferences."""
from alembic import op
import sqlalchemy as sa

revision = "0025_user_push_preferences"
down_revision = "0024_push_subscriptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("push_preferences", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "push_preferences")
