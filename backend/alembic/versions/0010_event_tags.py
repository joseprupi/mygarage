"""service tags on vehicle_events (JSON list; AI-assigned on receipt scan)

Revision ID: 0010_event_tags
Revises: 0009_fuel_fields
Create Date: 2026-08-22
"""
from alembic import op
import sqlalchemy as sa

revision = "0010_event_tags"
down_revision = "0009_fuel_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vehicle_events", sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("vehicle_events", "tags")
