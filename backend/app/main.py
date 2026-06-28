from collections import defaultdict, deque
from time import monotonic

from fastapi import Depends, FastAPI, File, Form, Query, Request, Response, UploadFile
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.schemas import (
    CommentCreate,
    CommentRead,
    CursorPage,
    GoogleLoginRequest,
    LoginRequest,
    PostCreate,
    PostRead,
    PostUpdate,
    PublicUser,
    SignupRequest,
    TokenResponse,
    MediaUploadResponse,
    UploadUrlRequest,
    UploadUrlResponse,
    VideoDirectUploadRequest,
    VideoDirectUploadResponse,
    VideoStatusResponse,
    UserRead,
    UserUpdate,
    VehicleCreate,
    VehicleEventCreate,
    VehicleEventRead,
    VehicleEventUpdate,
    VehicleModCreate,
    VehicleModRead,
    VehicleModUpdate,
    VehicleRead,
    VehicleUpdate,
)
from app.security import get_current_user, get_optional_user
from app import services

settings = get_settings()
app = FastAPI(title="Car Social API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_rate_buckets: dict[str, deque[float]] = defaultdict(deque)


@app.middleware("http")
async def basic_write_rate_limit(request: Request, call_next):
    limited_prefixes = ("/posts", "/media/upload-url")
    if request.method in {"POST", "PATCH"} and request.url.path.startswith(limited_prefixes):
        key = f"{request.client.host if request.client else 'unknown'}:{request.url.path}"
        now = monotonic()
        bucket = _rate_buckets[key]
        while bucket and now - bucket[0] > 60:
            bucket.popleft()
        if len(bucket) >= 60:
            raise HTTPException(status_code=429, detail="Too many requests")
        bucket.append(now)
    return await call_next(request)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/signup", response_model=TokenResponse)
def signup(data: SignupRequest, db: Session = Depends(get_db)) -> TokenResponse:
    token, user = services.signup(db, data)
    return TokenResponse(accessToken=token, user=user)


@app.post("/auth/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    token, user = services.login(db, data)
    return TokenResponse(accessToken=token, user=user)


@app.post("/auth/google", response_model=TokenResponse)
def google_login(data: GoogleLoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    token, user = services.google_login(db, data)
    return TokenResponse(accessToken=token, user=user)


@app.post("/auth/logout")
def logout() -> dict[str, bool]:
    return {"ok": True}


@app.get("/auth/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@app.get("/users/{user_id}", response_model=UserRead)
def get_user(user_id: str, db: Session = Depends(get_db)) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.get("/users/by-username/{username}", response_model=UserRead)
def get_user_by_username(username: str, db: Session = Depends(get_db)) -> User:
    user = db.scalar(select(User).where(User.username == username.lower()))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.patch("/users/me", response_model=UserRead)
def update_me(
    data: UserUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> User:
    return services.update_user(db, user, data)


@app.get("/users/{user_id}/vehicles", response_model=list[VehicleRead])
def user_vehicles(
    user_id: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
) -> list:
    return services.list_user_vehicles(db, user_id, viewer)


@app.get("/users/{user_id}/posts", response_model=list[PostRead])
def user_posts(
    user_id: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
) -> list[PostRead]:
    return services.list_posts_for_user(db, user_id, viewer)


@app.post("/vehicles", response_model=VehicleRead)
def create_vehicle(
    data: VehicleCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    return services.create_vehicle(db, user, data)


@app.get("/vehicles/{vehicle_id}", response_model=VehicleRead)
def get_vehicle(
    vehicle_id: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
):
    return services.get_vehicle_or_404(db, vehicle_id, viewer)


@app.patch("/vehicles/{vehicle_id}", response_model=VehicleRead)
def update_vehicle(
    vehicle_id: str,
    data: VehicleUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    vehicle = services.get_vehicle_or_404(db, vehicle_id, user)
    return services.update_vehicle(db, vehicle, user, data)


@app.delete("/vehicles/{vehicle_id}", status_code=204)
def delete_vehicle(
    vehicle_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    vehicle = services.get_vehicle_or_404(db, vehicle_id, user)
    services.delete_vehicle(db, vehicle, user)


@app.get("/vehicles/{vehicle_id}/posts", response_model=list[PostRead])
def vehicle_posts(
    vehicle_id: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
) -> list[PostRead]:
    return services.list_posts_for_vehicle(db, vehicle_id, viewer)


@app.get("/vehicles/{vehicle_id}/gallery", response_model=list[PostRead])
def vehicle_gallery(
    vehicle_id: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
) -> list[PostRead]:
    return [post for post in services.list_posts_for_vehicle(db, vehicle_id, viewer) if post.media]


@app.post("/posts", response_model=PostRead)
def create_post(
    data: PostCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> PostRead:
    post = services.create_post(db, user, data)
    return services.compose_posts(db, [post.id], user)[0]


@app.get("/posts/{post_id}", response_model=PostRead)
def get_post(
    post_id: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
) -> PostRead:
    post = services.get_post_or_404(db, post_id, viewer)
    return services.compose_posts(db, [post.id], viewer)[0]


@app.patch("/posts/{post_id}", response_model=PostRead)
def update_post(
    post_id: str,
    data: PostUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PostRead:
    post = services.get_post_or_404(db, post_id, user)
    updated = services.update_post(db, post, user, data)
    return services.compose_posts(db, [updated.id], user)[0]


@app.delete("/posts/{post_id}", status_code=204)
def delete_post(
    post_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    post = services.get_post_or_404(db, post_id, user)
    services.delete_post(db, post, user)


@app.get("/feed", response_model=CursorPage)
def feed(
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
) -> CursorPage:
    items, next_cursor, has_more = services.NewestFeedService().get_feed(db, viewer, cursor, limit)
    return CursorPage(items=items, nextCursor=next_cursor, hasMore=has_more)


@app.post("/media/upload-url", response_model=UploadUrlResponse)
def upload_url(
    data: UploadUrlRequest, _user: User = Depends(get_current_user)
) -> UploadUrlResponse:
    return services.build_upload_url(data)


_ALLOWED_UPLOAD_TYPES = {"image/jpeg", "image/png", "image/webp"}
_ALLOWED_PURPOSES = {"post_media", "vehicle_cover", "vehicle_event_media", "vehicle_mod_media", "avatar"}
_DOCUMENT_PURPOSES = {"vehicle_event_document"}
_ALLOWED_DOCUMENT_TYPES = {"application/pdf"}
_MAX_DOCUMENT_BYTES = 25 * 1024 * 1024


@app.post("/media/upload", response_model=MediaUploadResponse)
async def upload_media(
    file: UploadFile = File(...),
    purpose: str = Form(...),
    _user: User = Depends(get_current_user),
) -> MediaUploadResponse:
    is_document = purpose in _DOCUMENT_PURPOSES
    if purpose not in _ALLOWED_PURPOSES and not is_document:
        raise HTTPException(status_code=422, detail="Invalid upload purpose")
    if is_document:
        if file.content_type not in _ALLOWED_DOCUMENT_TYPES:
            raise HTTPException(status_code=422, detail="Unsupported document type")
        max_bytes = _MAX_DOCUMENT_BYTES
    else:
        if file.content_type not in _ALLOWED_UPLOAD_TYPES:
            raise HTTPException(status_code=422, detail="Unsupported image type")
        max_bytes = settings.max_upload_bytes
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail="File is too large")
    url, object_key = services.store_upload(
        content, file.content_type, file.filename or "upload", purpose
    )
    return MediaUploadResponse(url=url, objectKey=object_key)


@app.post("/media/video/direct-upload", response_model=VideoDirectUploadResponse)
def video_direct_upload(
    data: VideoDirectUploadRequest | None = None,
    _user: User = Depends(get_current_user),
) -> VideoDirectUploadResponse:
    payload = data or VideoDirectUploadRequest()
    result = services.create_stream_direct_upload(payload.max_duration_seconds)
    return VideoDirectUploadResponse(**result)


@app.get("/media/video/{uid}/status", response_model=VideoStatusResponse)
def video_status(
    uid: str, _user: User = Depends(get_current_user)
) -> VideoStatusResponse:
    return VideoStatusResponse(**services.get_stream_video_status(uid))


@app.get("/catalog/makes", response_model=list[str])
def catalog_makes() -> list[str]:
    return services.catalog_makes()


@app.get("/catalog/years", response_model=list[int])
def catalog_years() -> list[int]:
    return services.catalog_years()


@app.get("/catalog/models", response_model=list[str])
def catalog_models(make: str, year: int) -> list[str]:
    return services.catalog_models(make, year)


@app.get("/geo/search", response_model=list[str])
def geo_search(q: str) -> list[str]:
    return services.geo_search(q)


@app.post("/vehicles/{vehicle_id}/events", response_model=VehicleEventRead)
def create_vehicle_event(
    vehicle_id: str,
    data: VehicleEventCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    vehicle = services.get_vehicle_or_404(db, vehicle_id, user)
    return services.create_vehicle_event(db, vehicle, user, data)


@app.get("/vehicles/{vehicle_id}/history/export")
def export_vehicle_history(
    vehicle_id: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
) -> Response:
    vehicle = services.get_vehicle_or_404(db, vehicle_id, viewer)
    data = services.export_history_zip(db, vehicle, viewer)
    name = "-".join(
        str(part) for part in [vehicle.year, vehicle.make, vehicle.model] if part
    )
    filename = f"{services.slugify(name)}-history.zip"
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/vehicles/{vehicle_id}/events", response_model=list[VehicleEventRead])
def vehicle_events(
    vehicle_id: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
):
    vehicle = services.get_vehicle_or_404(db, vehicle_id, viewer)
    return services.list_vehicle_events(db, vehicle, viewer)


@app.get("/vehicle-events/{event_id}", response_model=VehicleEventRead)
def vehicle_event(
    event_id: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
):
    return services.get_vehicle_event_or_404(db, event_id, viewer)


@app.patch("/vehicle-events/{event_id}", response_model=VehicleEventRead)
def update_vehicle_event(
    event_id: str,
    data: VehicleEventUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = services.get_vehicle_event_or_404(db, event_id, user)
    return services.update_vehicle_event(db, event, user, data)


@app.delete("/vehicle-events/{event_id}", status_code=204)
def delete_vehicle_event(
    event_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    event = services.get_vehicle_event_or_404(db, event_id, user)
    services.delete_vehicle_event(db, event, user)


@app.post("/vehicles/{vehicle_id}/mods", response_model=VehicleModRead)
def create_vehicle_mod(
    vehicle_id: str,
    data: VehicleModCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    vehicle = services.get_vehicle_or_404(db, vehicle_id, user)
    return services.create_vehicle_mod(db, vehicle, user, data)


@app.get("/vehicles/{vehicle_id}/mods", response_model=list[VehicleModRead])
def vehicle_mods(
    vehicle_id: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
):
    vehicle = services.get_vehicle_or_404(db, vehicle_id, viewer)
    return services.list_vehicle_mods(db, vehicle, viewer)


@app.patch("/mods/{mod_id}", response_model=VehicleModRead)
def update_vehicle_mod(
    mod_id: str,
    data: VehicleModUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    mod = services.get_vehicle_mod_or_404(db, mod_id, user)
    return services.update_vehicle_mod(db, mod, user, data)


@app.delete("/mods/{mod_id}", status_code=204)
def delete_vehicle_mod(
    mod_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    mod = services.get_vehicle_mod_or_404(db, mod_id, user)
    services.delete_vehicle_mod(db, mod, user)


@app.post("/posts/{post_id}/like", status_code=204)
def like_post(
    post_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    post = services.get_post_or_404(db, post_id, user)
    services.like_post(db, post, user)


@app.delete("/posts/{post_id}/like", status_code=204)
def unlike_post(
    post_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    post = services.get_post_or_404(db, post_id, user)
    services.unlike_post(db, post, user)


@app.get("/posts/{post_id}/likes", response_model=list[PublicUser])
def post_likers(
    post_id: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
) -> list[PublicUser]:
    post = services.get_post_or_404(db, post_id, viewer)
    return services.list_post_likers(db, post)


@app.get("/posts/{post_id}/comments", response_model=list[CommentRead])
def comments(
    post_id: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
) -> list[CommentRead]:
    post = services.get_post_or_404(db, post_id, viewer)
    return services.list_comments(db, post, viewer)


@app.post("/posts/{post_id}/comments", response_model=CommentRead)
def create_comment(
    post_id: str,
    data: CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CommentRead:
    post = services.get_post_or_404(db, post_id, user)
    comment = services.create_comment(db, post, user, data)
    return services.compose_comments(db, [comment], user)[0]


@app.delete("/comments/{comment_id}", status_code=204)
def delete_comment(
    comment_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    comment = services.get_comment_or_404(db, comment_id, user)
    services.delete_comment(db, comment, user)


@app.post("/comments/{comment_id}/like", status_code=204)
def like_comment(
    comment_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    comment = services.get_comment_or_404(db, comment_id, user)
    services.like_comment(db, comment, user)


@app.delete("/comments/{comment_id}/like", status_code=204)
def unlike_comment(
    comment_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    comment = services.get_comment_or_404(db, comment_id, user)
    services.unlike_comment(db, comment, user)
