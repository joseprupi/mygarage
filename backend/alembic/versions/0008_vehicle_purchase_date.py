"""add purchase_date to vehicles (pairs with initial mileage; feeds mileage chart)

Revision ID: 0008_vehicle_purchase_date
Revises: 0007_fuel_event_type
Create Date: 2026-08-03
"""
from alembic import op
import sqlalchemy as sa

revision = "0008_vehicle_purchase_date"
down_revision = "0007_fuel_event_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vehicles", sa.Column("purchase_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("vehicles", "purchase_date")
