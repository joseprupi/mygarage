import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Float,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def uuid_str() -> str:
    return str(uuid.uuid4())


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    username: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(120))
    bio: Mapped[str | None] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(160))
    settings: Mapped[dict] = mapped_column(JSON, nullable=False, server_default="{}", default=dict)
    apple_sub: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)

    vehicles: Mapped[list["Vehicle"]] = relationship(back_populates="owner")
    posts: Mapped[list["Post"]] = relationship(back_populates="author")


class Vehicle(TimestampMixin, Base):
    __tablename__ = "vehicles"
    __table_args__ = (
        CheckConstraint("visibility in ('public', 'private', 'unlisted')", name="ck_vehicle_visibility"),
        Index("idx_vehicles_owner_user_id", "owner_user_id"),
        Index("idx_vehicles_make_model_year", "make", "model", "year"),
        Index("idx_vehicles_visibility", "visibility"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    make: Mapped[str] = mapped_column(String(80), nullable=False)
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    year: Mapped[int | None] = mapped_column(Integer)
    trim: Mapped[str | None] = mapped_column(String(120))
    nickname: Mapped[str | None] = mapped_column(String(120))
    slug: Mapped[str | None] = mapped_column(String(160), index=True)
    vin: Mapped[str | None] = mapped_column(String(32))
    mileage: Mapped[int | None] = mapped_column(Integer)
    purchase_date: Mapped[date | None] = mapped_column(Date)
    color: Mapped[str | None] = mapped_column(String(80))
    transmission: Mapped[str | None] = mapped_column(String(80))
    engine: Mapped[str | None] = mapped_column(String(120))
    drivetrain: Mapped[str | None] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(Text)
    cover_image_url: Mapped[str | None] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(String(20), default="public", nullable=False)

    owner: Mapped[User] = relationship(back_populates="vehicles")
    tags: Mapped[list["PostVehicleTag"]] = relationship(back_populates="vehicle")
    events: Mapped[list["VehicleEvent"]] = relationship(back_populates="vehicle")
    mods: Mapped[list["VehicleMod"]] = relationship(back_populates="vehicle")
    ownerships: Mapped[list["VehicleOwnership"]] = relationship(
        back_populates="vehicle",
        cascade="all, delete-orphan",
        foreign_keys="VehicleOwnership.vehicle_id",
    )


class Post(TimestampMixin, Base):
    __tablename__ = "posts"
    __table_args__ = (
        CheckConstraint("visibility in ('public', 'private', 'unlisted')", name="ck_post_visibility"),
        Index("idx_posts_created_at", "created_at"),
        Index("idx_posts_author_user_id", "author_user_id"),
        Index("idx_posts_visibility_deleted", "visibility", "deleted_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    author_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    caption: Mapped[str | None] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(String(20), default="public", nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    author: Mapped[User] = relationship(back_populates="posts")
    media: Mapped[list["PostMedia"]] = relationship(
        back_populates="post", cascade="all, delete-orphan", order_by="PostMedia.sort_order"
    )
    vehicle_tags: Mapped[list["PostVehicleTag"]] = relationship(
        back_populates="post", cascade="all, delete-orphan"
    )
    comments: Mapped[list["Comment"]] = relationship(back_populates="post")


class PostMedia(Base):
    __tablename__ = "post_media"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    post_id: Mapped[str] = mapped_column(ForeignKey("posts.id"), nullable=False)
    media_type: Mapped[str] = mapped_column(String(20), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    post: Mapped[Post] = relationship(back_populates="media")


class PostVehicleTag(Base):
    __tablename__ = "post_vehicle_tags"
    __table_args__ = (
        Index("idx_post_vehicle_tags_vehicle_id", "vehicle_id"),
        Index("idx_post_vehicle_tags_post_id", "post_id"),
    )

    post_id: Mapped[str] = mapped_column(ForeignKey("posts.id"), primary_key=True)
    vehicle_id: Mapped[str] = mapped_column(ForeignKey("vehicles.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    post: Mapped[Post] = relationship(back_populates="vehicle_tags")
    vehicle: Mapped[Vehicle] = relationship(back_populates="tags")


class VehicleEvent(TimestampMixin, Base):
    __tablename__ = "vehicle_events"
    __table_args__ = (
        CheckConstraint(
            "event_type in ('purchase', 'sale', 'repair', 'maintenance', 'upgrade', "
            "'inspection', 'detailing', 'fuel', 'track_day', 'road_trip', 'accident', 'note', 'other')",
            name="ck_vehicle_event_type",
        ),
        CheckConstraint("visibility in ('public', 'private')", name="ck_vehicle_event_visibility"),
        Index("idx_vehicle_events_vehicle_date", "vehicle_id", "event_date"),
        Index("idx_vehicle_events_vehicle_created", "vehicle_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    vehicle_id: Mapped[str] = mapped_column(ForeignKey("vehicles.id"), nullable=False)
    author_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    event_date: Mapped[date | None] = mapped_column(Date)
    mileage: Mapped[int | None] = mapped_column(Integer)
    cost_cents: Mapped[int | None] = mapped_column(Integer)
    fuel_gallons: Mapped[float | None] = mapped_column(Float)
    fuel_price_cents: Mapped[int | None] = mapped_column(Integer)
    fuel_full_tank: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=true())
    fuel_missed_previous: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    shop_name: Mapped[str | None] = mapped_column(String(160))
    location: Mapped[str | None] = mapped_column(String(160))
    visibility: Mapped[str] = mapped_column(String(20), default="public", nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Provenance
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual", server_default="manual")
    scan_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    edited_fields: Mapped[list] = mapped_column(JSON, nullable=True, default=list)

    vehicle: Mapped[Vehicle] = relationship(back_populates="events")
    media: Mapped[list["VehicleEventMedia"]] = relationship(
        back_populates="event", cascade="all, delete-orphan", order_by="VehicleEventMedia.sort_order"
    )
    documents: Mapped[list["VehicleEventDocument"]] = relationship(
        back_populates="event", cascade="all, delete-orphan", order_by="VehicleEventDocument.sort_order"
    )


class VehicleEventMedia(Base):
    __tablename__ = "vehicle_event_media"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    vehicle_event_id: Mapped[str] = mapped_column(ForeignKey("vehicle_events.id"), nullable=False)
    media_type: Mapped[str] = mapped_column(String(20), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Media privacy — receipts/docs private by default
    is_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    pii_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unknown", server_default="unknown"
    )
    pii_kinds: Mapped[list] = mapped_column(JSON, nullable=True, default=list)
    blur_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # storage_key: bucket-relative key in the private bucket (None for legacy rows)
    storage_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    event: Mapped[VehicleEvent] = relationship(back_populates="media")


class VehicleEventDocument(Base):
    __tablename__ = "vehicle_event_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    vehicle_event_id: Mapped[str] = mapped_column(ForeignKey("vehicle_events.id"), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Document privacy — private by default
    is_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    pii_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unknown", server_default="unknown"
    )
    pii_kinds: Mapped[list] = mapped_column(JSON, nullable=True, default=list)
    blur_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # storage_key: bucket-relative key in the private bucket (None for legacy rows)
    storage_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    event: Mapped[VehicleEvent] = relationship(back_populates="documents")


class VehicleMod(TimestampMixin, Base):
    __tablename__ = "vehicle_mods"
    __table_args__ = (
        Index("idx_vehicle_mods_vehicle_category_sort", "vehicle_id", "category", "sort_order"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    vehicle_id: Mapped[str] = mapped_column(ForeignKey("vehicles.id"), nullable=False)
    author_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(120))
    cost_cents: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    link: Mapped[str | None] = mapped_column(String(500))
    installed_date: Mapped[date | None] = mapped_column(Date)
    mileage: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    vehicle: Mapped[Vehicle] = relationship(back_populates="mods")
    media: Mapped[list["VehicleModMedia"]] = relationship(
        back_populates="mod", cascade="all, delete-orphan", order_by="VehicleModMedia.sort_order"
    )


class VehicleModMedia(Base):
    __tablename__ = "vehicle_mod_media"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    vehicle_mod_id: Mapped[str] = mapped_column(ForeignKey("vehicle_mods.id"), nullable=False)
    media_type: Mapped[str] = mapped_column(String(20), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    mod: Mapped[VehicleMod] = relationship(back_populates="media")


class PostLike(Base):
    __tablename__ = "post_likes"

    post_id: Mapped[str] = mapped_column(ForeignKey("posts.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Comment(TimestampMixin, Base):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    post_id: Mapped[str] = mapped_column(ForeignKey("posts.id"), nullable=False)
    author_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    parent_comment_id: Mapped[str | None] = mapped_column(ForeignKey("comments.id"))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    post: Mapped[Post] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()


class CommentLike(Base):
    __tablename__ = "comment_likes"

    comment_id: Mapped[str] = mapped_column(ForeignKey("comments.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class VehicleOwnership(TimestampMixin, Base):
    __tablename__ = "vehicle_ownerships"
    __table_args__ = (
        UniqueConstraint("vehicle_id", "ordinal", name="uq_vehicle_ownership_ordinal"),
        Index("idx_vehicle_ownerships_vehicle_id", "vehicle_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    vehicle_id: Mapped[str] = mapped_column(ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    owner_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    label: Mapped[str | None] = mapped_column(String(160), nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    show_owner_name: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="ownerships", foreign_keys=[vehicle_id])
    owner_user: Mapped["User | None"] = relationship(foreign_keys=[owner_user_id])


class Follow(Base):
    __tablename__ = "follows"
    __table_args__ = (
        CheckConstraint(
            "(followed_user_id is not null and followed_vehicle_id is null) or "
            "(followed_user_id is null and followed_vehicle_id is not null)",
            name="ck_follow_one_target",
        ),
        UniqueConstraint("follower_user_id", "followed_user_id", name="uq_follow_user"),
        UniqueConstraint("follower_user_id", "followed_vehicle_id", name="uq_follow_vehicle"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    follower_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    followed_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    followed_vehicle_id: Mapped[str | None] = mapped_column(ForeignKey("vehicles.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
