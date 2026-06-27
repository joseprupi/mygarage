"""add vehicle_mods (build sheet / mods list)

Revision ID: 0005_vehicle_mods
Revises: 0004_vehicle_event_documents
Create Date: 2026-06-27
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_vehicle_mods"
down_revision = "0004_vehicle_event_documents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vehicle_mods",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("vehicle_id", sa.String(length=36), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("author_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("brand", sa.String(length=120), nullable=True),
        sa.Column("cost_cents", sa.Integer(), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="USD"),
        sa.Column("link", sa.String(length=500), nullable=True),
        sa.Column("installed_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "idx_vehicle_mods_vehicle_category_sort",
        "vehicle_mods",
        ["vehicle_id", "category", "sort_order"],
    )


def downgrade() -> None:
    op.drop_index("idx_vehicle_mods_vehicle_category_sort", table_name="vehicle_mods")
    op.drop_table("vehicle_mods")
