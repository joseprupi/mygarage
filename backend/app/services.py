import base64
import csv
import io
import json
import re
import urllib.request
import uuid
import zipfile

import httpx
from pathlib import Path
from urllib.parse import urlencode
from datetime import UTC, date, datetime
from functools import lru_cache
from typing import Any

import boto3
from botocore.config import Config
from fastapi import BackgroundTasks, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy import Select, and_, delete, desc, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.models import (
    Comment,
    CommentLike,
    Post,
    PostLike,
    PostMedia,
    PostVehicleTag,
    User,
    Vehicle,
    VehicleEvent,
    VehicleEventDocument,
    VehicleEventMedia,
    VehicleMod,
    VehicleModMedia,
    VehicleOwnership,
)
from app.schemas import (
    AppleLoginRequest,
    CommentCreate,
    CommentRead,
    EventDocumentRead,
    EventMediaRead,
    GoogleLoginRequest,
    LoginRequest,
    MediaCreate,
    PostCreate,
    PostRead,
    PostUpdate,
    PublicUser,
    SignupRequest,
    SitemapEntries,
    SitemapPostEntry,
    SitemapUserEntry,
    SitemapVehicleEntry,
    UploadUrlRequest,
    UploadUrlResponse,
    UserUpdate,
    VehicleCreate,
    VehicleEventCreate,
    VehicleEventRead,
    VehicleEventUpdate,
    VehicleModCreate,
    VehicleModUpdate,
    VehicleOwnershipCreate,
    VehicleOwnershipRead,
    VehicleOwnershipUpdate,
    VehicleSummary,
    VehicleUpdate,
    MediaRead,
    DocumentRead,
)
from app.security import create_access_token, hash_password, verify_password


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or str(uuid.uuid4())


def username_base(value: str) -> str:
    base = re.sub(r"[^a-z0-9_.-]+", "", value.lower()).strip("._-")
    if len(base) < 3:
        base = f"user-{base or uuid.uuid4().hex[:8]}"
    return base[:32]


def unique_username(db: Session, desired: str) -> str:
    base = username_base(desired)
    candidate = base
    suffix = 1
    while db.scalar(select(User.id).where(User.username == candidate)):
        suffix_text = f"-{suffix}"
        candidate = f"{base[: 40 - len(suffix_text)]}{suffix_text}"
        suffix += 1
    return candidate


def encode_cursor(created_at: datetime, post_id: str) -> str:
    payload = {"createdAt": created_at.isoformat(), "postId": post_id}
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()


def decode_cursor(cursor: str | None) -> tuple[datetime, str] | None:
    if not cursor:
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
        return datetime.fromisoformat(payload["createdAt"]), payload["postId"]
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid cursor") from exc


def public_user(user: User) -> PublicUser:
    return PublicUser.model_validate(user)


def can_view_vehicle(vehicle: Vehicle, viewer: User | None) -> bool:
    return vehicle.visibility == "public" or vehicle.owner_user_id == (viewer.id if viewer else None)


def can_view_post(post: Post, viewer: User | None) -> bool:
    return (
        post.deleted_at is None
        and (post.visibility == "public" or post.author_user_id == (viewer.id if viewer else None))
    )


