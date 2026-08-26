"""add vehicle_ownerships table and backfill

Revision ID: 0014_vehicle_ownerships
Revises: 0013_apple_sub
Create Date: 2026-08-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0014_vehicle_ownerships"
down_revision = "0013_apple_sub"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vehicle_ownerships",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("vehicle_id", sa.String(36), sa.ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ordinal", sa.Integer, nullable=False),
        sa.Column("owner_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("label", sa.String(160), nullable=True),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("start_mileage", sa.Integer, nullable=True),
        sa.Column("end_date", sa.Date, nullable=True),
        sa.Column("end_mileage", sa.Integer, nullable=True),
        sa.Column("show_owner_name", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("vehicle_id", "ordinal", name="uq_vehicle_ownership_ordinal"),
    )
    op.create_index("idx_vehicle_ownerships_vehicle_id", "vehicle_ownerships", ["vehicle_id"])

    # Backfill: one current-owner period per vehicle
    # start_date = purchase_date, else the earliest known date (first event or row creation)
    # Uses PostgreSQL gen_random_uuid() — this migration targets Cloud SQL Postgres only
    op.execute(
        """
        INSERT INTO vehicle_ownerships (
            id, vehicle_id, ordinal, owner_user_id, label,
            start_date, start_mileage, end_date, end_mileage,
            show_owner_name, created_by, created_at, updated_at
        )
        SELECT
            gen_random_uuid()::text,
            v.id,
            1,
            v.owner_user_id,
            NULL,
            COALESCE(
                v.purchase_date,
                LEAST(v.created_at::date, (SELECT MIN(e.event_date) FROM vehicle_events e WHERE e.vehicle_id = v.id)),
                v.created_at::date
            ),
            v.mileage,
            NULL,
            NULL,
            true,
            v.owner_user_id,
            now(),
            now()
        FROM vehicles v
        """
    )


def downgrade() -> None:
    op.drop_index("idx_vehicle_ownerships_vehicle_id", table_name="vehicle_ownerships")
    op.drop_table("vehicle_ownerships")
