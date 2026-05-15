"""Drop unique constraint on bets(user_id, fixture_id, group_id) to allow multiple extras

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-15 09:00:00.000000
"""
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_bet_user_fixture_group", "bets", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("uq_bet_user_fixture_group", "bets", ["user_id", "fixture_id", "group_id"])