def signup(db: Session, data: SignupRequest) -> tuple[str, User]:
    existing = db.scalar(select(User).where(or_(User.email == data.email, User.username == data.username)))
    if existing:
        raise HTTPException(status_code=409, detail="Email or username already exists")
    user = User(
        username=data.username,
        email=str(data.email).lower(),
        password_hash=hash_password(data.password),
        display_name=data.display_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return create_access_token(user.id), user


def login(db: Session, data: LoginRequest) -> tuple[str, User]:
    user = db.scalar(select(User).where(User.email == str(data.email).lower()))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return create_access_token(user.id), user


def google_login(db: Session, data: GoogleLoginRequest) -> tuple[str, User]:
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google login is not configured")
    try:
        payload = id_token.verify_oauth2_token(
            data.credential,
            google_requests.Request(),
            settings.google_client_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Google credential") from exc

    email = str(payload.get("email", "")).lower()
    if not email or not payload.get("email_verified"):
        raise HTTPException(status_code=401, detail="Google account email is not verified")

    user = db.scalar(select(User).where(User.email == email))
    if not user:
        desired_username = email.split("@", 1)[0]
        user = User(
            username=unique_username(db, desired_username),
            email=email,
            password_hash=f"google:{payload.get('sub')}",
            display_name=payload.get("name"),
            avatar_url=payload.get("picture"),
        )
        db.add(user)
    else:
        if not user.avatar_url and payload.get("picture"):
            user.avatar_url = payload.get("picture")
        if not user.display_name and payload.get("name"):
            user.display_name = payload.get("name")
    db.commit()
    db.refresh(user)
    return create_access_token(user.id), user


# ---------------------------------------------------------------------------
# Apple Sign-In
# ---------------------------------------------------------------------------

_APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
_APPLE_ISS = "https://appleid.apple.com"

# Module-level JWKS cache: (keys_by_kid dict, fetched_at monotonic timestamp)
_apple_jwks_cache: tuple[dict[str, Any], float] | None = None
_APPLE_JWKS_TTL = 86400.0  # 24 hours in seconds


def _now_monotonic() -> float:
    import time
    return time.monotonic()


def _fetch_apple_jwks(force: bool = False) -> dict[str, Any]:
    """Fetch Apple JWKS and return a dict mapping kid -> JWK dict."""
    global _apple_jwks_cache
    now = _now_monotonic()
    if not force and _apple_jwks_cache is not None:
        keys, fetched_at = _apple_jwks_cache
        if now - fetched_at < _APPLE_JWKS_TTL:
            return keys
    try:
        resp = httpx.get(_APPLE_JWKS_URL, timeout=10.0)
        resp.raise_for_status()
        jwks = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to fetch Apple JWKS: {exc}") from exc
    keys = {k["kid"]: k for k in jwks.get("keys", [])}
    _apple_jwks_cache = (keys, now)
    return keys


def _verify_apple_token(token: str, allowed_audiences: list[str]) -> dict[str, Any]:
    """Verify Apple identityToken, return claims dict. Raises HTTPException on failure."""
    from jose import jwt as jose_jwt, jwk as jose_jwk, JWTError
    from jose.constants import ALGORITHMS

    try:
        header = jose_jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid Apple token header") from exc

    kid = header.get("kid")
    keys = _fetch_apple_jwks()
    jwk_dict = keys.get(kid)
    if jwk_dict is None:
        # kid not in cache – refetch once
        keys = _fetch_apple_jwks(force=True)
        jwk_dict = keys.get(kid)
    if jwk_dict is None:
        raise HTTPException(status_code=401, detail="Apple token key not found")

    try:
        public_key = jose_jwk.construct(jwk_dict, algorithm=ALGORITHMS.RS256)
        # Decode and verify: audience is checked against any of allowed_audiences
        # python-jose accepts a list for audience
        claims = jose_jwt.decode(
            token,
            public_key.to_dict() if hasattr(public_key, "to_dict") else jwk_dict,
            algorithms=[ALGORITHMS.RS256],
            audience=allowed_audiences,
            issuer=_APPLE_ISS,
            options={"verify_exp": True},
        )
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid Apple credential: {exc}") from exc

    return claims


def apple_login(db: Session, data: AppleLoginRequest) -> tuple[str, User]:
    settings = get_settings()
    claims = _verify_apple_token(data.credential, settings.apple_audiences)

    apple_sub: str = claims.get("sub", "")
    if not apple_sub:
        raise HTTPException(status_code=401, detail="Apple token missing sub claim")

    email: str = str(claims.get("email", "")).lower()

    # 1. Look up by apple_sub (returning user)
    user = db.scalar(select(User).where(User.apple_sub == apple_sub))

    if user is None and email:
        # 2. Link by email if account already exists
        user = db.scalar(select(User).where(User.email == email))
        if user is not None:
            user.apple_sub = apple_sub

    if user is None:
        # 3. Create new user
        if email:
            desired_username = email.split("@", 1)[0]
        else:
            desired_username = f"user{uuid.uuid4().hex[:8]}"
        user = User(
            username=unique_username(db, desired_username),
            email=email or f"{apple_sub}@privaterelay.appleid.com",
            password_hash=f"apple:{apple_sub}",
            display_name=data.fullName or None,
            apple_sub=apple_sub,
        )
        db.add(user)
    else:
        # Update display_name if we got one and don't have one yet
        if data.fullName and not user.display_name:
            user.display_name = data.fullName

    db.commit()
    db.refresh(user)
    return create_access_token(user.id), user


def update_user(db: Session, user: User, data: UserUpdate) -> User:
    values = data.model_dump(exclude_unset=True)
    if "username" in values and values["username"]:
        values["username"] = values["username"].lower()
        existing = db.scalar(select(User).where(User.username == values["username"], User.id != user.id))
        if existing:
            raise HTTPException(status_code=409, detail="Username already exists")
    # Handle settings merge: patch the stored dict rather than replacing it.
    # Use the original Pydantic object (data.settings) so we can exclude_unset
    # and avoid overwriting keys the caller didn't include.
    if "settings" in values:
        values.pop("settings")
        if data.settings is not None:
            incoming = data.settings.model_dump(by_alias=False, exclude_unset=True)
            current: dict = user.settings or {}
            user.settings = {**current, **incoming}
    for key, value in values.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


def create_vehicle(db: Session, user: User, data: VehicleCreate) -> Vehicle:
    vehicle = Vehicle(owner_user_id=user.id, **data.model_dump())
    vehicle.slug = slugify(f"{vehicle.year or ''} {vehicle.make} {vehicle.model} {vehicle.nickname or ''}")
    db.add(vehicle)
    db.flush()
    # Create the initial current-owner period
    from datetime import date as _date
    today = _date.today()
    period_start = data.purchase_date or today
    db.add(VehicleOwnership(
        vehicle_id=vehicle.id,
        ordinal=1,
        owner_user_id=user.id,
        start_date=period_start,
        start_mileage=data.mileage,
        created_by=user.id,
    ))
    db.commit()
    db.refresh(vehicle)
    return vehicle


def get_vehicle_or_404(db: Session, vehicle_id: str, viewer: User | None = None) -> Vehicle:
    vehicle = db.scalar(
        select(Vehicle).options(selectinload(Vehicle.owner)).where(Vehicle.id == vehicle_id)
    )
    if not vehicle or not can_view_vehicle(vehicle, viewer):
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


def assert_vehicle_owner(vehicle: Vehicle, user: User) -> None:
    if vehicle.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this vehicle")


def update_vehicle(db: Session, vehicle: Vehicle, user: User, data: VehicleUpdate) -> Vehicle:
    assert_vehicle_owner(vehicle, user)
    values = data.model_dump(exclude_unset=True)
    for key, value in values.items():
        setattr(vehicle, key, value)
    if any(k in values for k in ("make", "model", "year", "nickname")):
        vehicle.slug = slugify(f"{vehicle.year or ''} {vehicle.make} {vehicle.model} {vehicle.nickname or ''}")
    # Sync purchase_date/mileage changes into the current ownership period
    if "purchase_date" in values or "mileage" in values:
        current_period = db.scalar(
            select(VehicleOwnership)
            .where(
                VehicleOwnership.vehicle_id == vehicle.id,
                VehicleOwnership.owner_user_id == user.id,
                VehicleOwnership.end_date.is_(None),
            )
        )
        if current_period:
            if "purchase_date" in values and values["purchase_date"] is not None:
                current_period.start_date = values["purchase_date"]
                _renumber_ownerships(db, vehicle.id)
            if "mileage" in values:
                current_period.start_mileage = values["mileage"]
    db.commit()
    db.refresh(vehicle)
    return vehicle


def delete_vehicle(db: Session, vehicle: Vehicle, user: User) -> None:
    assert_vehicle_owner(vehicle, user)
    # Hard delete. Events are soft-deleted (rows remain) and there is no FK cascade,
    # so we must remove child rows first — otherwise db.delete(vehicle) tries to NULL
    # vehicle_events.vehicle_id (NOT NULL) → IntegrityError. Posts tagged to this
    # vehicle survive (only the tag rows are removed).
    event_ids = list(db.scalars(select(VehicleEvent.id).where(VehicleEvent.vehicle_id == vehicle.id)))
    if event_ids:
        # Clean up storage objects for media and documents before deleting rows
        media_rows = list(db.scalars(
            select(VehicleEventMedia).where(VehicleEventMedia.vehicle_event_id.in_(event_ids))
        ))
        for m in media_rows:
            _delete_event_media_storage(m)
        doc_rows = list(db.scalars(
            select(VehicleEventDocument).where(VehicleEventDocument.vehicle_event_id.in_(event_ids))
        ))
        for d in doc_rows:
            _delete_event_doc_storage(d)
        db.execute(delete(VehicleEventMedia).where(VehicleEventMedia.vehicle_event_id.in_(event_ids)))
        db.execute(delete(VehicleEventDocument).where(VehicleEventDocument.vehicle_event_id.in_(event_ids)))
        db.execute(delete(VehicleEvent).where(VehicleEvent.vehicle_id == vehicle.id))
    mod_ids = list(db.scalars(select(VehicleMod.id).where(VehicleMod.vehicle_id == vehicle.id)))
    if mod_ids:
        db.execute(delete(VehicleModMedia).where(VehicleModMedia.vehicle_mod_id.in_(mod_ids)))
        db.execute(delete(VehicleMod).where(VehicleMod.vehicle_id == vehicle.id))
    db.execute(delete(PostVehicleTag).where(PostVehicleTag.vehicle_id == vehicle.id))
    db.execute(delete(VehicleOwnership).where(VehicleOwnership.vehicle_id == vehicle.id))
    db.delete(vehicle)
    db.commit()


def list_user_vehicles(db: Session, user_id: str, viewer: User | None) -> list[Vehicle]:
    stmt = select(Vehicle).where(Vehicle.owner_user_id == user_id).order_by(desc(Vehicle.created_at))
    if viewer is None or viewer.id != user_id:
        stmt = stmt.where(Vehicle.visibility == "public")
    return list(db.scalars(stmt))


# ---------------------------------------------------------------------------
# Ownership periods
# ---------------------------------------------------------------------------

def ownership_for_event(
    periods: list[VehicleOwnership], event_date: date | None
) -> VehicleOwnership | None:
    """Return the period whose [start, end) contains event_date, or None if before all periods."""
    if not event_date or not periods:
        return None
    sorted_periods = sorted(periods, key=lambda p: p.start_date)
    for period in sorted_periods:
        if event_date < period.start_date:
            # event predates this period and (since sorted) all later ones
            return None
        # event_date >= period.start_date
        if period.end_date is None or event_date < period.end_date:
            return period
        # event_date >= period.end_date → event is after this period; check next
    return None


def _load_ownerships(db: Session, vehicle_id: str) -> list[VehicleOwnership]:
    return list(db.scalars(
        select(VehicleOwnership)
        .options(selectinload(VehicleOwnership.owner_user))
        .where(VehicleOwnership.vehicle_id == vehicle_id)
        .order_by(VehicleOwnership.start_date)
    ))


def _renumber_ownerships(db: Session, vehicle_id: str) -> None:
    """Re-assign ordinals 1, 2, 3, … by ascending start_date for a vehicle."""
    periods = list(db.scalars(
        select(VehicleOwnership)
        .where(VehicleOwnership.vehicle_id == vehicle_id)
        .order_by(VehicleOwnership.start_date)
    ))
    # Two-pass to avoid unique constraint violations on (vehicle_id, ordinal)
    for i, p in enumerate(periods):
        p.ordinal = 10000 + i
    db.flush()
    for i, p in enumerate(periods):
        p.ordinal = i + 1
    db.flush()


def _ownership_to_read(period: VehicleOwnership) -> VehicleOwnershipRead:
    owner_username: str | None = None
    if period.owner_user_id and period.show_owner_name and period.owner_user:
        owner_username = period.owner_user.username
    return VehicleOwnershipRead(
        id=period.id,
        ordinal=period.ordinal,
        owner_user_id=period.owner_user_id,
        owner_username=owner_username,
        label=period.label,
        start_date=period.start_date,
        start_mileage=period.start_mileage,
        end_date=period.end_date,
        end_mileage=period.end_mileage,
        is_current=period.end_date is None,
        show_owner_name=period.show_owner_name,
    )


def list_vehicle_ownerships(
    db: Session, vehicle: Vehicle, viewer: User | None
) -> list[VehicleOwnershipRead]:
    periods = _load_ownerships(db, vehicle.id)
    return [_ownership_to_read(p) for p in periods]


def create_vehicle_ownership(
    db: Session, vehicle: Vehicle, user: User, data: VehicleOwnershipCreate
) -> VehicleOwnershipRead:
    assert_vehicle_owner(vehicle, user)
    if data.end_date and data.start_date >= data.end_date:
        raise HTTPException(status_code=400, detail="start_date must be before end_date")
    # Validate end_date <= current period start_date
    current_period = db.scalar(
        select(VehicleOwnership)
        .where(
            VehicleOwnership.vehicle_id == vehicle.id,
            VehicleOwnership.end_date.is_(None),
        )
    )
    if current_period and data.end_date and data.end_date > current_period.start_date:
        raise HTTPException(
            status_code=400,
            detail="end_date must not exceed the current ownership period's start date",
        )
    period = VehicleOwnership(
        vehicle_id=vehicle.id,
        ordinal=0,  # will be assigned by renumber
        owner_user_id=None,
        label=data.label,
        start_date=data.start_date,
        start_mileage=data.start_mileage,
        end_date=data.end_date,
        end_mileage=data.end_mileage,
        show_owner_name=True,
        created_by=user.id,
    )
    db.add(period)
    db.flush()
    _renumber_ownerships(db, vehicle.id)
    db.commit()
    db.refresh(period)
    return _ownership_to_read(period)


def get_ownership_or_404(db: Session, ownership_id: str, viewer: User | None) -> VehicleOwnership:
    period = db.scalar(
        select(VehicleOwnership)
        .options(
            selectinload(VehicleOwnership.vehicle),
            selectinload(VehicleOwnership.owner_user),
        )
        .where(VehicleOwnership.id == ownership_id)
    )
    if not period:
        raise HTTPException(status_code=404, detail="Ownership period not found")
    # Check vehicle visibility
    if not can_view_vehicle(period.vehicle, viewer):
        raise HTTPException(status_code=404, detail="Ownership period not found")
    return period


def update_vehicle_ownership(
    db: Session, period: VehicleOwnership, user: User, data: VehicleOwnershipUpdate
) -> VehicleOwnershipRead:
    vehicle = period.vehicle
    if vehicle.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this vehicle")
    values = data.model_dump(exclude_unset=True, by_alias=False)
    is_current_user_period = period.owner_user_id == user.id
    is_non_user_period = period.owner_user_id is None
    if not is_non_user_period and not is_current_user_period:
        raise HTTPException(status_code=403, detail="Cannot edit another user's ownership period")
    if is_current_user_period:
        # Only startDate/startMileage allowed for the current owner's period
        allowed = {"start_date", "start_mileage"}
        disallowed = set(values.keys()) - allowed
        if disallowed:
            raise HTTPException(
                status_code=400,
                detail=f"Fields {disallowed} cannot be changed on the current owner's period",
            )
        if "start_date" in values and values["start_date"] is not None:
            period.start_date = values["start_date"]
            # Sync to vehicle
            vehicle.purchase_date = values["start_date"]
            _renumber_ownerships(db, vehicle.id)
        if "start_mileage" in values:
            period.start_mileage = values["start_mileage"]
            vehicle.mileage = values["start_mileage"]
    else:
        # Non-user period: all fields editable
        for key, value in values.items():
            setattr(period, key, value)
        if "start_date" in values:
            _renumber_ownerships(db, vehicle.id)
    db.commit()
    db.refresh(period)
    if period.owner_user and period.owner_user_id:
        db.refresh(period.owner_user)
    return _ownership_to_read(period)


def delete_vehicle_ownership(db: Session, period: VehicleOwnership, user: User) -> None:
    vehicle = period.vehicle
    if vehicle.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this vehicle")
    if period.owner_user_id is not None:
        raise HTTPException(status_code=400, detail="Cannot delete a user-linked ownership period")
    db.delete(period)
    db.flush()
    _renumber_ownerships(db, vehicle.id)
    db.commit()


def _resolve_event_media_url(m: VehicleEventMedia, is_owner: bool) -> str | None:
    """Return the appropriate URL for an event media item based on viewer permissions."""
    can_view = is_owner or m.is_public
    if not can_view:
        return None
    if m.storage_key:
        if m.is_public:
            # Object has been copied to the public bucket; serve the public URL.
            settings = get_settings()
            return f"{settings.public_media_base_url}/{m.storage_key}"
        elif is_owner:
            try:
                return generate_private_read_url(m.storage_key)
            except Exception:
                return m.url  # Fallback to stored URL (e.g., in tests / MinIO down)
        else:
            return None
    # Legacy row without storage_key: use the stored URL directly.
    return m.url


def _resolve_event_doc_url(d: VehicleEventDocument, is_owner: bool) -> str | None:
    """Return the appropriate URL for an event document based on viewer permissions."""
    can_view = is_owner or d.is_public
    if not can_view:
        return None
    if d.storage_key:
        if d.is_public:
            settings = get_settings()
            return f"{settings.public_media_base_url}/{d.storage_key}"
        elif is_owner:
            try:
                return generate_private_read_url(d.storage_key)
            except Exception:
                return d.url
        else:
            return None
    return d.url


def _event_media_read(m: VehicleEventMedia, is_owner: bool) -> EventMediaRead:
    """Build a visibility-aware EventMediaRead. Non-owners only see private items' blur."""
    can_view = is_owner or m.is_public
    return EventMediaRead(
        id=m.id,
        url=_resolve_event_media_url(m, is_owner),
        media_type=m.media_type,
        thumbnail_url=m.thumbnail_url if can_view else None,
        width=m.width,
        height=m.height,
        sort_order=m.sort_order,
        is_public=m.is_public,
        pii_status=m.pii_status if m.pii_status is not None else "unknown",
        pii_kinds=m.pii_kinds or [],
        blur_url=m.blur_url,
        can_view=can_view,
        created_at=m.created_at,
    )


def _event_doc_read(d: VehicleEventDocument, is_owner: bool) -> EventDocumentRead:
    """Build a visibility-aware EventDocumentRead. Non-owners only see metadata."""
    can_view = is_owner or d.is_public
    return EventDocumentRead(
        id=d.id,
        url=_resolve_event_doc_url(d, is_owner),
        filename=d.filename,
        content_type=d.content_type,
        sort_order=d.sort_order,
        is_public=d.is_public,
        pii_status=d.pii_status if d.pii_status is not None else "unknown",
        pii_kinds=d.pii_kinds or [],
        blur_url=d.blur_url,  # None for PDFs
        can_view=can_view,
        created_at=d.created_at,
    )


def _enrich_event(
    event: VehicleEvent,
    periods: list[VehicleOwnership],
    vehicle_owner_id: str,
    viewer: User | None,
) -> VehicleEventRead:
    """Build a VehicleEventRead from an ORM event, adding derived ownership fields."""
    period = ownership_for_event(periods, event.event_date)
    is_prev = period is None or period.owner_user_id != vehicle_owner_id
    can_edit = (
        viewer is not None
        and viewer.id == vehicle_owner_id
        and viewer.id == event.author_user_id
    )
    is_owner = viewer is not None and viewer.id == vehicle_owner_id
    return VehicleEventRead(
        id=event.id,
        vehicle_id=event.vehicle_id,
        author_user_id=event.author_user_id,
        event_type=event.event_type,
        title=event.title,
        description=event.description,
        event_date=event.event_date,
        mileage=event.mileage,
        cost_cents=event.cost_cents,
        fuel_gallons=event.fuel_gallons,
        fuel_price_cents=event.fuel_price_cents,
        fuel_full_tank=event.fuel_full_tank,
        fuel_missed_previous=event.fuel_missed_previous,
        tags=event.tags or [],
        currency=event.currency,
        shop_name=event.shop_name,
        location=event.location,
        visibility=event.visibility,
        media=[_event_media_read(m, is_owner) for m in (event.media or [])],
        documents=[_event_doc_read(d, is_owner) for d in (event.documents or [])],
        created_at=event.created_at,
        updated_at=event.updated_at,
        ownership_id=period.id if period else None,
        is_previous_owner=is_prev,
        can_edit=can_edit,
        source=event.source if event.source is not None else "manual",
        edited_fields=event.edited_fields or [],
        scan_snapshot=event.scan_snapshot if is_owner else None,
    )


def _add_post_media(db: Session, post: Post, media: list[MediaCreate]) -> None:
    for index, item in enumerate(media):
        db.add(
            PostMedia(
                post_id=post.id,
                sort_order=item.sort_order or index,
                **item.model_dump(exclude={"sort_order"}),
            )
        )


def create_post(db: Session, user: User, data: PostCreate) -> Post:
    vehicles = []
    if data.vehicle_ids:
        vehicles = list(db.scalars(select(Vehicle).where(Vehicle.id.in_(data.vehicle_ids))))
        found_ids = {vehicle.id for vehicle in vehicles}
        if found_ids != set(data.vehicle_ids):
            raise HTTPException(status_code=400, detail="One or more vehicles were not found")
        for vehicle in vehicles:
            if vehicle.owner_user_id != user.id:
                raise HTTPException(status_code=403, detail="You can only tag your own vehicles")
            if data.visibility == "public" and vehicle.visibility != "public":
                raise HTTPException(status_code=400, detail="Public posts can only tag public vehicles")

    now = datetime.now(UTC)
    post = Post(
        author_user_id=user.id,
        caption=data.caption,
        visibility=data.visibility,
        created_at=now,
        updated_at=now,
    )
    db.add(post)
    db.flush()
    _add_post_media(db, post, data.media)
    for vehicle in vehicles:
        db.add(PostVehicleTag(post_id=post.id, vehicle_id=vehicle.id))
    db.commit()
    return get_post_or_404(db, post.id, user)


def get_post_or_404(db: Session, post_id: str, viewer: User | None = None) -> Post:
    post = db.scalar(
        select(Post)
        .options(
            selectinload(Post.author),
            selectinload(Post.media),
            selectinload(Post.vehicle_tags).selectinload(PostVehicleTag.vehicle),
        )
        .where(Post.id == post_id)
    )
    if not post or not can_view_post(post, viewer):
        raise HTTPException(status_code=404, detail="Post not found")
    return post


def update_post(db: Session, post: Post, user: User, data: PostUpdate) -> Post:
    if post.author_user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this post")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(post, key, value)
    db.commit()
    return get_post_or_404(db, post.id, user)


def delete_post(db: Session, post: Post, user: User) -> None:
    if post.author_user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this post")
    post.deleted_at = datetime.now(UTC)
    db.commit()


def list_posts_for_user(db: Session, user_id: str, viewer: User | None) -> list[PostRead]:
    stmt = (
        select(Post.id)
        .where(Post.author_user_id == user_id, Post.deleted_at.is_(None))
        .order_by(desc(Post.created_at), desc(Post.id))
        .limit(50)
    )
    if viewer is None or viewer.id != user_id:
        stmt = stmt.where(Post.visibility == "public")
    return compose_posts(db, list(db.scalars(stmt)), viewer)


def list_posts_for_vehicle(db: Session, vehicle_id: str, viewer: User | None) -> list[PostRead]:
    vehicle = get_vehicle_or_404(db, vehicle_id, viewer)
    stmt = (
        select(Post.id)
        .join(PostVehicleTag, PostVehicleTag.post_id == Post.id)
        .where(PostVehicleTag.vehicle_id == vehicle.id, Post.deleted_at.is_(None))
        .order_by(desc(Post.created_at), desc(Post.id))
        .limit(50)
    )
    if viewer is None or viewer.id != vehicle.owner_user_id:
        stmt = stmt.where(Post.visibility == "public")
    return compose_posts(db, list(db.scalars(stmt)), viewer)


def compose_posts(db: Session, post_ids: list[str], viewer: User | None) -> list[PostRead]:
    if not post_ids:
        return []
    posts = list(
        db.scalars(
            select(Post)
            .options(selectinload(Post.author), selectinload(Post.media))
            .where(Post.id.in_(post_ids))
        )
    )
    order = {post_id: index for index, post_id in enumerate(post_ids)}
    posts.sort(key=lambda post: order[post.id])

    tags = list(
        db.execute(
            select(PostVehicleTag.post_id, Vehicle)
            .join(Vehicle, Vehicle.id == PostVehicleTag.vehicle_id)
            .where(PostVehicleTag.post_id.in_(post_ids))
        )
    )
    vehicles_by_post: dict[str, list[VehicleSummary]] = {post_id: [] for post_id in post_ids}
    for post_id, vehicle in tags:
        if vehicle.visibility == "public" or vehicle.owner_user_id == (viewer.id if viewer else None):
            vehicles_by_post[post_id].append(VehicleSummary.model_validate(vehicle))

    like_counts = {
        post_id: count
        for post_id, count in db.execute(
            select(PostLike.post_id, func.count(PostLike.user_id))
            .where(PostLike.post_id.in_(post_ids))
            .group_by(PostLike.post_id)
        )
    }
    comment_counts = {
        post_id: count
        for post_id, count in db.execute(
            select(Comment.post_id, func.count(Comment.id))
            .where(Comment.post_id.in_(post_ids), Comment.deleted_at.is_(None))
            .group_by(Comment.post_id)
        )
    }
    viewer_likes: set[str] = set()
    if viewer:
        viewer_likes = set(
            db.scalars(
                select(PostLike.post_id).where(
                    PostLike.post_id.in_(post_ids), PostLike.user_id == viewer.id
                )
            )
        )

    return [
        PostRead(
            id=post.id,
            caption=post.caption,
            visibility=post.visibility,
            created_at=post.created_at,
            updated_at=post.updated_at,
            author=public_user(post.author),
            media=post.media,
            vehicles=vehicles_by_post.get(post.id, []),
            like_count=int(like_counts.get(post.id, 0)),
            comment_count=int(comment_counts.get(post.id, 0)),
            viewer_has_liked=post.id in viewer_likes,
        )
        for post in posts
        if can_view_post(post, viewer)
    ]


class NewestFeedService:
    def get_feed(self, db: Session, viewer: User | None, cursor: str | None, limit: int) -> tuple[list[PostRead], str | None, bool]:
        limit = min(max(limit, 1), 50)
        stmt: Select[Any] = (
            select(Post.id, Post.created_at)
            .where(Post.visibility == "public", Post.deleted_at.is_(None))
            .order_by(desc(Post.created_at), desc(Post.id))
            .limit(limit + 1)
        )
        decoded = decode_cursor(cursor)
        if decoded:
            created_at, post_id = decoded
            stmt = stmt.where(
                or_(Post.created_at < created_at, and_(Post.created_at == created_at, Post.id < post_id))
            )
        rows = list(db.execute(stmt))
        page_rows = rows[:limit]
        post_ids = [row.id for row in page_rows]
        items = compose_posts(db, post_ids, viewer)
        has_more = len(rows) > limit
        next_cursor = encode_cursor(page_rows[-1].created_at, page_rows[-1].id) if has_more and page_rows else None
        return items, next_cursor, has_more


# ---------------------------------------------------------------------------
# Blur placeholder + PII classification (background tasks)
# ---------------------------------------------------------------------------

def make_blur_placeholder(image_bytes: bytes) -> bytes:
    """EXIF-transpose, downscale to 48px, Gaussian blur, upscale to 480px → JPEG."""
    import io as _io
    from PIL import Image, ImageFilter, ImageOps
    img = Image.open(_io.BytesIO(image_bytes))
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    if img.mode != "RGB":
        img = img.convert("RGB")
    ratio = 48 / img.width
    small = img.resize((48, max(1, int(img.height * ratio))), Image.LANCZOS)
    blurred = small.filter(ImageFilter.GaussianBlur(radius=6))
    ratio2 = 480 / blurred.width
    result = blurred.resize((480, max(1, int(blurred.height * ratio2))), Image.BILINEAR)
    out = _io.BytesIO()
    result.save(out, format="JPEG", quality=60)
    return out.getvalue()


_PII_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "is_document": {"type": "BOOLEAN"},
        "pii_kinds": {
            "type": "ARRAY",
            "items": {
                "type": "STRING",
                "enum": [
                    "name", "address", "phone", "email", "license_number",
                    "signature", "vin", "plate", "payment_card", "other",
                ],
            },
        },
    },
    "required": ["is_document", "pii_kinds"],
}

