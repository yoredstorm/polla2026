"""jwt_signing_keys table for JWT key rotation

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-16 12:00:00.000000
"""
import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "jwt_signing_keys",
        sa.Column("kid", sa.String(64), primary_key=True),
        sa.Column("purpose", sa.String(16), nullable=False),
        sa.Column("secret", sa.String(512), nullable=False),
        sa.Column("active_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_jwt_signing_keys_purpose", "jwt_signing_keys", ["purpose"])
    op.create_index(
        "ix_jwt_signing_keys_purpose_active",
        "jwt_signing_keys",
        ["purpose", "active_from"],
    )


def downgrade() -> None:
    op.drop_index("ix_jwt_signing_keys_purpose_active", table_name="jwt_signing_keys")
    op.drop_index("ix_jwt_signing_keys_purpose", table_name="jwt_signing_keys")
    op.drop_table("jwt_signing_keys")
