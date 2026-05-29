"""add vehicle_event_documents (PDF attachments on events)

Revision ID: 0004_vehicle_event_documents
Revises: 0003_retire_event_types
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_vehicle_event_documents"
down_revision = "0003_retire_event_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vehicle_event_documents",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("vehicle_event_id", sa.String(length=36), sa.ForeignKey("vehicle_events.id"), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("vehicle_event_documents")
