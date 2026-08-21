from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


Visibility = Literal["public", "private", "unlisted"]
EventVisibility = Literal["public", "private"]
MediaType = Literal["image", "video"]
EventType = Literal[
    "purchase",
    "sale",
    "repair",
    "maintenance",
    "upgrade",
    "inspection",
    "detailing",
    "fuel",
    "accident",
    "note",
    "other",
]


class TokenResponse(BaseModel):
    access_token: str = Field(alias="accessToken")
    token_type: str = "bearer"
    user: "UserRead"

    model_config = ConfigDict(populate_by_name=True)


class UserRead(BaseModel):
    id: str
    username: str
    email: EmailStr
    display_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    location: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PublicUser(BaseModel):
    id: str
    username: str
    display_name: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    location: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SignupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=120)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.lower()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=1)


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=40)
    display_name: str | None = Field(default=None, max_length=120)
    bio: str | None = Field(default=None, max_length=1000)
    avatar_url: str | None = None
    location: str | None = Field(default=None, max_length=160)


class VehicleBase(BaseModel):
    make: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=80)
    year: int | None = Field(default=None, ge=1886, le=2100)
    trim: str | None = Field(default=None, max_length=120)
    nickname: str | None = Field(default=None, max_length=120)
    vin: str | None = Field(default=None, max_length=32)
    mileage: int | None = Field(default=None, ge=0)
    purchase_date: date | None = None
    color: str | None = Field(default=None, max_length=80)
    transmission: str | None = Field(default=None, max_length=80)
    engine: str | None = Field(default=None, max_length=120)
    drivetrain: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=3000)
    cover_image_url: str | None = None
    visibility: Visibility = "public"


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    make: str | None = Field(default=None, min_length=1, max_length=80)
    model: str | None = Field(default=None, min_length=1, max_length=80)
    year: int | None = Field(default=None, ge=1886, le=2100)
    trim: str | None = Field(default=None, max_length=120)
    nickname: str | None = Field(default=None, max_length=120)
    vin: str | None = Field(default=None, max_length=32)
    mileage: int | None = Field(default=None, ge=0)
    purchase_date: date | None = None
    color: str | None = Field(default=None, max_length=80)
    transmission: str | None = Field(default=None, max_length=80)
    engine: str | None = Field(default=None, max_length=120)
    drivetrain: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=3000)
    cover_image_url: str | None = None
    visibility: Visibility | None = None


class VehicleRead(VehicleBase):
    id: str
    owner_user_id: str
    slug: str | None = None
    created_at: datetime
    updated_at: datetime
    owner: PublicUser | None = None

    model_config = ConfigDict(from_attributes=True)


class VehicleSummary(BaseModel):
    id: str
    year: int | None = None
    make: str
    model: str
    nickname: str | None = None
    cover_image_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class MediaCreate(BaseModel):
    url: str
    media_type: MediaType = "image"
    thumbnail_url: str | None = None
    width: int | None = Field(default=None, ge=1)
    height: int | None = Field(default=None, ge=1)
    duration_seconds: int | None = Field(default=None, ge=0)
    sort_order: int = Field(default=0, ge=0)


class MediaRead(MediaCreate):
    id: str
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class DocumentCreate(BaseModel):
    url: str
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(max_length=120)
    sort_order: int = Field(default=0, ge=0)


class DocumentRead(DocumentCreate):
    id: str
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class PostCreate(BaseModel):
    caption: str | None = Field(default=None, max_length=2200)
    vehicle_ids: list[str] = Field(default_factory=list, max_length=10, alias="vehicleIds")
    media: list[MediaCreate] = Field(default_factory=list, max_length=10)
    visibility: Visibility = "public"

    model_config = ConfigDict(populate_by_name=True)


class PostUpdate(BaseModel):
    caption: str | None = Field(default=None, max_length=2200)
    visibility: Visibility | None = None


class PostRead(BaseModel):
    id: str
    caption: str | None = None
    visibility: Visibility
    created_at: datetime
    updated_at: datetime
    author: PublicUser
    media: list[MediaRead] = []
    vehicles: list[VehicleSummary] = []
    like_count: int = 0
    comment_count: int = 0
    viewer_has_liked: bool = False


class CursorPage(BaseModel):
    items: list[PostRead]
    next_cursor: str | None = Field(default=None, alias="nextCursor")
    has_more: bool = Field(alias="hasMore")

    model_config = ConfigDict(populate_by_name=True)


class VehicleEventCreate(BaseModel):
    event_type: EventType = Field(alias="eventType")
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    event_date: date = Field(alias="eventDate")
    mileage: int | None = Field(default=None, ge=0)
    cost_cents: int | None = Field(default=None, ge=0, alias="costCents")
    currency: str = Field(default="USD", min_length=3, max_length=3)
    shop_name: str | None = Field(default=None, max_length=160, alias="shopName")
    location: str | None = Field(default=None, max_length=160)
    visibility: EventVisibility = "public"
    media: list[MediaCreate] = Field(default_factory=list, max_length=20)
    documents: list[DocumentCreate] = Field(default_factory=list, max_length=20)

    model_config = ConfigDict(populate_by_name=True)


class VehicleEventUpdate(BaseModel):
    event_type: EventType | None = Field(default=None, alias="eventType")
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    event_date: date | None = Field(default=None, alias="eventDate")
    mileage: int | None = Field(default=None, ge=0)
    cost_cents: int | None = Field(default=None, ge=0, alias="costCents")
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    shop_name: str | None = Field(default=None, max_length=160, alias="shopName")
    location: str | None = Field(default=None, max_length=160)
    visibility: EventVisibility | None = None
    media: list[MediaCreate] | None = Field(default=None, max_length=20)
    documents: list[DocumentCreate] | None = Field(default=None, max_length=20)

    model_config = ConfigDict(populate_by_name=True)