_PII_PROMPT = (
    "You are a privacy classifier. Examine the image or document and respond with:\n"
    "1. is_document: true if this looks like a receipt, invoice, service record, "
    "document, or similar paperwork (NOT a photo of a car, part, or scenery).\n"
    "2. pii_kinds: list ONLY personally-identifiable information (PII) of an individual "
    "that is visibly present: person names, home/street addresses, phone numbers, "
    "email addresses, driver's license or government ID numbers, handwritten signatures, "
    "VINs, license plate numbers, payment card numbers.\n"
    "EXCLUDE shop/business name, business address/phone — those are not personal PII.\n"
    "Return an empty pii_kinds array if no personal PII is found."
)


def classify_media_pii(image_or_pdf_bytes: bytes, mime: str) -> dict:
    """Run Gemini PII classification. Returns {is_document: bool, pii_kinds: list[str]}.
    Raises RuntimeError if AI is disabled or call fails."""
    raw = _gemini_generate(
        _inline_parts([(image_or_pdf_bytes, mime)]),
        _PII_PROMPT,
        _PII_SCHEMA,
    )
    return {
        "is_document": bool(raw.get("is_document", False)),
        "pii_kinds": [k for k in (raw.get("pii_kinds") or []) if isinstance(k, str)],
    }


def _process_event_media_bg(media_id: str, url: str, storage_key: str | None, mime: str) -> None:
    """Background task: generate blur placeholder + PII classify for a VehicleEventMedia row."""
    from app.database import SessionLocal
    settings = get_settings()
    key = storage_key or _object_key_from_url(url)
    if not key:
        return

    # Fetch bytes from private bucket (new rows) or public bucket (legacy rows without storage_key)
    try:
        client = _s3_client()
        bucket = settings.storage_private_bucket if storage_key else settings.storage_bucket
        obj = client.get_object(Bucket=bucket, Key=key)
        content = obj["Body"].read()
    except Exception:
        return

    # Generate blur placeholder (images only)
    blur_url = None
    if mime.startswith("image/"):
        try:
            blur_bytes = make_blur_placeholder(content)
            blur_key = f"event_media_blur/{media_id}-blur.jpg"
            client.put_object(
                Bucket=settings.storage_bucket,  # blur goes to PUBLIC bucket (safe)
                Key=blur_key,
                Body=blur_bytes,
                ContentType="image/jpeg",
            )
            blur_url = f"{settings.public_media_base_url}/{blur_key}"
        except Exception:
            pass

    # PII classification
    pii_kinds: list[str] = []
    pii_status = "unknown"
    if settings.ai_scan_enabled:
        try:
            result = classify_media_pii(content, mime)
            pii_kinds = result["pii_kinds"]
            pii_status = "detected" if pii_kinds else "none"
        except Exception:
            pass

    with SessionLocal() as db:
        row = db.get(VehicleEventMedia, media_id)
        if row:
            row.blur_url = blur_url
            row.pii_status = pii_status
            row.pii_kinds = pii_kinds
            db.commit()


