"""add 'fuel' to the vehicle event type check constraint

Revision ID: 0007_fuel_event_type
Revises: 0006_mod_mileage_media
Create Date: 2026-08-03
"""
from alembic import op

revision = "0007_fuel_event_type"
down_revision = "0006_mod_mileage_media"
branch_labels = None
depends_on = None

_WITH_FUEL = (
    "event_type in ('purchase', 'sale', 'repair', 'maintenance', 'upgrade', "
    "'inspection', 'detailing', 'fuel', 'track_day', 'road_trip', 'accident', 'note', 'other')"
)
_WITHOUT_FUEL = (
    "event_type in ('purchase', 'sale', 'repair', 'maintenance', 'upgrade', "
    "'inspection', 'detailing', 'track_day', 'road_trip', 'accident', 'note', 'other')"
)


def upgrade() -> None:
    op.drop_constraint("ck_vehicle_event_type", "vehicle_events", type_="check")
    op.create_check_constraint("ck_vehicle_event_type", "vehicle_events", _WITH_FUEL)


def downgrade() -> None:
    op.drop_constraint("ck_vehicle_event_type", "vehicle_events", type_="check")
    op.create_check_constraint("ck_vehicle_event_type", "vehicle_events", _WITHOUT_FUEL)