class VehicleEventRead(BaseModel):
    id: str
    vehicle_id: str
    author_user_id: str
    event_type: EventType
    title: str
    description: str | None = None
    event_date: date | None = None
    mileage: int | None = None
    cost_cents: int | None = None
    currency: str
    shop_name: str | None = None
    location: str | None = None
    visibility: EventVisibility
    media: list[MediaRead] = []
    documents: list[DocumentRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VehicleModCreate(BaseModel):
    category: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=160)
    brand: str | None = Field(default=None, max_length=120)
    cost_cents: int | None = Field(default=None, ge=0, alias="costCents")
    currency: str = Field(default="USD", min_length=3, max_length=3)
    link: str | None = Field(default=None, max_length=500)
    installed_date: date | None = Field(default=None, alias="installedDate")
    mileage: int | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=4000)
    sort_order: int = Field(default=0, ge=0, alias="sortOrder")
    media: list[MediaCreate] = Field(default_factory=list, max_length=20)

    model_config = ConfigDict(populate_by_name=True)


class VehicleModUpdate(BaseModel):
    category: str | None = Field(default=None, min_length=1, max_length=40)
    name: str | None = Field(default=None, min_length=1, max_length=160)
    brand: str | None = Field(default=None, max_length=120)
    cost_cents: int | None = Field(default=None, ge=0, alias="costCents")
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    link: str | None = Field(default=None, max_length=500)
    installed_date: date | None = Field(default=None, alias="installedDate")
    mileage: int | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=4000)
    sort_order: int | None = Field(default=None, ge=0, alias="sortOrder")
    media: list[MediaCreate] | None = Field(default=None, max_length=20)

    model_config = ConfigDict(populate_by_name=True)


class VehicleModRead(BaseModel):
    id: str
    vehicle_id: str
    author_user_id: str
    category: str
    name: str
    brand: str | None = None
    cost_cents: int | None = None
    currency: str
    link: str | None = None
    installed_date: date | None = None
    mileage: int | None = None
    notes: str | None = None
    sort_order: int
    media: list[MediaRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=1000)
    parent_comment_id: str | None = Field(default=None, alias="parentCommentId")

    model_config = ConfigDict(populate_by_name=True)


class CommentRead(BaseModel):
    id: str
    post_id: str
    author_user_id: str
    parent_comment_id: str | None = None
    body: str
    created_at: datetime
    updated_at: datetime
    author: PublicUser | None = None
    like_count: int = 0
    viewer_has_liked: bool = False

    model_config = ConfigDict(from_attributes=True)


class UploadUrlRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=240)
    content_type: Literal["image/jpeg", "image/png", "image/webp"] = Field(alias="contentType")
    purpose: Literal["post_media", "vehicle_cover", "vehicle_event_media", "avatar"]

    model_config = ConfigDict(populate_by_name=True)


class UploadUrlResponse(BaseModel):
    upload_url: str = Field(alias="uploadUrl")
    public_url: str = Field(alias="publicUrl")
    object_key: str = Field(alias="objectKey")
    max_upload_bytes: int = Field(alias="maxUploadBytes")

    model_config = ConfigDict(populate_by_name=True)


class MediaUploadResponse(BaseModel):
    """Response for a direct (server-proxied) upload."""

    url: str
    object_key: str = Field(alias="objectKey")

    model_config = ConfigDict(populate_by_name=True)


class VideoDirectUploadRequest(BaseModel):
    """Optional body for reserving a Cloudflare Stream direct upload."""

    max_duration_seconds: int = Field(default=600, ge=1, alias="maxDurationSeconds")

    model_config = ConfigDict(populate_by_name=True)


class VideoDirectUploadResponse(BaseModel):
    """A reserved Stream upload target plus the derived playback URLs."""

    uid: str
    upload_url: str = Field(alias="uploadUrl")
    playback_url: str = Field(alias="playbackUrl")
    hls_url: str = Field(alias="hlsUrl")
    iframe_url: str = Field(alias="iframeUrl")
    thumbnail_url: str = Field(alias="thumbnailUrl")

    model_config = ConfigDict(populate_by_name=True)


class VideoStatusResponse(BaseModel):
    ready: bool
    state: str
    duration_seconds: int | None = Field(default=None, alias="durationSeconds")

    model_config = ConfigDict(populate_by_name=True)


TokenResponse.model_rebuild()


class ReceiptScanResult(BaseModel):
    """AI-extracted suggestion for a history event, pre-fill only — user confirms."""

    event_type: EventType = Field(alias="eventType")
    title: str
    event_date: str | None = Field(default=None, alias="eventDate")
    cost_cents: int | None = Field(default=None, alias="costCents")
    currency: str = "USD"
    mileage: int | None = None
    shop_name: str | None = Field(default=None, alias="shopName")
    location: str | None = None
    description: str | None = None
    confidence: str = "low"
    notes: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class FuelScanResult(BaseModel):
    """AI-extracted fuel-up numbers from pump/odometer photos."""

    total_cents: int | None = Field(default=None, alias="totalCents")
    gallons: float | None = None
    price_per_gallon: float | None = Field(default=None, alias="pricePerGallon")
    station_name: str | None = Field(default=None, alias="stationName")
    mileage: int | None = None
    confidence: str = "low"
    notes: str | None = None

    model_config = ConfigDict(populate_by_name=True)