def _process_event_doc_bg(doc_id: str, url: str, storage_key: str | None, mime: str) -> None:
    """Background task: PII classify for a VehicleEventDocument row (PDFs have no blur)."""
    from app.database import SessionLocal
    settings = get_settings()
    key = storage_key or _object_key_from_url(url)
    if not key:
        return

    try:
        client = _s3_client()
        bucket = settings.storage_private_bucket if storage_key else settings.storage_bucket
        obj = client.get_object(Bucket=bucket, Key=key)
        content = obj["Body"].read()
    except Exception:
        return

    pii_kinds: list[str] = []
    pii_status = "unknown"
    if settings.ai_scan_enabled:
        try:
            result = classify_media_pii(content, mime)
            pii_kinds = result["pii_kinds"]
            pii_status = "detected" if pii_kinds else "none"
        except Exception:
            pass

    with SessionLocal() as db:
        row = db.get(VehicleEventDocument, doc_id)
        if row:
            row.pii_status = pii_status
            row.pii_kinds = pii_kinds
            db.commit()


# ---------------------------------------------------------------------------
# Provenance helpers
# ---------------------------------------------------------------------------

_PROVENANCE_FIELDS = {
    "event_date": "eventDate",
    "cost_cents": "costCents",
    "mileage": "mileage",
    "shop_name": "shopName",
    "fuel_gallons": "fuelGallons",
    "fuel_price_cents": "fuelPriceCents",
}


def _compute_edited_fields(event: "VehicleEvent") -> list[str]:
    """Compare saved event values against the stored scan_snapshot.
    Returns the list of trust-relevant fields that differ."""
    snap = event.scan_snapshot
    if not snap:
        return []
    diffs: list[str] = []
    for field, snap_key in _PROVENANCE_FIELDS.items():
        snap_val = snap.get(snap_key)
        saved_val = getattr(event, field, None)
        if snap_val is None and saved_val is None:
            continue
        # Normalise for comparison
        if field == "event_date":
            snap_norm = str(snap_val).strip() if snap_val is not None else None
            saved_norm = saved_val.isoformat() if saved_val is not None else None
        elif field == "shop_name":
            snap_norm = snap_val.strip().casefold() if isinstance(snap_val, str) else snap_val
            saved_norm = saved_val.strip().casefold() if isinstance(saved_val, str) else saved_val
        else:
            snap_norm = snap_val
            saved_norm = saved_val
        if snap_norm != saved_norm:
            diffs.append(field)
    return diffs


def _apply_provenance(event: "VehicleEvent", source: str, scan_snapshot: dict | None) -> None:
    """Set / recompute provenance fields on a newly-created or updated event."""
    if scan_snapshot is not None:
        event.scan_snapshot = scan_snapshot
    # Compute edited_fields against the stored snapshot
    edited = _compute_edited_fields(event) if event.scan_snapshot else []
    event.edited_fields = edited
    if event.scan_snapshot:
        event.source = "scan_edited" if edited else "scan"
    else:
        event.source = source if source in ("manual", "scan", "scan_edited") else "manual"


