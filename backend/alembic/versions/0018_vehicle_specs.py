"""add specs and specs_decoded_at to vehicles

Revision ID: 0018_vehicle_specs
Revises: 0017_vehicle_transfers
Create Date: 2026-08-26

Adds:
  vehicles.specs: JSON nullable — decoded VIN specs dict
  vehicles.specs_decoded_at: timestamptz nullable — when specs were last decoded
"""
from alembic import op
import sqlalchemy as sa

revision = "0018_vehicle_specs"
down_revision = "0017_vehicle_transfers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vehicles", sa.Column("specs", sa.JSON(), nullable=True))
    op.add_column(
        "vehicles",
        sa.Column("specs_decoded_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("vehicles", "specs_decoded_at")
    op.drop_column("vehicles", "specs")
