import os

os.environ["database_url"] = "sqlite+pysqlite:///:memory:"
os.environ["jwt_secret"] = "test-secret"

from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


Base.metadata.create_all(bind=engine)
client = TestClient(app)


def signup(username: str, email: str) -> dict:
    response = client.post(
        "/auth/signup",
        json={"username": username, "email": email, "password": "password123"},
    )
    assert response.status_code == 200, response.text
    return response.json()


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def create_vehicle(token: str, visibility: str = "public") -> dict:
    response = client.post(
        "/vehicles",
        headers=auth_headers(token),
        json={"make": "Porsche", "model": "911", "year": 1997, "visibility": visibility},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_user_can_create_vehicle_and_other_user_cannot_edit_it():
    owner = signup("owner", "owner@example.com")
    other = signup("other", "other@example.com")
    vehicle = create_vehicle(owner["accessToken"])

    response = client.patch(
        f"/vehicles/{vehicle['id']}",
        headers=auth_headers(other["accessToken"]),
        json={"nickname": "Not mine"},
    )

    assert response.status_code == 403


def test_user_can_create_post_with_own_vehicle_tag_and_cannot_tag_others():
    owner = signup("poster", "poster@example.com")
    other = signup("tagger", "tagger@example.com")
    vehicle = create_vehicle(owner["accessToken"])

    ok = client.post(
        "/posts",
        headers=auth_headers(owner["accessToken"]),
        json={"caption": "Canyon drive", "vehicleIds": [vehicle["id"]], "media": [], "visibility": "public"},
    )
    assert ok.status_code == 200, ok.text

    denied = client.post(
        "/posts",
        headers=auth_headers(other["accessToken"]),
        json={"caption": "Not mine", "vehicleIds": [vehicle["id"]], "media": [], "visibility": "public"},
    )
    assert denied.status_code == 403


def test_post_owner_can_delete_post():
    owner = signup("deleteowner", "deleteowner@example.com")
    other = signup("deleteother", "deleteother@example.com")
    post = client.post(
        "/posts",
        headers=auth_headers(owner["accessToken"]),
        json={"caption": "Sold the wheels", "vehicleIds": [], "media": [], "visibility": "public"},
    ).json()

    denied = client.delete(f"/posts/{post['id']}", headers=auth_headers(other["accessToken"]))
    deleted = client.delete(f"/posts/{post['id']}", headers=auth_headers(owner["accessToken"]))
    missing = client.get(f"/posts/{post['id']}")

    assert denied.status_code == 403
    assert deleted.status_code == 204
    assert missing.status_code == 404


def test_private_post_comments_load_for_owner_and_comments_can_be_liked_deleted():
    owner = signup("commentowner", "commentowner@example.com")
    commenter = signup("commenter", "commenter@example.com")
    post = client.post(
        "/posts",
        headers=auth_headers(owner["accessToken"]),
        json={"caption": "Private build note", "vehicleIds": [], "media": [], "visibility": "private"},
    ).json()
    comment = client.post(
        f"/posts/{post['id']}/comments",
        headers=auth_headers(owner["accessToken"]),
        json={"body": "Remember the torque spec"},
    )
    assert comment.status_code == 200, comment.text

    anonymous_comments = client.get(f"/posts/{post['id']}/comments")
    owner_comments = client.get(
        f"/posts/{post['id']}/comments", headers=auth_headers(owner["accessToken"])
    )
    like = client.post(
        f"/comments/{comment.json()['id']}/like", headers=auth_headers(owner["accessToken"])
    )
    liked_comments = client.get(
        f"/posts/{post['id']}/comments", headers=auth_headers(owner["accessToken"])
    ).json()
    denied_delete = client.delete(
        f"/comments/{comment.json()['id']}", headers=auth_headers(commenter["accessToken"])
    )
    deleted = client.delete(
        f"/comments/{comment.json()['id']}", headers=auth_headers(owner["accessToken"])
    )

    assert anonymous_comments.status_code == 404
    assert owner_comments.status_code == 200
    assert owner_comments.json()[0]["body"] == "Remember the torque spec"
    assert like.status_code == 204
    assert liked_comments[0]["like_count"] == 1
    assert liked_comments[0]["viewer_has_liked"] is True
    assert denied_delete.status_code == 404
    assert deleted.status_code == 204


def test_feed_excludes_private_posts_and_paginates_without_duplicates():
    user = signup("feeduser", "feed@example.com")
    token = user["accessToken"]
    for index in range(3):
        response = client.post(
            "/posts",
            headers=auth_headers(token),
            json={"caption": f"public {index}", "vehicleIds": [], "media": [], "visibility": "public"},
        )
        assert response.status_code == 200, response.text
    client.post(
        "/posts",
        headers=auth_headers(token),
        json={"caption": "private", "vehicleIds": [], "media": [], "visibility": "private"},
    )

    first = client.get("/feed?limit=2").json()
    second = client.get(f"/feed?limit=2&cursor={first['nextCursor']}").json()
    ids = [item["id"] for item in first["items"] + second["items"]]

    assert len(ids) == len(set(ids))
    assert all(item["visibility"] == "public" for item in first["items"] + second["items"])
    assert len(first["items"]) == 2


def test_vehicle_history_only_editable_by_owner():
    owner = signup("historyowner", "historyowner@example.com")
    other = signup("historyother", "historyother@example.com")
    vehicle = create_vehicle(owner["accessToken"])
    event = client.post(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(owner["accessToken"]),
        json={"eventType": "maintenance", "title": "Oil change", "eventDate": "2026-01-15", "visibility": "public", "media": []},
    )
    assert event.status_code == 200, event.text

    denied = client.patch(
        f"/vehicle-events/{event.json()['id']}",
        headers=auth_headers(other["accessToken"]),
        json={"title": "Changed"},
    )
    assert denied.status_code == 403


def test_owner_can_create_and_list_vehicle_mod():
    owner = signup("modowner", "modowner@example.com")
    vehicle = create_vehicle(owner["accessToken"])

    created = client.post(
        f"/vehicles/{vehicle['id']}/mods",
        headers=auth_headers(owner["accessToken"]),
        json={
            "category": "Suspension",
            "name": "Ohlins R&T coilovers",
            "brand": "Ohlins",
            "costCents": 250000,
        },
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["category"] == "Suspension"
    assert body["name"] == "Ohlins R&T coilovers"
    assert body["cost_cents"] == 250000
    assert body["currency"] == "USD"

    listed = client.get(f"/vehicles/{vehicle['id']}/mods")
    assert listed.status_code == 200, listed.text
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == body["id"]


def test_non_owner_cannot_create_update_or_delete_mod():
    owner = signup("modowner2", "modowner2@example.com")
    other = signup("modother2", "modother2@example.com")
    vehicle = create_vehicle(owner["accessToken"])

    denied_create = client.post(
        f"/vehicles/{vehicle['id']}/mods",
        headers=auth_headers(other["accessToken"]),
        json={"category": "Wheels & Tires", "name": "Not mine"},
    )
    assert denied_create.status_code == 403

    mod = client.post(
        f"/vehicles/{vehicle['id']}/mods",
        headers=auth_headers(owner["accessToken"]),
        json={"category": "Exhaust", "name": "Akrapovic"},
    ).json()

    denied_update = client.patch(
        f"/mods/{mod['id']}",
        headers=auth_headers(other["accessToken"]),
        json={"name": "Changed"},
    )
    denied_delete = client.delete(
        f"/mods/{mod['id']}", headers=auth_headers(other["accessToken"])
    )
    assert denied_update.status_code == 403
    assert denied_delete.status_code == 403


def test_private_vehicle_mods_hidden_from_others():
    owner = signup("modprivowner", "modprivowner@example.com")
    other = signup("modprivother", "modprivother@example.com")
    vehicle = create_vehicle(owner["accessToken"], visibility="private")
    mod = client.post(
        f"/vehicles/{vehicle['id']}/mods",
        headers=auth_headers(owner["accessToken"]),
        json={"category": "Engine", "name": "Stage 2 tune"},
    )
    assert mod.status_code == 200, mod.text

    anon = client.get(f"/vehicles/{vehicle['id']}/mods")
    other_view = client.get(
        f"/vehicles/{vehicle['id']}/mods", headers=auth_headers(other["accessToken"])
    )
    owner_view = client.get(
        f"/vehicles/{vehicle['id']}/mods", headers=auth_headers(owner["accessToken"])
    )
    assert anon.status_code == 404
    assert other_view.status_code == 404
    assert owner_view.status_code == 200
    assert len(owner_view.json()) == 1


def test_mod_update_is_partial_and_delete_soft_deletes():
    owner = signup("modeditowner", "modeditowner@example.com")
    vehicle = create_vehicle(owner["accessToken"])
    mod = client.post(
        f"/vehicles/{vehicle['id']}/mods",
        headers=auth_headers(owner["accessToken"]),
        json={"category": "Intake", "name": "K&N", "brand": "K&N"},
    ).json()

    updated = client.patch(
        f"/mods/{mod['id']}",
        headers=auth_headers(owner["accessToken"]),
        json={"name": "AEM cold air intake"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "AEM cold air intake"
    # brand untouched by the partial update
    assert updated.json()["brand"] == "K&N"

    deleted = client.delete(
        f"/mods/{mod['id']}", headers=auth_headers(owner["accessToken"])
    )
    assert deleted.status_code == 204
    remaining = client.get(f"/vehicles/{vehicle['id']}/mods").json()
    assert all(m["id"] != mod["id"] for m in remaining)


def test_deleting_vehicle_with_mods_succeeds():
    owner = signup("modvehdel", "modvehdel@example.com")
    vehicle = create_vehicle(owner["accessToken"])
    created = client.post(
        f"/vehicles/{vehicle['id']}/mods",
        headers=auth_headers(owner["accessToken"]),
        json={"category": "Brakes", "name": "Brembo BBK"},
    )
    assert created.status_code == 200, created.text

    deleted = client.delete(
        f"/vehicles/{vehicle['id']}", headers=auth_headers(owner["accessToken"])
    )
    assert deleted.status_code == 204, deleted.text


def test_mod_create_with_mileage_and_photo_then_read():
    owner = signup("modmilephoto", "modmilephoto@example.com")
    vehicle = create_vehicle(owner["accessToken"])

    created = client.post(
        f"/vehicles/{vehicle['id']}/mods",
        headers=auth_headers(owner["accessToken"]),
        json={
            "category": "Suspension",
            "name": "Coilovers",
            "mileage": 42000,
            "media": [{"url": "/media/vehicle_mod_media/a.jpg", "media_type": "image"}],
        },
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["mileage"] == 42000
    assert len(body["media"]) == 1
    assert body["media"][0]["url"] == "/media/vehicle_mod_media/a.jpg"

    fetched = client.get(f"/vehicles/{vehicle['id']}/mods").json()
    assert len(fetched) == 1
    assert fetched[0]["mileage"] == 42000
    assert len(fetched[0]["media"]) == 1


def test_mod_update_replaces_media_and_updates_mileage():
    owner = signup("modmediaedit", "modmediaedit@example.com")
    vehicle = create_vehicle(owner["accessToken"])
    mod = client.post(
        f"/vehicles/{vehicle['id']}/mods",
        headers=auth_headers(owner["accessToken"]),
        json={
            "category": "Exhaust",
            "name": "Cat-back",
            "mileage": 1000,
            "media": [{"url": "/media/vehicle_mod_media/old.jpg", "media_type": "image"}],
        },
    ).json()
    assert mod["media"][0]["url"] == "/media/vehicle_mod_media/old.jpg"

    updated = client.patch(
        f"/mods/{mod['id']}",
        headers=auth_headers(owner["accessToken"]),
        json={
            "mileage": 2000,
            "media": [{"url": "/media/vehicle_mod_media/new.jpg", "media_type": "image"}],
        },
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["mileage"] == 2000
    assert len(body["media"]) == 1
    assert body["media"][0]["url"] == "/media/vehicle_mod_media/new.jpg"
    # old media replaced, not appended
    assert all(m["url"] != "/media/vehicle_mod_media/old.jpg" for m in body["media"])


def test_deleting_vehicle_whose_mod_has_a_photo_succeeds():
    owner = signup("modphotovehdel", "modphotovehdel@example.com")
    vehicle = create_vehicle(owner["accessToken"])
    created = client.post(
        f"/vehicles/{vehicle['id']}/mods",
        headers=auth_headers(owner["accessToken"]),
        json={
            "category": "Brakes",
            "name": "Brembo BBK",
            "media": [{"url": "/media/vehicle_mod_media/brake.jpg", "media_type": "image"}],
        },
    )
    assert created.status_code == 200, created.text

    deleted = client.delete(
        f"/vehicles/{vehicle['id']}", headers=auth_headers(owner["accessToken"])
    )
    assert deleted.status_code == 204, deleted.text


# --- Cloudflare Stream video uploads -----------------------------------------

import httpx as _httpx  # noqa: E402

from app import services as _services  # noqa: E402
from app.config import get_settings as _get_settings  # noqa: E402


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def _enable_stream(monkeypatch):
    settings = _get_settings()
    monkeypatch.setattr(settings, "cloudflare_account_id", "acct-123", raising=False)
    monkeypatch.setattr(settings, "cloudflare_stream_api_token", "token-xyz", raising=False)
    monkeypatch.setattr(settings, "cloudflare_stream_customer_code", "abc123def", raising=False)


def test_video_direct_upload_returns_uid_and_derived_urls(monkeypatch):
    user = signup("videomaker", "videomaker@example.com")
    _enable_stream(monkeypatch)

    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        return _FakeResponse(
            {"success": True, "result": {"uploadURL": "https://upload.videodelivery.net/UID999", "uid": "UID999"}}
        )

    monkeypatch.setattr(_httpx, "post", fake_post)

    resp = client.post(
        "/media/video/direct-upload",
        headers=auth_headers(user["accessToken"]),
        json={"maxDurationSeconds": 120},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["uid"] == "UID999"
    assert body["uploadUrl"] == "https://upload.videodelivery.net/UID999"
    base = "https://customer-abc123def.cloudflarestream.com/UID999"
    assert body["hlsUrl"] == f"{base}/manifest/video.m3u8"
    assert body["playbackUrl"] == f"{base}/manifest/video.m3u8"
    assert body["iframeUrl"] == f"{base}/iframe"
    assert body["thumbnailUrl"] == f"{base}/thumbnails/thumbnail.jpg"
    assert captured["json"] == {"maxDurationSeconds": 120}


def test_video_direct_upload_clamps_max_duration(monkeypatch):
    user = signup("videoclamp", "videoclamp@example.com")
    _enable_stream(monkeypatch)

    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["json"] = json
        return _FakeResponse(
            {"success": True, "result": {"uploadURL": "https://upload.videodelivery.net/UIDc", "uid": "UIDc"}}
        )

    monkeypatch.setattr(_httpx, "post", fake_post)

    resp = client.post(
        "/media/video/direct-upload",
        headers=auth_headers(user["accessToken"]),
        json={"maxDurationSeconds": 99999},
    )
    assert resp.status_code == 200, resp.text
    assert captured["json"] == {"maxDurationSeconds": _services._STREAM_MAX_DURATION_CAP}


def test_video_direct_upload_503_when_not_configured(monkeypatch):
    user = signup("videodisabled", "videodisabled@example.com")
    settings = _get_settings()
    monkeypatch.setattr(settings, "cloudflare_account_id", None, raising=False)
    monkeypatch.setattr(settings, "cloudflare_stream_api_token", None, raising=False)
    monkeypatch.setattr(settings, "cloudflare_stream_customer_code", None, raising=False)

    resp = client.post(
        "/media/video/direct-upload",
        headers=auth_headers(user["accessToken"]),
        json={"maxDurationSeconds": 120},
    )
    assert resp.status_code == 503, resp.text
    assert resp.json()["detail"] == "Video uploads are not configured"


def test_video_direct_upload_requires_auth():
    resp = client.post("/media/video/direct-upload", json={"maxDurationSeconds": 120})
    assert resp.status_code == 401


def test_video_status_reports_ready_and_duration(monkeypatch):
    user = signup("videostatus", "videostatus@example.com")
    _enable_stream(monkeypatch)

    def fake_get(url, headers=None, timeout=None):
        return _FakeResponse(
            {"success": True, "result": {"readyToStream": True, "status": {"state": "ready"}, "duration": 42}}
        )

    monkeypatch.setattr(_httpx, "get", fake_get)

    resp = client.get(
        "/media/video/UID999/status", headers=auth_headers(user["accessToken"])
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"ready": True, "state": "ready", "durationSeconds": 42}


def test_vin_is_masked_for_everyone_but_the_owner():
    owner = signup("vin-owner", "vin-owner@example.com")
    other = signup("vin-other", "vin-other@example.com")
    response = client.post(
        "/vehicles",
        headers=auth_headers(owner["accessToken"]),
        json={"make": "Toyota", "model": "4Runner", "year": 2004, "vin": "JTEBT17R748010246"},
    )
    assert response.status_code == 200, response.text
    vehicle_id = response.json()["id"]

    # Owner sees the VIN
    as_owner = client.get(f"/vehicles/{vehicle_id}", headers=auth_headers(owner["accessToken"]))
    assert as_owner.json()["vin"] == "JTEBT17R748010246"

    # Another logged-in user does not
    as_other = client.get(f"/vehicles/{vehicle_id}", headers=auth_headers(other["accessToken"]))
    assert as_other.json()["vin"] is None

    # Anonymous does not
    as_guest = client.get(f"/vehicles/{vehicle_id}")
    assert as_guest.json()["vin"] is None

    # The owner's public vehicle list masks it for others too
    owner_id = owner["user"]["id"]
    listed = client.get(f"/users/{owner_id}/vehicles", headers=auth_headers(other["accessToken"]))
    assert all(v["vin"] is None for v in listed.json())
    listed_own = client.get(f"/users/{owner_id}/vehicles", headers=auth_headers(owner["accessToken"]))
    assert any(v["vin"] == "JTEBT17R748010246" for v in listed_own.json())


def test_user_settings_defaults_and_patch():
    user = signup("settings-user", "settings-user@example.com")
    token = user["accessToken"]

    # Default: settings with both flags True
    me = client.get("/auth/me", headers=auth_headers(token))
    assert me.status_code == 200, me.text
    s = me.json()["settings"]
    assert s["detectMissedFillups"] is True
    assert s["includeEstimatedFuel"] is True

    # PATCH: turn off detectMissedFillups
    patch = client.patch(
        "/users/me",
        headers=auth_headers(token),
        json={"settings": {"detectMissedFillups": False}},
    )
    assert patch.status_code == 200, patch.text
    s2 = patch.json()["settings"]
    assert s2["detectMissedFillups"] is False
    assert s2["includeEstimatedFuel"] is True  # unchanged

    # GET confirms persistence
    me2 = client.get("/auth/me", headers=auth_headers(token))
    s3 = me2.json()["settings"]
    assert s3["detectMissedFillups"] is False
    assert s3["includeEstimatedFuel"] is True

    # PATCH back to true
    client.patch(
        "/users/me",
        headers=auth_headers(token),
        json={"settings": {"detectMissedFillups": True}},
    )
    me3 = client.get("/auth/me", headers=auth_headers(token))
    assert me3.json()["settings"]["detectMissedFillups"] is True


# ---------------------------------------------------------------------------
# Apple Sign-In tests
# ---------------------------------------------------------------------------

def _apple_claims(sub="apple_sub_001", email="appleuser@example.com"):
    """Return minimal Apple JWT claims dict for use with monkeypatching."""
    return {
        "sub": sub,
        "email": email,
        "iss": "https://appleid.apple.com",
        "aud": "com.carfable.app",
        "exp": 9999999999,
        "iat": 0,
    }


def test_apple_login_creates_new_user(monkeypatch):
    """First Apple login creates a user and returns a token."""
    import app.services as svc

    monkeypatch.setattr(svc, "_verify_apple_token", lambda token, audiences: _apple_claims())

    resp = client.post("/auth/apple", json={"credential": "fake.apple.jwt"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "accessToken" in body
    assert body["user"]["email"] == "appleuser@example.com"


def test_apple_login_second_login_matches_by_apple_sub(monkeypatch):
    """Second Apple login with same sub returns same user, no duplicate."""
    import app.services as svc

    claims = _apple_claims(sub="apple_sub_002", email="appleuser2@example.com")
    monkeypatch.setattr(svc, "_verify_apple_token", lambda token, audiences: claims)

    # First login
    r1 = client.post("/auth/apple", json={"credential": "fake.apple.jwt"})
    assert r1.status_code == 200, r1.text
    user_id_1 = r1.json()["user"]["id"]

    # Second login with same token/sub
    r2 = client.post("/auth/apple", json={"credential": "fake.apple.jwt"})
    assert r2.status_code == 200, r2.text
    user_id_2 = r2.json()["user"]["id"]

    assert user_id_1 == user_id_2, "Same Apple sub should map to same user"


def test_apple_login_email_link_case(monkeypatch):
    """Apple login links to existing email account and sets apple_sub."""
    import app.services as svc

    # Pre-existing email/password user
    existing = client.post(
        "/auth/signup",
        json={"username": "existing-apple-user", "email": "linked@example.com", "password": "password123"},
    )
    assert existing.status_code == 200, existing.text
    existing_user_id = existing.json()["user"]["id"]

    # Apple login with the same email
    claims = _apple_claims(sub="apple_sub_link_003", email="linked@example.com")
    monkeypatch.setattr(svc, "_verify_apple_token", lambda token, audiences: claims)

    resp = client.post("/auth/apple", json={"credential": "fake.apple.jwt"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Should return the same user
    assert body["user"]["id"] == existing_user_id
    assert "accessToken" in body


def test_apple_login_garbage_credential_returns_401(monkeypatch):
    """Sending a garbage credential without mocking should fail cleanly (no 500)."""
    # We don't monkeypatch here; the real _verify_apple_token will try to parse a bad JWT.
    # We mock only _fetch_apple_jwks to avoid network call.
    import app.services as svc

    monkeypatch.setattr(svc, "_fetch_apple_jwks", lambda force=False: {})

    resp = client.post("/auth/apple", json={"credential": "garbage.jwt.token"})
    assert resp.status_code == 401, resp.text


def test_sitemap_entries_returns_public_content_only():
    """GET /sitemap/entries: no auth, returns only public vehicles and posts."""
    owner = signup("sitemapowner", "sitemapowner@example.com")
    token = owner["accessToken"]

    public_vehicle = create_vehicle(token, visibility="public")
    private_vehicle = create_vehicle(token, visibility="private")

    pub_post = client.post(
        "/posts",
        headers=auth_headers(token),
        json={"caption": "public sitemap post", "vehicleIds": [], "media": [], "visibility": "public"},
    )
    assert pub_post.status_code == 200

    client.post(
        "/posts",
        headers=auth_headers(token),
        json={"caption": "private sitemap post", "vehicleIds": [], "media": [], "visibility": "private"},
    )

    resp = client.get("/sitemap/entries")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    vehicle_ids = [v["id"] for v in body["vehicles"]]
    post_ids = [p["id"] for p in body["posts"]]
    usernames = [u["username"] for u in body["users"]]

    assert public_vehicle["id"] in vehicle_ids
    assert private_vehicle["id"] not in vehicle_ids
    assert pub_post.json()["id"] in post_ids
    assert owner["user"]["username"] in usernames

    for v in body["vehicles"]:
        assert "updatedAt" in v
    for p in body["posts"]:
        assert "updatedAt" in p
    for u in body["users"]:
        assert "updatedAt" in u


# ---------------------------------------------------------------------------
# Ownership period tests (Slice 1)
# ---------------------------------------------------------------------------

def test_vehicle_create_yields_one_ownership_period():
    """Creating a vehicle automatically creates one current ownership period."""
    owner = signup("ownerships-create", "ownerships-create@example.com")
    vehicle = create_vehicle(owner["accessToken"])

    resp = client.get(
        f"/vehicles/{vehicle['id']}/ownerships",
        headers=auth_headers(owner["accessToken"]),
    )
    assert resp.status_code == 200, resp.text
    periods = resp.json()
    assert len(periods) == 1
    period = periods[0]
    assert period["ordinal"] == 1
    assert period["ownerUserId"] == owner["user"]["id"]
    assert period["isCurrent"] is True
    assert period["endDate"] is None


def test_event_attribution_current_period():
    """Events dated after purchase_date fall into the current ownership period."""
    owner = signup("attr-current", "attr-current@example.com")
    # Create vehicle with a purchase_date
    resp = client.post(
        "/vehicles",
        headers=auth_headers(owner["accessToken"]),
        json={"make": "Toyota", "model": "Camry", "year": 2010, "purchase_date": "2019-03-15"},
    )
    assert resp.status_code == 200, resp.text
    vehicle = resp.json()

    # Create an event after purchase_date
    event_resp = client.post(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(owner["accessToken"]),
        json={
            "eventType": "maintenance",
            "title": "Oil change",
            "eventDate": "2021-06-01",
            "media": [],
        },
    )
    assert event_resp.status_code == 200, event_resp.text
    event = event_resp.json()
    assert event["isPreviousOwner"] is False
    assert event["ownershipId"] is not None
    assert event["canEdit"] is True

    # Verify via list
    events_resp = client.get(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(owner["accessToken"]),
    )
    assert events_resp.status_code == 200, events_resp.text
    listed = events_resp.json()
    assert len(listed) == 1
    assert listed[0]["isPreviousOwner"] is False


def test_event_attribution_before_purchase_date_is_previous_owner():
    """Events dated before purchase_date are attributed to 'previous owner'."""
    owner = signup("attr-prev", "attr-prev@example.com")
    resp = client.post(
        "/vehicles",
        headers=auth_headers(owner["accessToken"]),
        json={"make": "Honda", "model": "Civic", "year": 2005, "purchase_date": "2015-01-01"},
    )
    assert resp.status_code == 200, resp.text
    vehicle = resp.json()

    # Event before purchase_date
    old_event_resp = client.post(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(owner["accessToken"]),
        json={
            "eventType": "repair",
            "title": "Old repair",
            "eventDate": "2012-06-01",
            "media": [],
        },
    )
    assert old_event_resp.status_code == 200, old_event_resp.text
    old_event = old_event_resp.json()
    assert old_event["isPreviousOwner"] is True
    assert old_event["ownershipId"] is None


def test_create_previous_ownership_period_and_attribution():
    """Creating a previous (non-user) period causes events in that date range to be attributed to it."""
    owner = signup("attr-prevperiod", "attr-prevperiod@example.com")
    resp = client.post(
        "/vehicles",
        headers=auth_headers(owner["accessToken"]),
        json={"make": "Ford", "model": "F-150", "year": 2003, "purchase_date": "2019-05-01"},
    )
    assert resp.status_code == 200, resp.text
    vehicle = resp.json()

    # Create a previous period
    prev_resp = client.post(
        f"/vehicles/{vehicle['id']}/ownerships",
        headers=auth_headers(owner["accessToken"]),
        json={
            "label": "First owner",
            "startDate": "2003-06-01",
            "endDate": "2019-05-01",
            "startMileage": 0,
        },
    )
    assert prev_resp.status_code == 200, prev_resp.text
    prev_period = prev_resp.json()
    assert prev_period["label"] == "First owner"
    assert prev_period["ownerUserId"] is None
    assert prev_period["isCurrent"] is False

    # Now get ownerships — should be 2 periods
    ownerships_resp = client.get(
        f"/vehicles/{vehicle['id']}/ownerships",
        headers=auth_headers(owner["accessToken"]),
    )
    assert ownerships_resp.status_code == 200, ownerships_resp.text
    periods = ownerships_resp.json()
    assert len(periods) == 2

    # Create an event in the previous period's date range
    old_event_resp = client.post(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(owner["accessToken"]),
        json={
            "eventType": "maintenance",
            "title": "Factory service",
            "eventDate": "2010-03-01",
            "media": [],
        },
    )
    assert old_event_resp.status_code == 200, old_event_resp.text
    old_event = old_event_resp.json()
    # Should now be attributed to the previous period, not "none"
    assert old_event["ownershipId"] == prev_period["id"]
    assert old_event["isPreviousOwner"] is True


def test_lock_rule_owner_but_not_creator_cannot_edit():
    """Vehicle owner cannot edit an event they did not create (lock rule)."""
    from app.database import get_db as _get_db
    from app.models import VehicleEvent as _VE
    from sqlalchemy.orm import Session as _Session

    owner = signup("lock-owner", "lock-owner@example.com")
    other = signup("lock-other", "lock-other@example.com")
    vehicle = create_vehicle(owner["accessToken"])

    # Owner creates an event
    event_resp = client.post(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(owner["accessToken"]),
        json={
            "eventType": "maintenance",
            "title": "Owner's oil change",
            "eventDate": "2024-01-01",
            "media": [],
        },
    )
    assert event_resp.status_code == 200, event_resp.text
    event_id = event_resp.json()["id"]
    other_user_id = other["user"]["id"]

    # Directly change author_user_id to other user (simulating event created by other)
    db_gen = _get_db()
    db: _Session = next(db_gen)
    try:
        ev = db.get(_VE, event_id)
        ev.author_user_id = other_user_id
        db.commit()
    finally:
        db.close()

    # Owner can no longer edit (not the creator)
    denied = client.patch(
        f"/vehicle-events/{event_id}",
        headers=auth_headers(owner["accessToken"]),
        json={"title": "Changed"},
    )
    assert denied.status_code == 403, denied.text

    # Other user also cannot edit (not the vehicle owner)
    denied2 = client.patch(
        f"/vehicle-events/{event_id}",
        headers=auth_headers(other["accessToken"]),
        json={"title": "Changed"},
    )
    assert denied2.status_code == 403, denied2.text


def test_event_can_edit_true_for_owner_creator():
    """canEdit is True when the viewer is both the vehicle owner and the event creator."""
    owner = signup("canedit-owner", "canedit-owner@example.com")
    vehicle = create_vehicle(owner["accessToken"])

    event_resp = client.post(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(owner["accessToken"]),
        json={
            "eventType": "note",
            "title": "My note",
            "eventDate": "2024-05-01",
            "media": [],
        },
    )
    assert event_resp.status_code == 200, event_resp.text
    event = event_resp.json()
    assert event["canEdit"] is True

    # Anonymous viewer: canEdit should be False
    anon_resp = client.get(f"/vehicle-events/{event['id']}")
    assert anon_resp.status_code == 200, anon_resp.text
    assert anon_resp.json()["canEdit"] is False


def test_export_csv_has_owner_column():
    """History export CSV includes an 'owner' column."""
    import zipfile as _zf
    import io as _io
    import csv as _csv

    owner = signup("export-owner", "export-owner@example.com")
    resp = client.post(
        "/vehicles",
        headers=auth_headers(owner["accessToken"]),
        json={"make": "Subaru", "model": "Outback", "year": 2015, "purchase_date": "2020-01-01"},
    )
    assert resp.status_code == 200, resp.text
    vehicle = resp.json()

    # Event after purchase_date (current owner period)
    client.post(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(owner["accessToken"]),
        json={
            "eventType": "maintenance",
            "title": "Tire rotation",
            "eventDate": "2021-06-01",
            "media": [],
        },
    )

    export_resp = client.get(
        f"/vehicles/{vehicle['id']}/history/export",
        headers=auth_headers(owner["accessToken"]),
    )
    assert export_resp.status_code == 200, export_resp.text

    with _zf.ZipFile(_io.BytesIO(export_resp.content)) as z:
        assert "history.csv" in z.namelist()
        assert "ownerships.json" in z.namelist()
        csv_text = z.read("history.csv").decode()

    reader = _csv.DictReader(_io.StringIO(csv_text))
    assert "owner" in reader.fieldnames, f"Missing 'owner' column; fields: {reader.fieldnames}"
    rows = list(reader)
    assert len(rows) == 1
    # The event is in the current owner's period — should show @username
    assert rows[0]["owner"].startswith("@"), f"Expected @username, got: {rows[0]['owner']}"

# ---------------------------------------------------------------------------
# Media privacy tests
# ---------------------------------------------------------------------------

import io as _privio
from sqlalchemy.orm import Session as _OrmSession
from app.database import SessionLocal as _SL
from app.models import VehicleEventMedia as _VEM, VehicleEventDocument as _VED
from app import services as _svc_mod


def _set_media_pii_status(media_id: str, pii_status: str, pii_kinds: list = None) -> None:
    """Directly update pii_status (and optionally pii_kinds) in the test DB."""
    from sqlalchemy import update as _upd
    with _SL() as db:
        vals = {"pii_status": pii_status}
        if pii_kinds is not None:
            vals["pii_kinds"] = pii_kinds
        db.execute(_upd(_VEM).where(_VEM.id == media_id).values(**vals))
        db.commit()


def _set_doc_pii_status(doc_id: str, pii_status: str, pii_kinds: list = None) -> None:
    from sqlalchemy import update as _upd
    with _SL() as db:
        vals = {"pii_status": pii_status}
        if pii_kinds is not None:
            vals["pii_kinds"] = pii_kinds
        db.execute(_upd(_VED).where(_VED.id == doc_id).values(**vals))
        db.commit()


def test_event_media_defaults_private_and_non_owner_gets_no_url():
    """New event media defaults to private; non-owner sees url=None + canView=False."""
    owner = signup("privmedia-owner", "privmedia-owner@example.com")
    other = signup("privmedia-other", "privmedia-other@example.com")
    vehicle = create_vehicle(owner["accessToken"])

    event_resp = client.post(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(owner["accessToken"]),
        json={
            "eventType": "maintenance",
            "title": "Oil change",
            "eventDate": "2026-01-15",
            "media": [{"url": "/media/vehicle_event_media/test.jpg", "media_type": "image"}],
        },
    )
    assert event_resp.status_code == 200, event_resp.text
    event = event_resp.json()
    media = event["media"][0]

    # Owner sees media (url is the raw stored value for legacy rows / presigned fallback in tests)
    assert media["canView"] is True
    assert media["isPublic"] is False
    assert media["piiStatus"] == "unknown"

    # Non-owner read
    anon_resp = client.get(f"/vehicle-events/{event['id']}")
    assert anon_resp.status_code == 200, anon_resp.text
    anon_media = anon_resp.json()["media"][0]
    assert anon_media["url"] is None
    assert anon_media["canView"] is False
    assert anon_media["isPublic"] is False

    # Other authenticated user
    other_resp = client.get(
        f"/vehicle-events/{event['id']}",
        headers=auth_headers(other["accessToken"]),
    )
    assert other_resp.status_code == 200, other_resp.text
    other_media = other_resp.json()["media"][0]
    assert other_media["url"] is None
    assert other_media["canView"] is False


def test_toggle_event_media_public_works_when_pii_none():
    """Owner can toggle media public when pii_status='none'."""
    owner = signup("togglemedia-owner", "togglemedia-owner@example.com")
    vehicle = create_vehicle(owner["accessToken"])
    event_resp = client.post(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(owner["accessToken"]),
        json={
            "eventType": "maintenance",
            "title": "Toggle test",
            "eventDate": "2026-02-01",
            "media": [{"url": "/media/vehicle_event_media/toggle.jpg", "media_type": "image"}],
        },
    )
    assert event_resp.status_code == 200, event_resp.text
    media_id = event_resp.json()["media"][0]["id"]

    # Manually set pii_status to 'none' (simulating completed classification)
    _set_media_pii_status(media_id, "none")

    # Toggle to public
    toggle_resp = client.patch(
        f"/vehicle-event-media/{media_id}",
        headers=auth_headers(owner["accessToken"]),
        json={"isPublic": True},
    )
    assert toggle_resp.status_code == 200, toggle_resp.text
    body = toggle_resp.json()
    assert body["isPublic"] is True
    assert body["canView"] is True

    # Now non-owner also sees it as viewable
    anon_event = client.get(f"/vehicle-events/{event_resp.json()['id']}").json()
    anon_m = anon_event["media"][0]
    assert anon_m["isPublic"] is True
    assert anon_m["canView"] is True

    # Toggle back to private
    toggle_back = client.patch(
        f"/vehicle-event-media/{media_id}",
        headers=auth_headers(owner["accessToken"]),
        json={"isPublic": False},
    )
    assert toggle_back.status_code == 200, toggle_back.text
    assert toggle_back.json()["isPublic"] is False


def test_toggle_event_media_public_rejected_409_when_pii_detected():
    """Toggling to public is rejected (409) when pii_status='detected'."""
    owner = signup("piimedia-owner", "piimedia-owner@example.com")
    vehicle = create_vehicle(owner["accessToken"])
    event_resp = client.post(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(owner["accessToken"]),
        json={
            "eventType": "maintenance",
            "title": "PII test",
            "eventDate": "2026-03-01",
            "media": [{"url": "/media/vehicle_event_media/pii.jpg", "media_type": "image"}],
        },
    )
    assert event_resp.status_code == 200, event_resp.text
    media_id = event_resp.json()["media"][0]["id"]

    # Simulate PII detected
    _set_media_pii_status(media_id, "detected", ["name", "address", "vin"])

    resp = client.patch(
        f"/vehicle-event-media/{media_id}",
        headers=auth_headers(owner["accessToken"]),
        json={"isPublic": True},
    )
    assert resp.status_code == 409, resp.text
    assert "Locked private" in resp.json()["detail"]


def test_blur_placeholder_produces_small_jpeg():
    """make_blur_placeholder returns a valid JPEG significantly smaller than the input."""
    from PIL import Image
    import io

    # Create a fake 200x100 red image
    img = Image.new("RGB", (200, 100), color=(180, 30, 30))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    original_bytes = buf.getvalue()

    blur_bytes = _svc_mod.make_blur_placeholder(original_bytes)

    # Must be a valid JPEG
    out_img = Image.open(io.BytesIO(blur_bytes))
    assert out_img.format == "JPEG"
    # Width should be 480
    assert out_img.width == 480
    # Height should be proportional (original was 200x100, so 480 wide → 240 tall)
    assert out_img.height == 240
    # File size should be small (blur + low quality JPEG)
    assert len(blur_bytes) < len(original_bytes) or len(blur_bytes) < 20_000


# ---------------------------------------------------------------------------
# Provenance tests
# ---------------------------------------------------------------------------

def test_event_provenance_manual_default():
    """Events created without scan data have source='manual'."""
    owner = signup("prov-manual", "prov-manual@example.com")
    vehicle = create_vehicle(owner["accessToken"])
    event_resp = client.post(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(owner["accessToken"]),
        json={"eventType": "maintenance", "title": "Manual oil change", "eventDate": "2026-01-10"},
    )
    assert event_resp.status_code == 200, event_resp.text
    body = event_resp.json()
    assert body["source"] == "manual"
    assert body["editedFields"] == []
    assert body["scanSnapshot"] is None


def test_event_provenance_scan_unedited():
    """Event created from scan with matching values → source='scan', editedFields=[]."""
    owner = signup("prov-scan", "prov-scan@example.com")
    vehicle = create_vehicle(owner["accessToken"])
    snapshot = {
        "eventDate": "2026-03-15",
        "costCents": 15000,
        "mileage": 52000,
        "shopName": "Quick Lube",
    }
    event_resp = client.post(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(owner["accessToken"]),
        json={
            "eventType": "maintenance",
            "title": "Oil change",
            "eventDate": "2026-03-15",
            "costCents": 15000,
            "mileage": 52000,
            "shopName": "Quick Lube",
            "source": "scan",
            "scanSnapshot": snapshot,
        },
    )
    assert event_resp.status_code == 200, event_resp.text
    body = event_resp.json()
    assert body["source"] == "scan"
    assert body["editedFields"] == []
    # Owner sees snapshot
    assert body["scanSnapshot"] == snapshot


def test_event_provenance_scan_edited_on_cost_change():
    """Scan event with changed cost → source='scan_edited', editedFields includes 'cost_cents'."""
    owner = signup("prov-edited", "prov-edited@example.com")
    vehicle = create_vehicle(owner["accessToken"])
    snapshot = {
        "eventDate": "2026-04-01",
        "costCents": 20000,
        "mileage": None,
        "shopName": "Jiffy Lube",
    }
    event_resp = client.post(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(owner["accessToken"]),
        json={
            "eventType": "maintenance",
            "title": "Lube job",
            "eventDate": "2026-04-01",
            "costCents": 18500,  # Different from snapshot (20000)
            "shopName": "Jiffy Lube",
            "source": "scan",
            "scanSnapshot": snapshot,
        },
    )
    assert event_resp.status_code == 200, event_resp.text
    body = event_resp.json()
    assert body["source"] == "scan_edited"
    assert "cost_cents" in body["editedFields"]


def test_event_provenance_title_only_change_stays_scan():
    """Changing only the title (not a trust-relevant field) doesn't flip source to scan_edited."""
    owner = signup("prov-title", "prov-title@example.com")
    vehicle = create_vehicle(owner["accessToken"])
    snapshot = {
        "eventDate": "2026-05-01",
        "costCents": 5000,
        "mileage": 60000,
        "shopName": "Bob's",
    }
    event_resp = client.post(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(owner["accessToken"]),
        json={
            "eventType": "maintenance",
            "title": "Quick service",  # title not in trust fields
            "eventDate": "2026-05-01",
            "costCents": 5000,
            "mileage": 60000,
            "shopName": "Bob's",
            "source": "scan",
            "scanSnapshot": snapshot,
        },
    )
    assert event_resp.status_code == 200, event_resp.text
    body = event_resp.json()
    assert body["source"] == "scan"
    assert body["editedFields"] == []


def test_scan_snapshot_hidden_from_non_owner():
    """Non-owners do not see scanSnapshot in event read."""
    owner = signup("prov-hidden-owner", "prov-hidden-owner@example.com")
    vehicle = create_vehicle(owner["accessToken"])
    snapshot = {"eventDate": "2026-06-01", "costCents": 9900}
    event_resp = client.post(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(owner["accessToken"]),
        json={
            "eventType": "maintenance",
            "title": "Service",
            "eventDate": "2026-06-01",
            "source": "scan",
            "scanSnapshot": snapshot,
        },
    )
    assert event_resp.status_code == 200, event_resp.text
    event_id = event_resp.json()["id"]

    anon_resp = client.get(f"/vehicle-events/{event_id}")
    assert anon_resp.status_code == 200
    assert anon_resp.json()["scanSnapshot"] is None


def test_toggle_requires_auth():
    """Toggle endpoint requires authentication."""
    resp = client.patch("/vehicle-event-media/nonexistent-id", json={"isPublic": True})
    assert resp.status_code == 401