def create_vehicle_event(
    db: Session, vehicle: Vehicle, user: User, data: VehicleEventCreate,
    background_tasks: "BackgroundTasks | None" = None,
) -> VehicleEventRead:
    assert_vehicle_owner(vehicle, user)
    values = data.model_dump(
        exclude={"media", "documents", "source", "scan_snapshot"}, by_alias=False
    )
    event = VehicleEvent(vehicle_id=vehicle.id, author_user_id=user.id, **values)
    db.add(event)
    db.flush()
    # Apply provenance before commit so _compute_edited_fields sees the saved values
    _apply_provenance(event, data.source, data.scan_snapshot)
    new_media_rows: list[VehicleEventMedia] = []
    for index, media in enumerate(data.media):
        sk = _object_key_from_url(media.url)
        m_row = VehicleEventMedia(
            vehicle_event_id=event.id,
            sort_order=media.sort_order or index,
            media_type=media.media_type,
            url=media.url,
            thumbnail_url=media.thumbnail_url,
            width=media.width,
            height=media.height,
            storage_key=sk,
        )
        db.add(m_row)
        new_media_rows.append(m_row)
    new_doc_rows: list[VehicleEventDocument] = []
    for index, doc in enumerate(data.documents):
        sk = _object_key_from_url(doc.url)
        d_row = VehicleEventDocument(
            vehicle_event_id=event.id,
            sort_order=doc.sort_order or index,
            url=doc.url,
            filename=doc.filename,
            content_type=doc.content_type,
            storage_key=sk,
        )
        db.add(d_row)
        new_doc_rows.append(d_row)
    db.flush()
    # Capture IDs before commit for background tasks
    bg_media = [(m.id, m.url, m.storage_key, m.media_type) for m in new_media_rows]
    bg_docs = [(d.id, d.url, d.storage_key, d.content_type) for d in new_doc_rows]
    db.commit()
    # Schedule background tasks for privacy processing
    if background_tasks is not None:
        for mid, murl, msk, mime in bg_media:
            # Treat image media_type as image/jpeg for MIME detection
            _mime = "image/jpeg" if mime == "image" else mime
            background_tasks.add_task(_process_event_media_bg, mid, murl, msk, _mime)
        for did, durl, dsk, dctype in bg_docs:
            background_tasks.add_task(_process_event_doc_bg, did, durl, dsk, dctype)
    event_orm = get_vehicle_event_or_404(db, event.id, user)
    periods = _load_ownerships(db, vehicle.id)
    return _enrich_event(event_orm, periods, vehicle.owner_user_id, user)


def get_vehicle_event_or_404(db: Session, event_id: str, viewer: User | None) -> VehicleEvent:
    event = db.scalar(
        select(VehicleEvent)
        .options(
            selectinload(VehicleEvent.media),
            selectinload(VehicleEvent.documents),
            selectinload(VehicleEvent.vehicle),
        )
        .where(VehicleEvent.id == event_id, VehicleEvent.deleted_at.is_(None))
    )
    if not event:
        raise HTTPException(status_code=404, detail="Vehicle event not found")
    is_owner = viewer and event.vehicle.owner_user_id == viewer.id
    if not is_owner and (event.visibility != "public" or event.vehicle.visibility != "public"):
        raise HTTPException(status_code=404, detail="Vehicle event not found")
    return event


def list_vehicle_events(db: Session, vehicle: Vehicle, viewer: User | None) -> list[VehicleEvent]:
    """Return raw ORM VehicleEvent objects (used by export and internal callers)."""
    stmt = (
        select(VehicleEvent)
        .options(selectinload(VehicleEvent.media), selectinload(VehicleEvent.documents))
        .where(VehicleEvent.vehicle_id == vehicle.id, VehicleEvent.deleted_at.is_(None))
        .order_by(desc(VehicleEvent.event_date), desc(VehicleEvent.created_at))
    )
    if vehicle.owner_user_id != (viewer.id if viewer else None):
        stmt = stmt.where(VehicleEvent.visibility == "public")
    return list(db.scalars(stmt))


def list_vehicle_events_read(
    db: Session, vehicle: Vehicle, viewer: User | None
) -> list[VehicleEventRead]:
    """Return VehicleEventRead objects with ownership attribution (used by API routes)."""
    events = list_vehicle_events(db, vehicle, viewer)
    periods = _load_ownerships(db, vehicle.id)
    return [_enrich_event(e, periods, vehicle.owner_user_id, viewer) for e in events]


def get_vehicle_event_read(
    db: Session, event_id: str, viewer: User | None
) -> VehicleEventRead:
    """Return a single VehicleEventRead with ownership attribution."""
    event = get_vehicle_event_or_404(db, event_id, viewer)
    periods = _load_ownerships(db, event.vehicle_id)
    return _enrich_event(event, periods, event.vehicle.owner_user_id, viewer)


def update_vehicle_event(
    db: Session,
    event: VehicleEvent,
    user: User,
    data: VehicleEventUpdate,
    background_tasks: "BackgroundTasks | None" = None,
) -> VehicleEventRead:
    if event.vehicle.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this vehicle")
    if event.author_user_id != user.id:
        raise HTTPException(status_code=403, detail="You did not create this event")
    payload = data.model_dump(exclude_unset=True, by_alias=False)
    media_provided = "media" in payload
    documents_provided = "documents" in payload
    payload.pop("media", None)
    payload.pop("documents", None)
    for key, value in payload.items():
        setattr(event, key, value)
    new_media_rows: list[VehicleEventMedia] = []
    if media_provided:
        # Delete old storage objects, then delete the rows.
        for existing in list(event.media):
            _delete_event_media_storage(existing)
            db.delete(existing)
        db.flush()
        for index, media in enumerate(data.media or []):
            sk = _object_key_from_url(media.url)
            m_row = VehicleEventMedia(
                vehicle_event_id=event.id,
                sort_order=media.sort_order or index,
                media_type=media.media_type,
                url=media.url,
                thumbnail_url=media.thumbnail_url,
                width=media.width,
                height=media.height,
                storage_key=sk,
            )
            db.add(m_row)
            new_media_rows.append(m_row)
    new_doc_rows: list[VehicleEventDocument] = []
    if documents_provided:
        for existing in list(event.documents):
            _delete_event_doc_storage(existing)
            db.delete(existing)
        db.flush()
        for index, doc in enumerate(data.documents or []):
            sk = _object_key_from_url(doc.url)
            d_row = VehicleEventDocument(
                vehicle_event_id=event.id,
                sort_order=doc.sort_order or index,
                url=doc.url,
                filename=doc.filename,
                content_type=doc.content_type,
                storage_key=sk,
            )
            db.add(d_row)
            new_doc_rows.append(d_row)
    if new_media_rows or new_doc_rows:
        db.flush()
    # Recompute provenance if the event was scan-sourced
    if event.scan_snapshot:
        _apply_provenance(event, event.source, None)  # snapshot unchanged, re-diff
    # Capture IDs for background tasks
    bg_media = [(m.id, m.url, m.storage_key, m.media_type) for m in new_media_rows]
    bg_docs = [(d.id, d.url, d.storage_key, d.content_type) for d in new_doc_rows]
    db.commit()
    if background_tasks is not None:
        for mid, murl, msk, mime in bg_media:
            _mime = "image/jpeg" if mime == "image" else mime
            background_tasks.add_task(_process_event_media_bg, mid, murl, msk, _mime)
        for did, durl, dsk, dctype in bg_docs:
            background_tasks.add_task(_process_event_doc_bg, did, durl, dsk, dctype)
    # expire_on_commit is off, so refresh the (now stale) collections.
    expired = [rel for rel, provided in (("media", media_provided), ("documents", documents_provided)) if provided]
    if expired:
        db.expire(event, expired)
    event_orm = get_vehicle_event_or_404(db, event.id, user)
    periods = _load_ownerships(db, event.vehicle_id)
    return _enrich_event(event_orm, periods, event.vehicle.owner_user_id, user)


def delete_vehicle_event(db: Session, event: VehicleEvent, user: User) -> None:
    if event.vehicle.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this vehicle")
    if event.author_user_id != user.id:
        raise HTTPException(status_code=403, detail="You did not create this event")
    event.deleted_at = datetime.now(UTC)
    db.commit()


def toggle_event_media_public(
    db: Session, media_id: str, is_public: bool, user: User
) -> "EventMediaRead":
    """Toggle is_public on a VehicleEventMedia row. Owner only.
    Raises 409 if pii_status != 'none' when attempting to make public."""
    from sqlalchemy.orm import selectinload as _sil
    row = db.scalar(
        select(VehicleEventMedia)
        .options(
            _sil(VehicleEventMedia.event).options(
                _sil(VehicleEvent.vehicle)
            )
        )
        .where(VehicleEventMedia.id == media_id)
    )
    if not row or not row.event or not row.event.vehicle:
        raise HTTPException(status_code=404, detail="Event media not found")
    if row.event.vehicle.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this vehicle")
    if is_public and row.pii_status != "none":
        raise HTTPException(status_code=409, detail="Locked private: contains personal info")
    if is_public and not row.is_public:
        # Copy to public bucket so the public URL is accessible
        if row.storage_key:
            try:
                _copy_to_public_bucket(row.storage_key)
            except Exception:
                pass
    elif not is_public and row.is_public:
        # Remove the public copy
        if row.storage_key:
            _delete_from_public_bucket(row.storage_key)
    row.is_public = is_public
    db.commit()
    return _event_media_read(row, is_owner=True)


def toggle_event_document_public(
    db: Session, doc_id: str, is_public: bool, user: User
) -> "EventDocumentRead":
    """Toggle is_public on a VehicleEventDocument row. Owner only.
    Raises 409 if pii_status != 'none' when attempting to make public."""
    from sqlalchemy.orm import selectinload as _sil
    row = db.scalar(
        select(VehicleEventDocument)
        .options(
            _sil(VehicleEventDocument.event).options(
                _sil(VehicleEvent.vehicle)
            )
        )
        .where(VehicleEventDocument.id == doc_id)
    )
    if not row or not row.event or not row.event.vehicle:
        raise HTTPException(status_code=404, detail="Event document not found")
    if row.event.vehicle.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this vehicle")
    if is_public and row.pii_status != "none":
        raise HTTPException(status_code=409, detail="Locked private: contains personal info")
    if is_public and not row.is_public:
        if row.storage_key:
            try:
                _copy_to_public_bucket(row.storage_key)
            except Exception:
                pass
    elif not is_public and row.is_public:
        if row.storage_key:
            _delete_from_public_bucket(row.storage_key)
    row.is_public = is_public
    db.commit()
    return _event_doc_read(row, is_owner=True)


