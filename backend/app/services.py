import base64
import csv
import io
import json
import re
import urllib.request
import uuid
import zipfile
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
from sqlalchemy import Select, and_, desc, func, or_, select
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
    VehicleEventMedia,
)
from app.schemas import (
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
    UploadUrlRequest,
    UploadUrlResponse,
    UserUpdate,
    VehicleCreate,
    VehicleEventCreate,
    VehicleEventUpdate,
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


def update_user(db: Session, user: User, data: UserUpdate) -> User:
    values = data.model_dump(exclude_unset=True)
    if "username" in values and values["username"]:
        values["username"] = values["username"].lower()
        existing = db.scalar(select(User).where(User.username == values["username"], User.id != user.id))
        if existing:
            raise HTTPException(status_code=409, detail="Username already exists")
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
    db.commit()
    return get_vehicle_event_or_404(db, event.id, user)


def get_vehicle_event_or_404(db: Session, event_id: str, viewer: User | None) -> VehicleEvent:
    event = db.scalar(
        select(VehicleEvent)
        .options(selectinload(VehicleEvent.media), selectinload(VehicleEvent.vehicle))
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
        .options(selectinload(VehicleEvent.media))
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
    payload.pop("media", None)
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
    db.commit()
    if media_provided:
        # expire_on_commit is off, so refresh the (now stale) media collection.
        db.expire(event, ["media"])
    return get_vehicle_event_or_404(db, event.id, user)


def delete_vehicle_event(db: Session, event: VehicleEvent, user: User) -> None:
    if event.vehicle.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this vehicle")
    event.deleted_at = datetime.now(UTC)
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
        config=Config(signature_version="s3v4"),
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
             "currency", "shop", "location", "photos"]
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
            ])
        zf.writestr("history.csv", csv_buffer.getvalue())
    return buffer.getvalue()
