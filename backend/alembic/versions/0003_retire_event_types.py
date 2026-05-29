"""retire track_day + road_trip event types -> other

Revision ID: 0003_retire_event_types
Revises: 0002_comment_likes
Create Date: 2026-05-29
"""
from alembic import op

revision = "0003_retire_event_types"
down_revision = "0002_comment_likes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE vehicle_events SET event_type='other' "
        "WHERE event_type IN ('track_day','road_trip')"
    )


def downgrade() -> None:
    # Data migration: original per-row types are not recoverable.
    pass
