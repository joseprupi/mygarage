"""structured fuel fields on vehicle_events (gallons + price) for stats/MPG

Revision ID: 0009_fuel_fields
Revises: 0008_vehicle_purchase_date
Create Date: 2026-08-03
"""
from alembic import op
import sqlalchemy as sa

revision = "0009_fuel_fields"
down_revision = "0008_vehicle_purchase_date"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vehicle_events", sa.Column("fuel_gallons", sa.Float(), nullable=True))
    op.add_column("vehicle_events", sa.Column("fuel_price_cents", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("vehicle_events", "fuel_price_cents")
    op.drop_column("vehicle_events", "fuel_gallons")