def create_vehicle_mod(
    db: Session, vehicle: Vehicle, user: User, data: VehicleModCreate
) -> VehicleMod:
    assert_vehicle_owner(vehicle, user)
    values = data.model_dump(exclude={"media"}, by_alias=False)
    mod = VehicleMod(vehicle_id=vehicle.id, author_user_id=user.id, **values)
    db.add(mod)
    db.flush()
    for index, media in enumerate(data.media):
        db.add(
            VehicleModMedia(
                vehicle_mod_id=mod.id,
                sort_order=media.sort_order or index,
                media_type=media.media_type,
                url=media.url,
                thumbnail_url=media.thumbnail_url,
                width=media.width,
                height=media.height,
            )
        )
    db.commit()
    return get_vehicle_mod_or_404(db, mod.id, user)


def get_vehicle_mod_or_404(db: Session, mod_id: str, viewer: User | None) -> VehicleMod:
    mod = db.scalar(
        select(VehicleMod)
        .options(selectinload(VehicleMod.vehicle), selectinload(VehicleMod.media))
        .where(VehicleMod.id == mod_id, VehicleMod.deleted_at.is_(None))
    )
    if not mod or not can_view_vehicle(mod.vehicle, viewer):
        raise HTTPException(status_code=404, detail="Vehicle mod not found")
    return mod


def list_vehicle_mods(db: Session, vehicle: Vehicle, viewer: User | None) -> list[VehicleMod]:
    stmt = (
        select(VehicleMod)
        .options(selectinload(VehicleMod.media))
        .where(VehicleMod.vehicle_id == vehicle.id, VehicleMod.deleted_at.is_(None))
        .order_by(VehicleMod.category, VehicleMod.sort_order, VehicleMod.created_at)
    )
    return list(db.scalars(stmt))


def update_vehicle_mod(
    db: Session, mod: VehicleMod, user: User, data: VehicleModUpdate
) -> VehicleMod:
    if mod.vehicle.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this vehicle")
    payload = data.model_dump(exclude_unset=True, by_alias=False)
    media_provided = "media" in payload
    payload.pop("media", None)
    for key, value in payload.items():
        setattr(mod, key, value)
    if media_provided:
        # Replace the mod's media with the supplied set.
        for existing in list(mod.media):
            db.delete(existing)
        db.flush()
        for index, media in enumerate(data.media or []):
            db.add(
                VehicleModMedia(
                    vehicle_mod_id=mod.id,
                    sort_order=media.sort_order or index,
                    media_type=media.media_type,
                    url=media.url,
                    thumbnail_url=media.thumbnail_url,
                    width=media.width,
                    height=media.height,
                )
            )
    db.commit()
    # expire_on_commit is off, so refresh the (now stale) media collection.
    if media_provided:
        db.expire(mod, ["media"])
    return get_vehicle_mod_or_404(db, mod.id, user)


def delete_vehicle_mod(db: Session, mod: VehicleMod, user: User) -> None:
    if mod.vehicle.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this vehicle")
    mod.deleted_at = datetime.now(UTC)
    db.commit()


def like_post(db: Session, post: Post, user: User) -> None:
    if not db.get(PostLike, {"post_id": post.id, "user_id": user.id}):
        db.add(PostLike(post_id=post.id, user_id=user.id))
        db.commit()


def unlike_post(db: Session, post: Post, user: User) -> None:
    like = db.get(PostLike, {"post_id": post.id, "user_id": user.id})
    if like:
        db.delete(like)
        db.commit()


def list_post_likers(db: Session, post: Post) -> list[PublicUser]:
    users = db.scalars(
        select(User)
        .join(PostLike, PostLike.user_id == User.id)
        .where(PostLike.post_id == post.id)
        .order_by(desc(PostLike.created_at))
    ).all()
    return [PublicUser.model_validate(u) for u in users]


def create_comment(db: Session, post: Post, user: User, data: CommentCreate) -> Comment:
    if data.parent_comment_id:
        parent = db.get(Comment, data.parent_comment_id)
        if not parent or parent.post_id != post.id or parent.deleted_at is not None:
            raise HTTPException(status_code=400, detail="Parent comment not found")
    comment = Comment(
        post_id=post.id,
        author_user_id=user.id,
        body=data.body,
        parent_comment_id=data.parent_comment_id,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def get_comment_or_404(db: Session, comment_id: str, viewer: User | None) -> Comment:
    comment = db.scalar(
        select(Comment)
        .options(selectinload(Comment.author), selectinload(Comment.post))
        .where(Comment.id == comment_id, Comment.deleted_at.is_(None))
    )
    if not comment or not can_view_post(comment.post, viewer):
        raise HTTPException(status_code=404, detail="Comment not found")
    return comment


def compose_comments(db: Session, comments: list[Comment], viewer: User | None) -> list[CommentRead]:
    if not comments:
        return []
    comment_ids = [comment.id for comment in comments]
    like_counts = {
        comment_id: count
        for comment_id, count in db.execute(
            select(CommentLike.comment_id, func.count(CommentLike.user_id))
            .where(CommentLike.comment_id.in_(comment_ids))
            .group_by(CommentLike.comment_id)
        )
    }
    viewer_likes: set[str] = set()
    if viewer:
        viewer_likes = set(
            db.scalars(
                select(CommentLike.comment_id).where(
                    CommentLike.comment_id.in_(comment_ids), CommentLike.user_id == viewer.id
                )
            )
        )
    return [
        CommentRead(
            id=comment.id,
            post_id=comment.post_id,
            author_user_id=comment.author_user_id,
            parent_comment_id=comment.parent_comment_id,
            body=comment.body,
            created_at=comment.created_at,
            updated_at=comment.updated_at,
            author=public_user(comment.author),
            like_count=int(like_counts.get(comment.id, 0)),
            viewer_has_liked=comment.id in viewer_likes,
        )
        for comment in comments
    ]


def list_comments(db: Session, post: Post, viewer: User | None) -> list[CommentRead]:
    comments = list(
        db.scalars(
            select(Comment)
            .options(selectinload(Comment.author))
            .where(Comment.post_id == post.id, Comment.deleted_at.is_(None))
            .order_by(Comment.created_at)
            .limit(100)
        )
    )
    return compose_comments(db, comments, viewer)


def delete_comment(db: Session, comment: Comment, user: User) -> None:
    if comment.author_user_id != user.id and comment.post.author_user_id != user.id:
        raise HTTPException(status_code=403, detail="You cannot delete this comment")
    comment.deleted_at = datetime.now(UTC)
    db.commit()


def like_comment(db: Session, comment: Comment, user: User) -> None:
    if not db.get(CommentLike, {"comment_id": comment.id, "user_id": user.id}):
        db.add(CommentLike(comment_id=comment.id, user_id=user.id))
        db.commit()


def unlike_comment(db: Session, comment: Comment, user: User) -> None:
    like = db.get(CommentLike, {"comment_id": comment.id, "user_id": user.id})
    if like:
        db.delete(like)
        db.commit()


@lru_cache(maxsize=1)
def _s3_client():
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.storage_endpoint_url,
        region_name=settings.storage_region,
        aws_access_key_id=settings.storage_access_key_id,
        aws_secret_access_key=settings.storage_secret_access_key,
        # Path-style addressing: required for GCS's S3-compatible (XML) API to
        # avoid SignatureDoesNotMatch, and equally fine for MinIO locally.
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def build_upload_url(data: UploadUrlRequest) -> UploadUrlResponse:
    settings = get_settings()
    extension = data.filename.rsplit(".", 1)[-1].lower() if "." in data.filename else "jpg"
    object_key = f"{data.purpose}/{uuid.uuid4()}.{extension}"
    client = _s3_client()
    upload_url = client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.storage_bucket,
            "Key": object_key,
            "ContentType": data.content_type,
        },
        ExpiresIn=600,
    )
    return UploadUrlResponse(
        uploadUrl=upload_url,
        publicUrl=f"{settings.public_media_base_url}/{object_key}",
        objectKey=object_key,
        maxUploadBytes=settings.max_upload_bytes,
    )


def _ensure_private_bucket() -> None:
    """Create the private bucket if it doesn't exist (best-effort, local dev only)."""
    settings = get_settings()
    client = _s3_client()
    try:
        client.head_bucket(Bucket=settings.storage_private_bucket)
    except Exception:
        try:
            client.create_bucket(Bucket=settings.storage_private_bucket)
        except Exception:
            pass


def store_upload(
    content: bytes,
    content_type: str,
    filename: str,
    purpose: str,
    private: bool = False,
) -> tuple[str, str]:
    """Upload bytes to object storage server-side and return (url, object_key).

    When private=True, uploads to the private bucket. The returned url is a
    relative path usable as a storage reference; callers that need an accessible
    URL for private objects must generate a presigned URL separately.
    Unlike build_upload_url (which hands a presigned URL to the browser), this
    streams the file through the API, so it works when the browser cannot reach
    the storage host directly.
    """
    settings = get_settings()
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    object_key = f"{purpose}/{uuid.uuid4()}.{extension}"
    client = _s3_client()
    bucket = settings.storage_private_bucket if private else settings.storage_bucket
    if private:
        _ensure_private_bucket()
    client.put_object(
        Bucket=bucket,
        Key=object_key,
        Body=content,
        ContentType=content_type,
    )
    # Private objects: return a relative URL (not directly accessible)
    # Public objects: return the full public URL
    if private:
        url = f"/media/{object_key}"
    else:
        url = f"{settings.public_media_base_url}/{object_key}"
    return url, object_key


