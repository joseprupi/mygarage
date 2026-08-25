"""add apple_sub column to users

Revision ID: 0013_apple_sub
Revises: 0012_user_settings
Create Date: 2026-08-25
"""
from alembic import op
import sqlalchemy as sa

revision = "0013_apple_sub"
down_revision = "0012_user_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("apple_sub", sa.String(255), nullable=True, unique=True),
    )
    op.create_index("ix_users_apple_sub", "users", ["apple_sub"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_apple_sub", table_name="users")
    op.drop_column("users", "apple_sub")
