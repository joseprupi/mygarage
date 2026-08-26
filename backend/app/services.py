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
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

import boto3
from botocore.config import Config
from fastapi import HTTPException, status
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
)
from app.schemas import (
    AppleLoginRequest,
    CommentCreate,
    CommentRead,
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
    VehicleEventUpdate,
    VehicleModCreate,
    VehicleModUpdate,
    VehicleSummary,
    VehicleUpdate,
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
        db.execute(delete(VehicleEventMedia).where(VehicleEventMedia.vehicle_event_id.in_(event_ids)))
        db.execute(delete(VehicleEventDocument).where(VehicleEventDocument.vehicle_event_id.in_(event_ids)))
        db.execute(delete(VehicleEvent).where(VehicleEvent.vehicle_id == vehicle.id))
    mod_ids = list(db.scalars(select(VehicleMod.id).where(VehicleMod.vehicle_id == vehicle.id)))
    if mod_ids:
        db.execute(delete(VehicleModMedia).where(VehicleModMedia.vehicle_mod_id.in_(mod_ids)))
        db.execute(delete(VehicleMod).where(VehicleMod.vehicle_id == vehicle.id))
    db.execute(delete(PostVehicleTag).where(PostVehicleTag.vehicle_id == vehicle.id))
    db.delete(vehicle)
    db.commit()


def list_user_vehicles(db: Session, user_id: str, viewer: User | None) -> list[Vehicle]:
    stmt = select(Vehicle).where(Vehicle.owner_user_id == user_id).order_by(desc(Vehicle.created_at))
    if viewer is None or viewer.id != user_id:
        stmt = stmt.where(Vehicle.visibility == "public")
    return list(db.scalars(stmt))


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


def create_vehicle_event(
    db: Session, vehicle: Vehicle, user: User, data: VehicleEventCreate
) -> VehicleEvent:
    assert_vehicle_owner(vehicle, user)
    values = data.model_dump(exclude={"media"}, by_alias=False)
    values.pop("documents", None)
    event = VehicleEvent(vehicle_id=vehicle.id, author_user_id=user.id, **values)
    db.add(event)
    db.flush()
    for index, media in enumerate(data.media):
        db.add(
            VehicleEventMedia(
                vehicle_event_id=event.id,
                sort_order=media.sort_order or index,
                media_type=media.media_type,
                url=media.url,
                thumbnail_url=media.thumbnail_url,
                width=media.width,
                height=media.height,
            )
        )
    for index, doc in enumerate(data.documents):
        db.add(
            VehicleEventDocument(
                vehicle_event_id=event.id,
                sort_order=doc.sort_order or index,
                url=doc.url,
                filename=doc.filename,
                content_type=doc.content_type,
            )
        )
    db.commit()
    return get_vehicle_event_or_404(db, event.id, user)


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
    stmt = (
        select(VehicleEvent)
        .options(selectinload(VehicleEvent.media), selectinload(VehicleEvent.documents))
        .where(VehicleEvent.vehicle_id == vehicle.id, VehicleEvent.deleted_at.is_(None))
        .order_by(desc(VehicleEvent.event_date), desc(VehicleEvent.created_at))
    )
    if vehicle.owner_user_id != (viewer.id if viewer else None):
        stmt = stmt.where(VehicleEvent.visibility == "public")
    return list(db.scalars(stmt))


def update_vehicle_event(
    db: Session, event: VehicleEvent, user: User, data: VehicleEventUpdate
) -> VehicleEvent:
    if event.vehicle.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this vehicle")
    payload = data.model_dump(exclude_unset=True, by_alias=False)
    media_provided = "media" in payload
    documents_provided = "documents" in payload
    payload.pop("media", None)
    payload.pop("documents", None)
    for key, value in payload.items():
        setattr(event, key, value)
    if media_provided:
        # Replace the event's media with the supplied set.
        for existing in list(event.media):
            db.delete(existing)
        db.flush()
        for index, media in enumerate(data.media or []):
            db.add(
                VehicleEventMedia(
                    vehicle_event_id=event.id,
                    sort_order=media.sort_order or index,
                    media_type=media.media_type,
                    url=media.url,
                    thumbnail_url=media.thumbnail_url,
                    width=media.width,
                    height=media.height,
                )
            )
    if documents_provided:
        # Replace the event's documents with the supplied set.
        for existing in list(event.documents):
            db.delete(existing)
        db.flush()
        for index, doc in enumerate(data.documents or []):
            db.add(
                VehicleEventDocument(
                    vehicle_event_id=event.id,
                    sort_order=doc.sort_order or index,
                    url=doc.url,
                    filename=doc.filename,
                    content_type=doc.content_type,
                )
            )
    db.commit()
    # expire_on_commit is off, so refresh the (now stale) collections.
    expired = [rel for rel, provided in (("media", media_provided), ("documents", documents_provided)) if provided]
    if expired:
        db.expire(event, expired)
    return get_vehicle_event_or_404(db, event.id, user)


def delete_vehicle_event(db: Session, event: VehicleEvent, user: User) -> None:
    if event.vehicle.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this vehicle")
    event.deleted_at = datetime.now(UTC)
    db.commit()


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


def store_upload(content: bytes, content_type: str, filename: str, purpose: str) -> tuple[str, str]:
    """Upload bytes to object storage server-side and return (public_url, object_key).

    Unlike build_upload_url (which hands a presigned URL to the browser), this
    streams the file through the API, so it works when the browser cannot reach
    the storage host directly.
    """
    settings = get_settings()
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    object_key = f"{purpose}/{uuid.uuid4()}.{extension}"
    client = _s3_client()
    client.put_object(
        Bucket=settings.storage_bucket,
        Key=object_key,
        Body=content,
        ContentType=content_type,
    )
    return f"{settings.public_media_base_url}/{object_key}", object_key


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
    if url.startswith("/media/"):
        return url[len("/media/") :]
    if "/car-social/" in url:
        return url.split("/car-social/", 1)[1]
    return None


def export_history_zip(db: Session, vehicle: Vehicle, viewer: User | None) -> bytes:
    events = list_vehicle_events(db, vehicle, viewer)
    settings = get_settings()
    client = _s3_client()

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        csv_buffer = io.StringIO()
        writer = csv.writer(csv_buffer)
        writer.writerow(
            ["date", "type", "title", "description", "mileage", "cost_usd",
             "currency", "shop", "location", "photos", "documents"]
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
                "; ".join(photo_files),
                "; ".join(doc_files),
            ])
        zf.writestr("history.csv", csv_buffer.getvalue())
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
