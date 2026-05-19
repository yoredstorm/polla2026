"""Add first_name and last_name to users."""
import sqlalchemy as sa
from alembic import op

revision = "0019_user_first_last_name"
down_revision = "0018_user_social_avatar"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("first_name", sa.String(80), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(80), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
