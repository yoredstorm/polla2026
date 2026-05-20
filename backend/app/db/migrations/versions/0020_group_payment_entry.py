"""Group payment config and entry payment proofs."""
import sqlalchemy as sa
from alembic import op

revision = "0020_group_payment_entry"
down_revision = "0019_user_first_last_name"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("groups", sa.Column("payment_contact_name", sa.String(120), nullable=True))
    op.add_column("groups", sa.Column("payment_phone", sa.String(30), nullable=True))
    op.add_column("groups", sa.Column("payment_qr_path", sa.String(255), nullable=True))

    op.create_table(
        "group_entry_proofs",
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("file_path", sa.String(255), nullable=False),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "user_id"),
    )


def downgrade() -> None:
    op.drop_table("group_entry_proofs")
    op.drop_column("groups", "payment_qr_path")
    op.drop_column("groups", "payment_phone")
    op.drop_column("groups", "payment_contact_name")
