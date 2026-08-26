"""add media privacy, private storage, and event provenance

Revision ID: 0015_media_privacy
Revises: 0014_vehicle_ownerships
Create Date: 2026-08-26

Adds:
  vehicle_event_media / vehicle_event_documents:
    is_public (bool, default false), pii_status (str, default 'unknown'),
    pii_kinds (json, nullable), blur_url (text, nullable),
    storage_key (text, nullable) — bucket-relative key in the private bucket.

  vehicle_events:
    source (str, default 'manual'), scan_snapshot (json, nullable),
    edited_fields (json, default []).
"""
from alembic import op
import sqlalchemy as sa

revision = "0015_media_privacy"
down_revision = "0014_vehicle_ownerships"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- vehicle_event_media and vehicle_event_documents ---
    for table in ("vehicle_event_media", "vehicle_event_documents"):
        op.add_column(
            table,
            sa.Column("is_public", sa.Boolean, nullable=False, server_default=sa.text("false")),
        )
        op.add_column(
            table,
            sa.Column(
                "pii_status",
                sa.String(20),
                nullable=False,
                server_default=sa.text("'unknown'"),
            ),
        )
        op.add_column(table, sa.Column("pii_kinds", sa.JSON, nullable=True))
        op.add_column(table, sa.Column("blur_url", sa.Text, nullable=True))
        op.add_column(table, sa.Column("storage_key", sa.Text, nullable=True))

    # --- vehicle_events provenance ---
    op.add_column(
        "vehicle_events",
        sa.Column(
            "source",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'manual'"),
        ),
    )
    op.add_column("vehicle_events", sa.Column("scan_snapshot", sa.JSON, nullable=True))
    op.add_column(
        "vehicle_events",
        sa.Column("edited_fields", sa.JSON, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("vehicle_events", "edited_fields")
    op.drop_column("vehicle_events", "scan_snapshot")
    op.drop_column("vehicle_events", "source")
    for table in ("vehicle_event_media", "vehicle_event_documents"):
        op.drop_column(table, "storage_key")
        op.drop_column(table, "blur_url")
        op.drop_column(table, "pii_kinds")
        op.drop_column(table, "pii_status")
        op.drop_column(table, "is_public")
