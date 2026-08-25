"""fuel gap flags: fuel_full_tank + fuel_missed_previous on vehicle_events

Revision ID: 0011_fuel_gap_flags
Revises: 0010_event_tags
Create Date: 2026-08-23
"""
from alembic import op
import sqlalchemy as sa

revision = "0011_fuel_gap_flags"
down_revision = "0010_event_tags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "vehicle_events",
        sa.Column("fuel_full_tank", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "vehicle_events",
        sa.Column("fuel_missed_previous", sa.Boolean(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("vehicle_events", "fuel_missed_previous")
    op.drop_column("vehicle_events", "fuel_full_tank")
