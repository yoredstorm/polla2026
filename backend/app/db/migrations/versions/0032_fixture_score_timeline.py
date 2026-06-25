"""Add score_timeline JSON to fixtures for live match tracking."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "fixtures",
        sa.Column("score_timeline", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("fixtures", "score_timeline")
