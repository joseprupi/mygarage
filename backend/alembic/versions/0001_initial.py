"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-03
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("username", sa.String(length=40), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=120)),
        sa.Column("bio", sa.Text()),
        sa.Column("avatar_url", sa.Text()),
        sa.Column("location", sa.String(length=160)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "vehicles",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("owner_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("make", sa.String(length=80), nullable=False),
        sa.Column("model", sa.String(length=80), nullable=False),
        sa.Column("year", sa.Integer()),
        sa.Column("trim", sa.String(length=120)),
        sa.Column("nickname", sa.String(length=120)),
        sa.Column("slug", sa.String(length=160)),
        sa.Column("vin", sa.String(length=32)),
        sa.Column("mileage", sa.Integer()),
        sa.Column("color", sa.String(length=80)),
        sa.Column("transmission", sa.String(length=80)),
        sa.Column("engine", sa.String(length=120)),
        sa.Column("drivetrain", sa.String(length=80)),
        sa.Column("description", sa.Text()),
        sa.Column("cover_image_url", sa.Text()),
        sa.Column("visibility", sa.String(length=20), nullable=False, server_default="public"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("visibility in ('public', 'private', 'unlisted')", name="ck_vehicle_visibility"),
    )
    op.create_index("idx_vehicles_owner_user_id", "vehicles", ["owner_user_id"])
    op.create_index("idx_vehicles_make_model_year", "vehicles", ["make", "model", "year"])
    op.create_index("idx_vehicles_visibility", "vehicles", ["visibility"])
    op.create_index("ix_vehicles_slug", "vehicles", ["slug"])

    op.create_table(
        "posts",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("author_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("caption", sa.Text()),
        sa.Column("visibility", sa.String(length=20), nullable=False, server_default="public"),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("visibility in ('public', 'private', 'unlisted')", name="ck_post_visibility"),
    )
    op.create_index("idx_posts_created_at", "posts", [sa.text("created_at DESC")])
    op.create_index("idx_posts_author_user_id", "posts", ["author_user_id"])
    op.create_index("idx_posts_visibility_deleted", "posts", ["visibility", "deleted_at", sa.text("created_at DESC")])

    op.create_table(
        "post_media",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("post_id", sa.String(length=36), sa.ForeignKey("posts.id"), nullable=False),
        sa.Column("media_type", sa.String(length=20), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("thumbnail_url", sa.Text()),
        sa.Column("width", sa.Integer()),
        sa.Column("height", sa.Integer()),
        sa.Column("duration_seconds", sa.Integer()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "post_vehicle_tags",
        sa.Column("post_id", sa.String(length=36), sa.ForeignKey("posts.id"), primary_key=True),
        sa.Column("vehicle_id", sa.String(length=36), sa.ForeignKey("vehicles.id"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_post_vehicle_tags_vehicle_id", "post_vehicle_tags", ["vehicle_id"])
    op.create_index("idx_post_vehicle_tags_post_id", "post_vehicle_tags", ["post_id"])

    op.create_table(
        "vehicle_events",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("vehicle_id", sa.String(length=36), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("author_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("event_type", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("event_date", sa.Date()),
        sa.Column("mileage", sa.Integer()),
        sa.Column("cost_cents", sa.Integer()),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="USD"),
        sa.Column("shop_name", sa.String(length=160)),
        sa.Column("location", sa.String(length=160)),
        sa.Column("visibility", sa.String(length=20), nullable=False, server_default="public"),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("visibility in ('public', 'private')", name="ck_vehicle_event_visibility"),
        sa.CheckConstraint(
            "event_type in ('purchase', 'sale', 'repair', 'maintenance', 'upgrade', "
            "'inspection', 'detailing', 'track_day', 'road_trip', 'accident', 'note', 'other')",
            name="ck_vehicle_event_type",
        ),
    )
    op.create_index("idx_vehicle_events_vehicle_date", "vehicle_events", ["vehicle_id", sa.text("event_date DESC")])
    op.create_index("idx_vehicle_events_vehicle_created", "vehicle_events", ["vehicle_id", sa.text("created_at DESC")])

    op.create_table(
        "vehicle_event_media",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("vehicle_event_id", sa.String(length=36), sa.ForeignKey("vehicle_events.id"), nullable=False),
        sa.Column("media_type", sa.String(length=20), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("thumbnail_url", sa.Text()),
        sa.Column("width", sa.Integer()),
        sa.Column("height", sa.Integer()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "post_likes",
        sa.Column("post_id", sa.String(length=36), sa.ForeignKey("posts.id"), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "comments",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("post_id", sa.String(length=36), sa.ForeignKey("posts.id"), nullable=False),
        sa.Column("author_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("parent_comment_id", sa.String(length=36), sa.ForeignKey("comments.id")),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "follows",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("follower_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("followed_user_id", sa.String(length=36), sa.ForeignKey("users.id")),
        sa.Column("followed_vehicle_id", sa.String(length=36), sa.ForeignKey("vehicles.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "(followed_user_id is not null and followed_vehicle_id is null) or "
            "(followed_user_id is null and followed_vehicle_id is not null)",
            name="ck_follow_one_target",
        ),
        sa.UniqueConstraint("follower_user_id", "followed_user_id", name="uq_follow_user"),
        sa.UniqueConstraint("follower_user_id", "followed_vehicle_id", name="uq_follow_vehicle"),
    )


def downgrade() -> None:
    for table in [
        "follows",
        "comments",
        "post_likes",
        "vehicle_event_media",
        "vehicle_events",
        "post_vehicle_tags",
        "post_media",
        "posts",
        "vehicles",
        "users",
    ]:
        op.drop_table(table)