def generate_private_read_url(storage_key: str, expiry: int = 3600) -> str:
    """Generate a presigned GET URL for a private bucket object."""
    settings = get_settings()
    client = _s3_client()
    if settings.storage_public_endpoint_url and settings.storage_public_endpoint_url != settings.storage_endpoint_url:
        # Sign against the browser-reachable host (dev: MinIO via the VPN IP); the
        # signature covers the Host header, so it must match what the client will call.
        client = boto3.client(
            "s3",
            endpoint_url=settings.storage_public_endpoint_url,
            region_name=settings.storage_region,
            aws_access_key_id=settings.storage_access_key_id,
            aws_secret_access_key=settings.storage_secret_access_key,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.storage_private_bucket, "Key": storage_key},
        ExpiresIn=expiry,
    )


def _copy_to_public_bucket(storage_key: str) -> None:
    """Copy an object from the private bucket to the public bucket."""
    settings = get_settings()
    client = _s3_client()
    client.copy_object(
        CopySource={"Bucket": settings.storage_private_bucket, "Key": storage_key},
        Bucket=settings.storage_bucket,
        Key=storage_key,
    )


def _delete_from_public_bucket(storage_key: str) -> None:
    """Delete an object from the public bucket (best-effort)."""
    settings = get_settings()
    try:
        _s3_client().delete_object(Bucket=settings.storage_bucket, Key=storage_key)
    except Exception:
        pass


def _delete_from_private_bucket(storage_key: str) -> None:
    """Delete an object from the private bucket (best-effort)."""
    settings = get_settings()
    try:
        _s3_client().delete_object(Bucket=settings.storage_private_bucket, Key=storage_key)
    except Exception:
        pass


def _delete_event_media_storage(m: "VehicleEventMedia") -> None:
    """Best-effort delete of all storage objects for an event media row."""
    if m.storage_key:
        _delete_from_private_bucket(m.storage_key)
        if m.is_public:
            _delete_from_public_bucket(m.storage_key)
    if m.blur_url:
        blur_key = _object_key_from_url(m.blur_url)
        if blur_key:
            try:
                _s3_client().delete_object(Bucket=get_settings().storage_bucket, Key=blur_key)
            except Exception:
                pass


def _delete_event_doc_storage(d: "VehicleEventDocument") -> None:
    """Best-effort delete of all storage objects for an event document row."""
    if d.storage_key:
        _delete_from_private_bucket(d.storage_key)
        if d.is_public:
            _delete_from_public_bucket(d.storage_key)
    if d.blur_url:
        blur_key = _object_key_from_url(d.blur_url)
        if blur_key:
            try:
                _s3_client().delete_object(Bucket=get_settings().storage_bucket, Key=blur_key)
            except Exception:
                pass


# --- Vehicle make/model/year catalog (standardized dropdowns) -----------------

_CATALOG_PATH = Path(__file__).parent / "data" / "vehicle_catalog.json"


@lru_cache(maxsize=1)
def _catalog() -> dict:
    return json.loads(_CATALOG_PATH.read_text())


def catalog_makes() -> list[str]:
    return _catalog()["makes"]


def catalog_years() -> list[int]:
    return sorted(_catalog()["years"], reverse=True)


def catalog_models(make: str, year: int) -> list[str]:
    return _catalog()["by_make_year"].get(make, {}).get(str(year), [])


# --- Location autocomplete (proxied to Photon / OpenStreetMap, no API key) ----

def geo_search(query: str) -> list[str]:
    query = query.strip()
    if len(query) < 2:
        return []
    url = "https://photon.komoot.io/api/?" + urlencode({"q": query, "limit": 6, "lang": "en"})
    req = urllib.request.Request(url, headers={"User-Agent": "mygarage/0.1 (location autocomplete)"})
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
    except Exception:
        return []
    results: list[str] = []
    seen: set[str] = set()
    for feature in data.get("features", []):
        p = feature.get("properties", {})
        parts = [p.get(k) for k in ("name", "city", "state", "country") if p.get(k)]
        label = ", ".join(dict.fromkeys(parts))  # ordered de-dupe (name often == city)
        if p.get("postcode"):
            label = f"{label} {p['postcode']}".strip()
        if label and label not in seen:
            seen.add(label)
            results.append(label)
    return results


# --- Video uploads (Cloudflare Stream, direct creator uploads) ---------------

_STREAM_API_BASE = "https://api.cloudflare.com/client/v4"
_STREAM_MAX_DURATION_CAP = 1800  # 30 min — bounds reserved capacity / cost.


def _stream_playback_urls(uid: str, customer_code: str) -> dict[str, str]:
    """Derive the public playback/thumbnail/iframe URLs from a video uid."""
    base = f"https://customer-{customer_code}.cloudflarestream.com/{uid}"
    return {
        "playback_url": f"{base}/manifest/video.m3u8",
        "hls_url": f"{base}/manifest/video.m3u8",
        "iframe_url": f"{base}/iframe",
        "thumbnail_url": f"{base}/thumbnails/thumbnail.jpg",
    }


def create_stream_direct_upload(max_duration_seconds: int) -> dict:
    """Reserve a Cloudflare Stream direct-creator-upload slot.

    Returns the upload target plus the derived playback URLs. Raises a 503
    HTTPException when Stream is not configured (don't 500), and a 502 when the
    Cloudflare API call fails.
    """
    settings = get_settings()
    if not settings.stream_enabled:
        raise HTTPException(status_code=503, detail="Video uploads are not configured")

    max_duration = max(1, min(int(max_duration_seconds), _STREAM_MAX_DURATION_CAP))
    url = f"{_STREAM_API_BASE}/accounts/{settings.cloudflare_account_id}/stream/direct_upload"
    try:
        resp = httpx.post(
            url,
            headers={"Authorization": f"Bearer {settings.cloudflare_stream_api_token}"},
            json={"maxDurationSeconds": max_duration},
            timeout=10,
        )
        resp.raise_for_status()
        body = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not reach the video upload service") from exc

    result = (body or {}).get("result") or {}
    uid = result.get("uid")
    upload_url = result.get("uploadURL")
    if not body.get("success") or not uid or not upload_url:
        raise HTTPException(status_code=502, detail="Video upload service returned an unexpected response")

    return {
        "uid": uid,
        "upload_url": upload_url,
        **_stream_playback_urls(uid, settings.cloudflare_stream_customer_code),
    }


def get_stream_video_status(uid: str) -> dict:
    """Poll a Cloudflare Stream video's processing status. Graceful on error."""
    settings = get_settings()
    if not settings.stream_enabled:
        raise HTTPException(status_code=503, detail="Video uploads are not configured")

    url = f"{_STREAM_API_BASE}/accounts/{settings.cloudflare_account_id}/stream/{uid}"
    try:
        resp = httpx.get(
            url,
            headers={"Authorization": f"Bearer {settings.cloudflare_stream_api_token}"},
            timeout=10,
        )
        resp.raise_for_status()
        result = (resp.json() or {}).get("result") or {}
    except Exception:
        return {"ready": False, "state": "unknown", "duration_seconds": None}

    state = ((result.get("status") or {}).get("state")) or "unknown"
    duration = result.get("duration")
    return {
        "ready": bool(result.get("readyToStream")),
        "state": state,
        "duration_seconds": int(duration) if isinstance(duration, (int, float)) and duration >= 0 else None,
    }


# --- History export (ZIP of CSV + named images) ------------------------------

def slugify(value: str | None) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return slug[:40] or "x"


def _object_key_from_url(url: str | None) -> str | None:
    """Map a stored media url back to its object-storage key."""
    if not url:
        return None
    settings = get_settings()
    # Relative dev form (/media/<key>) and any configured public base (prod: absolute GCS URL).
    for prefix in ("/media/", (settings.public_media_base_url or "").rstrip("/") + "/"):
        if prefix != "/" and url.startswith(prefix):
            return url[len(prefix) :]
    # Absolute URL that names one of our buckets: <endpoint>/<bucket>/<key>
    for bucket in (settings.storage_bucket, settings.storage_private_bucket, "car-social"):
        marker = f"/{bucket}/"
        if bucket and marker in url:
            return url.split(marker, 1)[1].split("?", 1)[0]
    return None


def _ownership_label_for_export(period: VehicleOwnership | None) -> str:
    """Return the owner label for the export 'owner' column."""
    if period is None:
        return "Previous owner"
    if period.owner_user_id is not None:
        if period.show_owner_name and period.owner_user:
            return f"@{period.owner_user.username}"
        return "Previous owner"
    return period.label or "Previous owner"


