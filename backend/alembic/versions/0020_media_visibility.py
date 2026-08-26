"""Replace redaction_status with visibility enum on vehicle_event_media.

Revision ID: 0020_media_visibility
Revises: 0019_media_redaction
Create Date: 2026-08-26

Changes on vehicle_event_media:
  ADD visibility varchar(20) NOT NULL default 'private'
  BACKFILL: is_public=true → 'original';
            redaction_status='published' → 'redacted';
            else 'private'.
  DROP redaction_status (derived: 'ready' when redacted_url set — no longer needed)
  DROP redaction_reviewed_at (unused after simplification)
  KEEP is_public (documents still use it), redaction_boxes, redacted_url,
       pii_status, pii_kinds, blur_url.
"""
from alembic import op
import sqlalchemy as sa

revision = "0020_media_visibility"
down_revision = "0019_media_redaction"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add visibility column (nullable first for backfill)
    op.add_column(
        "vehicle_event_media",
        sa.Column("visibility", sa.String(20), nullable=True),
    )

    # 2. Backfill from existing is_public / redaction_status
    op.execute("""
        UPDATE vehicle_event_media
        SET visibility = CASE
            WHEN is_public = true THEN 'original'
            WHEN redaction_status = 'published' THEN 'redacted'
            ELSE 'private'
        END
    """)

    # 3. Set NOT NULL + default
    op.alter_column("vehicle_event_media", "visibility", nullable=False, server_default="private")

    # 4. Drop the old redaction_status and redaction_reviewed_at columns
    op.drop_column("vehicle_event_media", "redaction_status")
    op.drop_column("vehicle_event_media", "redaction_reviewed_at")


def downgrade() -> None:
    op.add_column(
        "vehicle_event_media",
        sa.Column(
            "redaction_status",
            sa.String(20),
            nullable=False,
            server_default="none",
        ),
    )
    op.add_column(
        "vehicle_event_media",
        sa.Column("redaction_reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Best-effort back-populate redaction_status
    op.execute("""
        UPDATE vehicle_event_media
        SET redaction_status = CASE
            WHEN visibility = 'redacted' THEN 'published'
            WHEN redacted_url IS NOT NULL THEN 'proposed'
            ELSE 'none'
        END
    """)
    op.drop_column("vehicle_event_media", "visibility")
