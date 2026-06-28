"""add mileage + photo attachments to vehicle_mods (mods on the timeline)

Revision ID: 0006_mod_mileage_media
Revises: 0005_vehicle_mods
Create Date: 2026-06-27
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_mod_mileage_media"
down_revision = "0005_vehicle_mods"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vehicle_mods", sa.Column("mileage", sa.Integer(), nullable=True))
    op.create_table(
        "vehicle_mod_media",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "vehicle_mod_id",
            sa.String(length=36),
            sa.ForeignKey("vehicle_mods.id"),
            nullable=False,
        ),
        sa.Column("media_type", sa.String(length=20), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("thumbnail_url", sa.Text(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "idx_vehicle_mod_media_mod_id",
        "vehicle_mod_media",
        ["vehicle_mod_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_vehicle_mod_media_mod_id", table_name="vehicle_mod_media")
    op.drop_table("vehicle_mod_media")
    op.drop_column("vehicle_mods", "mileage")