def export_history_zip(db: Session, vehicle: Vehicle, viewer: User | None) -> bytes:
    events = list_vehicle_events(db, vehicle, viewer)
    periods = _load_ownerships(db, vehicle.id)
    settings = get_settings()
    client = _s3_client()

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        csv_buffer = io.StringIO()
        writer = csv.writer(csv_buffer)
        writer.writerow(
            ["date", "type", "title", "description", "mileage", "cost_usd",
             "currency", "shop", "location", "owner", "photos", "documents"]
        )
        for idx, event in enumerate(events, start=1):
            photo_files: list[str] = []
            for n, media in enumerate(event.media, start=1):
                key = _object_key_from_url(media.url)
                if not key:
                    continue
                ext = key.rsplit(".", 1)[-1] if "." in key else "jpg"
                fname = (
                    f"{idx:03d}_{event.event_date or 'nodate'}_"
                    f"{slugify(event.event_type)}_{slugify(event.title)}_{n}.{ext}"
                )
                try:
                    obj = client.get_object(Bucket=settings.storage_bucket, Key=key)
                    zf.writestr(f"images/{fname}", obj["Body"].read())
                    photo_files.append(fname)
                except Exception:
                    continue
            doc_files: list[str] = []
            for n, doc in enumerate(event.documents, start=1):
                key = _object_key_from_url(doc.url)
                if not key:
                    continue
                ext = key.rsplit(".", 1)[-1] if "." in key else "pdf"
                fname = (
                    f"{idx:03d}_{event.event_date or 'nodate'}_"
                    f"{slugify(event.event_type)}_{slugify(event.title)}_{n}.{ext}"
                )
                try:
                    obj = client.get_object(Bucket=settings.storage_bucket, Key=key)
                    zf.writestr(f"documents/{fname}", obj["Body"].read())
                    doc_files.append(fname)
                except Exception:
                    continue
            cost_usd = f"{event.cost_cents / 100:.2f}" if event.cost_cents is not None else ""
            period = ownership_for_event(periods, event.event_date)
            owner_label = _ownership_label_for_export(period)
            writer.writerow([
                event.event_date or "",
                event.event_type,
                event.title,
                event.description or "",
                event.mileage if event.mileage is not None else "",
                cost_usd,
                event.currency or "",
                event.shop_name or "",
                event.location or "",
                owner_label,
                "; ".join(photo_files),
                "; ".join(doc_files),
            ])
        zf.writestr("history.csv", csv_buffer.getvalue())
        # Include ownerships.json
        ownerships_data = [
            {
                "id": p.id,
                "ordinal": p.ordinal,
                "ownerUserId": p.owner_user_id,
                "ownerUsername": (
                    p.owner_user.username
                    if p.owner_user_id and p.show_owner_name and p.owner_user
                    else None
                ),
                "label": p.label,
                "startDate": p.start_date.isoformat(),
                "startMileage": p.start_mileage,
                "endDate": p.end_date.isoformat() if p.end_date else None,
                "endMileage": p.end_mileage,
                "isCurrent": p.end_date is None,
            }
            for p in periods
        ]
        zf.writestr("ownerships.json", json.dumps(ownerships_data, indent=2))
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# AI extraction (Gemini) — receipt scan + fuel scan
# Proxied via backend (mobile/web never see the API key). Config-gated:
# endpoints 503 until GEMINI_API_KEY is set.

_GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

_RECEIPT_SCAN_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "event_type": {
            "type": "STRING",
            "enum": ["purchase", "sale", "repair", "maintenance", "upgrade",
                     "inspection", "detailing", "fuel", "accident", "note", "other"],
        },
        "title": {"type": "STRING"},
        "event_date": {"type": "STRING", "nullable": True},
        "total": {"type": "NUMBER", "nullable": True},
        "currency": {"type": "STRING", "nullable": True},
        "mileage": {"type": "INTEGER", "nullable": True},
        "shop_name": {"type": "STRING", "nullable": True},
        "location": {"type": "STRING", "nullable": True},
        "line_items": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "description": {"type": "STRING"},
                    "cost": {"type": "NUMBER", "nullable": True},
                },
                "required": ["description"],
            },
        },
        "tags": {
            "type": "ARRAY",
            "items": {"type": "STRING", "enum": [
                "oil", "filters", "fluids", "tires", "wheels", "alignment", "brakes", "suspension",
                "steering", "engine", "transmission", "drivetrain", "cooling", "belts", "exhaust",
                "fuel_system", "electrical", "battery", "hvac", "lights", "glass", "body", "interior",
                "inspection", "detailing", "other"]},
        },
        "confidence": {"type": "STRING", "enum": ["high", "medium", "low"]},
        "notes": {"type": "STRING", "nullable": True},
    },
    "required": ["event_type", "title", "line_items", "tags", "confidence"],
}

_RECEIPT_SCAN_PROMPT = """You are extracting data from ONE car service receipt/invoice \
(photos or PDF) for a vehicle history log. If several images are provided, they are pages \
or angles of the SAME bill — combine them into ONE result; never split them into multiple.
- title: short human title for the visit as a whole, e.g. 'Snow tire changeover + alignment'.
- event_type: categorize the visit overall. Use 'other' only when nothing fits.
- event_date: ISO YYYY-MM-DD. total: the GRAND TOTAL actually paid, tax included.
- mileage: odometer reading if printed. shop_name: business name. location: address/city.
- line_items: every distinct repair/service/part.
- tags: EVERY area worked on, from the fixed list (an oil change + tire rotation + brake pads = ["oil","filters","tires","brakes"]). Be generous but accurate; 'other' only if nothing fits.
- Use null for anything not present or unreadable — NEVER invent values.
- confidence: low if the image is hard to read; explain problems in notes."""

_FUEL_SCAN_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "total": {"type": "NUMBER", "nullable": True},
        "gallons": {"type": "NUMBER", "nullable": True},
        "price_per_gallon": {"type": "NUMBER", "nullable": True},
        "station_name": {"type": "STRING", "nullable": True},
        "mileage": {"type": "INTEGER", "nullable": True},
        "confidence": {"type": "STRING", "enum": ["high", "medium", "low"]},
        "notes": {"type": "STRING", "nullable": True},
    },
    "required": ["confidence"],
}

_FUEL_SCAN_PROMPT = """You are reading photos taken at a gas station for a vehicle fuel log.
You may receive a photo of the PUMP DISPLAY (total sale $, gallons, price per gallon and/or a
printed fuel receipt) and a photo of the car's ODOMETER (mileage).
- total: total sale amount in dollars. gallons: volume dispensed. price_per_gallon: unit price.
- mileage: the odometer reading (the large main number, not the trip meter if both are visible).
- station_name: brand/station if visible on the pump, receipt, or signage.
- Use null for anything not visible or unreadable — NEVER invent or guess values.
- confidence: low if displays are blurry/unreadable; explain in notes."""


def _gemini_generate(parts: list[dict], prompt: str, schema: dict) -> dict:
    """One Gemini generateContent call with a JSON response schema. Raises RuntimeError."""
    settings = get_settings()
    if not settings.ai_scan_enabled:
        raise RuntimeError("AI scan is not configured")
    body = {
        "contents": [{"parts": [*parts, {"text": prompt}]}],
        "generationConfig": {
            "response_mime_type": "application/json",
            "response_schema": schema,
        },
    }
    try:
        response = httpx.post(
            _GEMINI_URL.format(model=settings.gemini_model),
            headers={"x-goog-api-key": settings.gemini_api_key},
            json=body,
            timeout=60,
        )
    except httpx.HTTPError as exc:
        raise RuntimeError(f"AI service unreachable: {exc}") from exc
    if response.status_code != 200:
        raise RuntimeError(f"AI service error ({response.status_code})")
    try:
        text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except (KeyError, IndexError, ValueError) as exc:
        raise RuntimeError("AI service returned an unexpected response") from exc


def _inline_parts(files: list[tuple[bytes, str]]) -> list[dict]:
    return [
        {"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode()}}
        for data, mime in files
    ]


def scan_receipt(files: list[tuple[bytes, str]]) -> dict:
    """Extract a history-event suggestion from receipt photos/PDFs."""
    raw = _gemini_generate(_inline_parts(files), _RECEIPT_SCAN_PROMPT, _RECEIPT_SCAN_SCHEMA)
    lines = [
        f"- {item.get('description')}" + (f" — ${item['cost']:.2f}" if item.get("cost") is not None else "")
        for item in raw.get("line_items", [])
    ]
    return {
        "eventType": raw.get("event_type") or "other",
        "title": (raw.get("title") or "Service visit")[:160],
        "eventDate": raw.get("event_date"),
        "costCents": round(raw["total"] * 100) if raw.get("total") is not None else None,
        "currency": (raw.get("currency") or "USD")[:3].upper(),
        "mileage": raw.get("mileage"),
        "shopName": raw.get("shop_name"),
        "location": raw.get("location"),
        "description": "\n".join(lines) or None,
        "tags": [t for t in dict.fromkeys(raw.get("tags") or []) if isinstance(t, str)],
        "confidence": raw.get("confidence", "low"),
        "notes": raw.get("notes"),
    }


def scan_fuel(files: list[tuple[bytes, str]]) -> dict:
    """Extract fuel-up numbers from pump/odometer photos."""
    raw = _gemini_generate(_inline_parts(files), _FUEL_SCAN_PROMPT, _FUEL_SCAN_SCHEMA)
    return {
        "totalCents": round(raw["total"] * 100) if raw.get("total") is not None else None,
        "gallons": raw.get("gallons"),
        "pricePerGallon": raw.get("price_per_gallon"),
        "stationName": raw.get("station_name"),
        "mileage": raw.get("mileage"),
        "confidence": raw.get("confidence", "low"),
        "notes": raw.get("notes"),
    }


# ---------------------------------------------------------------------------
# Sitemap
# ---------------------------------------------------------------------------

_SITEMAP_LIMIT = 1000


def get_sitemap_entries(db: Session) -> SitemapEntries:
    """Return up to 1000 public vehicles, posts, and users for the XML sitemap.
    No auth required — only public-visibility rows are returned.
    """
    vehicles = list(
        db.execute(
            select(Vehicle.id, Vehicle.updated_at)
            .where(Vehicle.visibility == "public")
            .order_by(desc(Vehicle.updated_at))
            .limit(_SITEMAP_LIMIT)
        ).all()
    )

    posts = list(
        db.execute(
            select(Post.id, Post.updated_at)
            .where(Post.visibility == "public", Post.deleted_at.is_(None))
            .order_by(desc(Post.updated_at))
            .limit(_SITEMAP_LIMIT)
        ).all()
    )

    # Users: any user who owns at least one public vehicle or has a public post
    users = list(
        db.execute(
            select(User.username, User.updated_at)
            .where(
                User.id.in_(
                    select(Vehicle.owner_user_id)
                    .where(Vehicle.visibility == "public")
                    .union(
                        select(Post.author_user_id)
                        .where(Post.visibility == "public", Post.deleted_at.is_(None))
                    )
                )
            )
            .order_by(desc(User.updated_at))
            .limit(_SITEMAP_LIMIT)
        ).all()
    )

    return SitemapEntries(
        vehicles=[SitemapVehicleEntry(id=v.id, updatedAt=v.updated_at) for v in vehicles],
        posts=[SitemapPostEntry(id=p.id, updatedAt=p.updated_at) for p in posts],
        users=[SitemapUserEntry(username=u.username, updatedAt=u.updated_at) for u in users],
    )
