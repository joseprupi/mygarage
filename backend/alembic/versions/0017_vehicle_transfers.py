"""add vehicle_transfers table and hidden flag on vehicle_events

Revision ID: 0017_vehicle_transfers
Revises: 0016_reports_and_blocks
Create Date: 2026-08-26

Adds:
  vehicle_transfers: ownership transfer codes/flow
  vehicle_events.hidden: current owner can hide events from public view
"""
from alembic import op
import sqlalchemy as sa

revision = "0017_vehicle_transfers"
down_revision = "0016_reports_and_blocks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vehicle_transfers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("vehicle_id", sa.String(36), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("from_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("to_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("code", sa.String(10), nullable=False, unique=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("handover_date", sa.Date, nullable=False),
        sa.Column("handover_mileage", sa.Integer, nullable=True),
        sa.Column("show_owner_name", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("keep_documents", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("keep_posts_tagged", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status in ('pending','accepted','revoked','expired')",
            name="ck_vehicle_transfer_status",
        ),
    )
    op.create_index("idx_vehicle_transfers_vehicle_id", "vehicle_transfers", ["vehicle_id"])
    op.create_index("idx_vehicle_transfers_code", "vehicle_transfers", ["code"])

    # Hidden flag on events — current owner can suppress from public view
    op.add_column(
        "vehicle_events",
        sa.Column("hidden", sa.Boolean, nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("vehicle_events", "hidden")
    op.drop_index("idx_vehicle_transfers_code", table_name="vehicle_transfers")
    op.drop_index("idx_vehicle_transfers_vehicle_id", table_name="vehicle_transfers")
    op.drop_table("vehicle_transfers")
