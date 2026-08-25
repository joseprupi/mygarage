"""user settings JSON column

Revision ID: 0012_user_settings
Revises: 0011_fuel_gap_flags
Create Date: 2026-08-23
"""
from alembic import op
import sqlalchemy as sa

revision = "0012_user_settings"
down_revision = "0011_fuel_gap_flags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("settings", sa.JSON(), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("users", "settings")
