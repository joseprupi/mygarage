"""Add per-receipt PII redaction fields to vehicle_event_media

Revision ID: 0019_media_redaction
Revises: 0018_vehicle_specs
Create Date: 2026-08-26

Adds to vehicle_event_media (images only; documents out of scope):
  redaction_status  varchar(20)  NOT NULL default 'none'  ('none'|'proposed'|'published')
  redaction_boxes   JSON         nullable  [{kind, box:[ymin,xmin,ymax,xmax], source:'ai'|'user'}]
  redacted_url      text         nullable  public-bucket URL of the published redacted copy
  redaction_reviewed_at  timestamptz  nullable  when owner published the redaction
"""
from alembic import op
import sqlalchemy as sa

revision = "0019_media_redaction"
down_revision = "0018_vehicle_specs"
branch_labels = None
depends_on = None


def upgrade() -> None:
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
        sa.Column("redaction_boxes", sa.JSON(), nullable=True),
    )
    op.add_column(
        "vehicle_event_media",
        sa.Column("redacted_url", sa.Text(), nullable=True),
    )
    op.add_column(
        "vehicle_event_media",
        sa.Column(
            "redaction_reviewed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("vehicle_event_media", "redaction_reviewed_at")
    op.drop_column("vehicle_event_media", "redacted_url")
    op.drop_column("vehicle_event_media", "redaction_boxes")
    op.drop_column("vehicle_event_media", "redaction_status")
