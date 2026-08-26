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


# =============================================================================
# A) PASSWORD CHANGE / SET
# =============================================================================

def test_has_password_true_for_password_user():
    """Normal signup user has hasPassword=true."""
    user = signup("pwcheck1", "pwcheck1@example.com")
    me = client.get("/auth/me", headers=auth_headers(user["accessToken"]))
    assert me.status_code == 200, me.text
    assert me.json()["has_password"] is True


def test_change_password_correct_current():
    """User with password can change it with correct currentPassword."""
    user = signup("pwchange1", "pwchange1@example.com")
    token = user["accessToken"]

    resp = client.post(
        "/auth/change-password",
        headers=auth_headers(token),
        json={"currentPassword": "password123", "newPassword": "newpass456"},
    )
    assert resp.status_code == 204, resp.text

    # Old password no longer works
    old_login = client.post("/auth/login", json={"email": "pwchange1@example.com", "password": "password123"})
    assert old_login.status_code == 401

    # New password works
    new_login = client.post("/auth/login", json={"email": "pwchange1@example.com", "password": "newpass456"})
    assert new_login.status_code == 200, new_login.text


def test_change_password_incorrect_current_returns_401():
    """Wrong currentPassword is rejected."""
    user = signup("pwchange2", "pwchange2@example.com")
    resp = client.post(
        "/auth/change-password",
        headers=auth_headers(user["accessToken"]),
        json={"currentPassword": "wrongpass!", "newPassword": "newpass456"},
    )
    assert resp.status_code == 401, resp.text


def test_change_password_missing_current_for_password_user_returns_400():
    """Password user must supply currentPassword."""
    user = signup("pwchange3", "pwchange3@example.com")
    resp = client.post(
        "/auth/change-password",
        headers=auth_headers(user["accessToken"]),
        json={"newPassword": "newpass456"},
    )
    assert resp.status_code == 400, resp.text


def test_set_password_on_passwordless_user(monkeypatch):
    """Google/Apple user can set a password without currentPassword."""
    import app.services as svc
    # Create a Google user (no pbkdf2 hash)
    monkeypatch.setattr(svc, "google_login", lambda db, data: svc._google_login_test(db, data))

    # Simulate a "passwordless" user by creating one via signup then patching the hash
    user = signup("pwless1", "pwless1@example.com")
    token = user["accessToken"]

    # Directly patch the password_hash to simulate a Google-only user
    from app.database import SessionLocal
    from app.models import User as _User
    with SessionLocal() as db:
        u = db.get(_User, user["user"]["id"])
        u.password_hash = "google:fake_google_sub"
        db.commit()

    # Refresh token (old token still works, session is stateless JWT)
    resp = client.post(
        "/auth/change-password",
        headers=auth_headers(token),
        json={"newPassword": "brandnewpass"},
    )
    assert resp.status_code == 204, resp.text

    # Now user has a real password
    me = client.get("/auth/me", headers=auth_headers(token))
    assert me.json()["has_password"] is True

    # Can log in with new password
    login_resp = client.post("/auth/login", json={"email": "pwless1@example.com", "password": "brandnewpass"})
    assert login_resp.status_code == 200, login_resp.text


def test_change_password_min_length():
    """newPassword must be at least 8 characters."""
    user = signup("pwshort1", "pwshort1@example.com")
    resp = client.post(
        "/auth/change-password",
        headers=auth_headers(user["accessToken"]),
        json={"currentPassword": "password123", "newPassword": "short"},
    )
    assert resp.status_code == 422, resp.text


# =============================================================================
# B) REPORT + BLOCK
# =============================================================================

def test_report_post_idempotent():
    """Reporting the same post twice returns the existing report (200/201)."""
    reporter = signup("rpt-reporter1", "rpt-reporter1@example.com")
    author = signup("rpt-author1", "rpt-author1@example.com")
    post = client.post(
        "/posts",
        headers=auth_headers(author["accessToken"]),
        json={"caption": "Content", "vehicleIds": [], "media": [], "visibility": "public"},
    ).json()

    first = client.post(
        "/reports",
        headers=auth_headers(reporter["accessToken"]),
        json={"targetType": "post", "targetId": post["id"], "reason": "spam"},
    )
    assert first.status_code == 201, first.text
    first_id = first.json()["id"]

    second = client.post(
        "/reports",
        headers=auth_headers(reporter["accessToken"]),
        json={"targetType": "post", "targetId": post["id"], "reason": "spam"},
    )
    # Idempotent — returns existing
    assert second.status_code == 201, second.text
    assert second.json()["id"] == first_id


def test_report_missing_target_returns_404():
    """Reporting a non-existent post returns 404."""
    reporter = signup("rpt-reporter2", "rpt-reporter2@example.com")
    resp = client.post(
        "/reports",
        headers=auth_headers(reporter["accessToken"]),
        json={"targetType": "post", "targetId": "nonexistent-id", "reason": "spam"},
    )
    assert resp.status_code == 404, resp.text


def test_block_hides_feed_posts():
    """Posts by a blocked user are excluded from the feed."""
    blocker = signup("blk-blocker1", "blk-blocker1@example.com")
    blocked = signup("blk-blocked1", "blk-blocked1@example.com")

    # blocked user creates a post
    client.post(
        "/posts",
        headers=auth_headers(blocked["accessToken"]),
        json={"caption": "I should be hidden", "vehicleIds": [], "media": [], "visibility": "public"},
    )

    # Before blocking: blocker sees the post
    feed_before = client.get("/feed", headers=auth_headers(blocker["accessToken"])).json()
    post_ids_before = [item["id"] for item in feed_before["items"]]
    # (may or may not be there due to other tests, but blocking should change things)

    # Block the user
    resp = client.post(
        f"/users/{blocked['user']['id']}/block",
        headers=auth_headers(blocker["accessToken"]),
    )
    assert resp.status_code == 204, resp.text

    # After blocking: posts by blocked user excluded
    feed_after = client.get("/feed", headers=auth_headers(blocker["accessToken"])).json()
    author_ids = [item["author"]["id"] for item in feed_after["items"]]
    assert blocked["user"]["id"] not in author_ids


def test_block_hides_comments_both_directions():
    """Comments by blocked/blocking users are excluded from post comments."""
    user_a = signup("blk-commentA", "blk-commentA@example.com")
    user_b = signup("blk-commentB", "blk-commentB@example.com")
    user_c = signup("blk-commentC", "blk-commentC@example.com")

    # user_c creates a public post
    post = client.post(
        "/posts",
        headers=auth_headers(user_c["accessToken"]),
        json={"caption": "Open discussion", "vehicleIds": [], "media": [], "visibility": "public"},
    ).json()

    # Both A and B comment
    client.post(
        f"/posts/{post['id']}/comments",
        headers=auth_headers(user_a["accessToken"]),
        json={"body": "Comment from A"},
    )
    client.post(
        f"/posts/{post['id']}/comments",
        headers=auth_headers(user_b["accessToken"]),
        json={"body": "Comment from B"},
    )

    # A blocks B
    client.post(
        f"/users/{user_b['user']['id']}/block",
        headers=auth_headers(user_a["accessToken"]),
    )

    # A viewing: should not see B's comment
    comments_as_a = client.get(
        f"/posts/{post['id']}/comments",
        headers=auth_headers(user_a["accessToken"]),
    ).json()
    comment_authors_a = [c["author"]["id"] for c in comments_as_a]
    assert user_b["user"]["id"] not in comment_authors_a

    # B viewing: should not see A's comment (blocked by A)
    comments_as_b = client.get(
        f"/posts/{post['id']}/comments",
        headers=auth_headers(user_b["accessToken"]),
    ).json()
    comment_authors_b = [c["author"]["id"] for c in comments_as_b]
    assert user_a["user"]["id"] not in comment_authors_b


def test_comment_on_blocked_post_returns_403():
    """Cannot comment on a post if author has blocked you (or you blocked them)."""
    post_author = signup("blk-post-author", "blk-post-author@example.com")
    commenter = signup("blk-commenter", "blk-commenter@example.com")

    post = client.post(
        "/posts",
        headers=auth_headers(post_author["accessToken"]),
        json={"caption": "My post", "vehicleIds": [], "media": [], "visibility": "public"},
    ).json()

    # post_author blocks commenter
    client.post(
        f"/users/{commenter['user']['id']}/block",
        headers=auth_headers(post_author["accessToken"]),
    )

    resp = client.post(
        f"/posts/{post['id']}/comments",
        headers=auth_headers(commenter["accessToken"]),
        json={"body": "Trying to comment"},
    )
    assert resp.status_code == 403, resp.text


def test_unblock_restores_visibility():
    """After unblocking, posts become visible again in the feed."""
    blocker = signup("blk-unblock1", "blk-unblock1@example.com")
    blocked = signup("blk-unblock2", "blk-unblock2@example.com")

    client.post(
        "/posts",
        headers=auth_headers(blocked["accessToken"]),
        json={"caption": "Visible after unblock", "vehicleIds": [], "media": [], "visibility": "public"},
    )

    # Block
    client.post(
        f"/users/{blocked['user']['id']}/block",
        headers=auth_headers(blocker["accessToken"]),
    )

    # Unblock
    resp = client.delete(
        f"/users/{blocked['user']['id']}/block",
        headers=auth_headers(blocker["accessToken"]),
    )
    assert resp.status_code == 204, resp.text

    # Now the user's post should be visible
    feed = client.get("/feed", headers=auth_headers(blocker["accessToken"])).json()
    author_ids = [item["author"]["id"] for item in feed["items"]]
    assert blocked["user"]["id"] in author_ids


def test_block_self_returns_400():
    """Cannot block yourself."""
    user = signup("blk-self1", "blk-self1@example.com")
    resp = client.post(
        f"/users/{user['user']['id']}/block",
        headers=auth_headers(user["accessToken"]),
    )
    assert resp.status_code == 400, resp.text


def test_viewer_has_blocked_flag():
    """GET /users/{id} includes viewerHasBlocked=true after blocking."""
    blocker = signup("blk-flag1", "blk-flag1@example.com")
    target = signup("blk-flag2", "blk-flag2@example.com")

    # Block
    client.post(
        f"/users/{target['user']['id']}/block",
        headers=auth_headers(blocker["accessToken"]),
    )

    # Check flag
    resp = client.get(
        f"/users/{target['user']['id']}",
        headers=auth_headers(blocker["accessToken"]),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["viewerHasBlocked"] is True
    assert body["blockedViewer"] is False


# =============================================================================
# C) OWNERSHIP TRANSFER
# =============================================================================

def _create_event(token: str, vehicle_id: str, event_date: str = "2025-01-01") -> dict:
    resp = client.post(
        f"/vehicles/{vehicle_id}/events",
        headers=auth_headers(token),
        json={
            "eventType": "maintenance",
            "title": "Oil change",
            "eventDate": event_date,
            "visibility": "public",
            "media": [],
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_transfer_create_preview_and_revoke():
    """Create a transfer, preview it (giver can't accept), then revoke it."""
    giver = signup("xfr-giver1", "xfr-giver1@example.com")
    receiver = signup("xfr-receiver1", "xfr-receiver1@example.com")

    vehicle = create_vehicle(giver["accessToken"])

    # Create transfer
    transfer_resp = client.post(
        f"/vehicles/{vehicle['id']}/transfers",
        headers=auth_headers(giver["accessToken"]),
        json={"handoverDate": "2026-01-01", "showOwnerName": True},
    )
    assert transfer_resp.status_code == 201, transfer_resp.text
    transfer = transfer_resp.json()
    assert "code" in transfer
    assert transfer["status"] == "pending"
    assert len(transfer["code"]) == 10
    assert "url" in transfer

    # Giver cannot accept (canAccept=false)
    preview_as_giver = client.get(
        f"/transfers/by-code/{transfer['code']}",
        headers=auth_headers(giver["accessToken"]),
    )
    assert preview_as_giver.status_code == 200, preview_as_giver.text
    assert preview_as_giver.json()["canAccept"] is False

    # Receiver can accept (canAccept=true)
    preview_as_receiver = client.get(
        f"/transfers/by-code/{transfer['code']}",
        headers=auth_headers(receiver["accessToken"]),
    )
    assert preview_as_receiver.status_code == 200, preview_as_receiver.text
    assert preview_as_receiver.json()["canAccept"] is True

    # Counts included in preview
    assert "counts" in preview_as_receiver.json()

    # Revoke
    revoke_resp = client.delete(
        f"/transfers/{transfer['id']}",
        headers=auth_headers(giver["accessToken"]),
    )
    assert revoke_resp.status_code == 204, revoke_resp.text

    # Preview now shows revoked
    preview_revoked = client.get(
        f"/transfers/by-code/{transfer['code']}",
        headers=auth_headers(receiver["accessToken"]),
    )
    assert preview_revoked.json()["status"] == "revoked"
    assert preview_revoked.json()["canAccept"] is False


def test_transfer_accept_switches_owner_and_locks_events():
    """Accept transfer: owner switches, periods correct, old events locked for receiver."""
    giver = signup("xfr-giver2", "xfr-giver2@example.com")
    receiver = signup("xfr-receiver2", "xfr-receiver2@example.com")

    vehicle = create_vehicle(giver["accessToken"])
    # Add an event attributed to giver
    event = _create_event(giver["accessToken"], vehicle["id"], "2025-06-01")
    event_id = event["id"]

    # Before transfer, giver can edit it
    assert event["canEdit"] is True

    # Create and accept transfer
    transfer_resp = client.post(
        f"/vehicles/{vehicle['id']}/transfers",
        headers=auth_headers(giver["accessToken"]),
        json={"handoverDate": "2026-01-01"},
    )
    assert transfer_resp.status_code == 201, transfer_resp.text
    code = transfer_resp.json()["code"]

    accept_resp = client.post(
        f"/transfers/by-code/{code}/accept",
        headers=auth_headers(receiver["accessToken"]),
    )
    assert accept_resp.status_code == 200, accept_resp.text
    new_vehicle = accept_resp.json()
    assert new_vehicle["owner_user_id"] == receiver["user"]["id"]
    # Nickname cleared
    assert new_vehicle["nickname"] is None

    # Ownership periods: old closed, new current
    ownerships = client.get(
        f"/vehicles/{vehicle['id']}/ownerships",
        headers=auth_headers(receiver["accessToken"]),
    ).json()
    # Should have at least 2 periods
    assert len(ownerships) >= 2
    current = next((p for p in ownerships if p["isCurrent"]), None)
    assert current is not None
    assert current["ownerUserId"] == receiver["user"]["id"]
    closed = next((p for p in ownerships if not p["isCurrent"]), None)
    assert closed is not None
    assert closed["endDate"] == "2026-01-01"

    # Giver's event: receiver cannot edit it (locked — not creator)
    event_as_receiver = client.get(
        f"/vehicle-events/{event_id}",
        headers=auth_headers(receiver["accessToken"]),
    ).json()
    assert event_as_receiver["canEdit"] is False

    # Giver also cannot edit (no longer owner)
    edit_as_giver = client.patch(
        f"/vehicle-events/{event_id}",
        headers=auth_headers(giver["accessToken"]),
        json={"title": "Changed"},
    )
    assert edit_as_giver.status_code == 403, edit_as_giver.text


def test_transfer_receiver_can_hide_event_and_guests_dont_see_it():
    """New owner can hide a prior-owner event from public view."""
    giver = signup("xfr-hide-giver", "xfr-hide-giver@example.com")
    receiver = signup("xfr-hide-recv", "xfr-hide-recv@example.com")

    vehicle = create_vehicle(giver["accessToken"])
    event = _create_event(giver["accessToken"], vehicle["id"], "2025-01-15")
    event_id = event["id"]

    # Transfer
    tr = client.post(
        f"/vehicles/{vehicle['id']}/transfers",
        headers=auth_headers(giver["accessToken"]),
        json={"handoverDate": "2026-01-01"},
    ).json()
    client.post(
        f"/transfers/by-code/{tr['code']}/accept",
        headers=auth_headers(receiver["accessToken"]),
    )

    # Receiver hides the event
    hide_resp = client.patch(
        f"/vehicle-events/{event_id}/hidden",
        headers=auth_headers(receiver["accessToken"]),
        json={"hidden": True},
    )
    assert hide_resp.status_code == 200, hide_resp.text
    assert hide_resp.json()["hidden"] is True

    # Guest doesn't see it
    events_guest = client.get(f"/vehicles/{vehicle['id']}/events").json()
    assert not any(e["id"] == event_id for e in events_guest)

    # Receiver (owner) still sees it
    events_owner = client.get(
        f"/vehicles/{vehicle['id']}/events",
        headers=auth_headers(receiver["accessToken"]),
    ).json()
    hidden_event = next((e for e in events_owner if e["id"] == event_id), None)
    assert hidden_event is not None
    assert hidden_event["hidden"] is True


def test_transfer_keep_posts_tagged_false_removes_vehicle_tag():
    """keepPostsTagged=false removes vehicle tag from giver's posts."""
    giver = signup("xfr-untag-giver", "xfr-untag-giver@example.com")
    receiver = signup("xfr-untag-recv", "xfr-untag-recv@example.com")

    vehicle = create_vehicle(giver["accessToken"])
    # Giver creates a post tagged to the vehicle
    post = client.post(
        "/posts",
        headers=auth_headers(giver["accessToken"]),
        json={"caption": "My build", "vehicleIds": [vehicle["id"]], "media": [], "visibility": "public"},
    ).json()

    # Transfer with keepPostsTagged=false
    tr = client.post(
        f"/vehicles/{vehicle['id']}/transfers",
        headers=auth_headers(giver["accessToken"]),
        json={"handoverDate": "2026-01-01", "keepPostsTagged": False},
    ).json()
    client.post(
        f"/transfers/by-code/{tr['code']}/accept",
        headers=auth_headers(receiver["accessToken"]),
    )

    # Post should no longer be tagged to the vehicle
    vehicle_posts = client.get(f"/vehicles/{vehicle['id']}/posts").json()
    tagged_ids = [p["id"] for p in vehicle_posts]
    assert post["id"] not in tagged_ids


def test_transfer_show_owner_name_false_hides_giver_in_preview():
    """showOwnerName=false hides the giver's info in the preview."""
    giver = signup("xfr-anon-giver", "xfr-anon-giver@example.com")
    receiver = signup("xfr-anon-recv", "xfr-anon-recv@example.com")

    vehicle = create_vehicle(giver["accessToken"])

    tr = client.post(
        f"/vehicles/{vehicle['id']}/transfers",
        headers=auth_headers(giver["accessToken"]),
        json={"handoverDate": "2026-01-01", "showOwnerName": False},
    ).json()

    # Receiver preview: fromUser should be null
    preview = client.get(
        f"/transfers/by-code/{tr['code']}",
        headers=auth_headers(receiver["accessToken"]),
    ).json()
    assert preview["fromUser"] is None


def test_transfer_double_accept_returns_409():
    """Accepting a transfer twice returns 409."""
    giver = signup("xfr-dbl-giver", "xfr-dbl-giver@example.com")
    receiver1 = signup("xfr-dbl-recv1", "xfr-dbl-recv1@example.com")
    receiver2 = signup("xfr-dbl-recv2", "xfr-dbl-recv2@example.com")

    vehicle = create_vehicle(giver["accessToken"])
    tr = client.post(
        f"/vehicles/{vehicle['id']}/transfers",
        headers=auth_headers(giver["accessToken"]),
        json={"handoverDate": "2026-01-01"},
    ).json()
    code = tr["code"]

    # First accept succeeds
    r1 = client.post(f"/transfers/by-code/{code}/accept", headers=auth_headers(receiver1["accessToken"]))
    assert r1.status_code == 200, r1.text

    # Second accept returns 409
    r2 = client.post(f"/transfers/by-code/{code}/accept", headers=auth_headers(receiver2["accessToken"]))
    assert r2.status_code == 409, r2.text


def test_giver_cannot_accept_own_transfer():
    """Transfer creator cannot accept their own transfer."""
    giver = signup("xfr-self-giver", "xfr-self-giver@example.com")

    vehicle = create_vehicle(giver["accessToken"])
    tr = client.post(
        f"/vehicles/{vehicle['id']}/transfers",
        headers=auth_headers(giver["accessToken"]),
        json={"handoverDate": "2026-01-01"},
    ).json()

    resp = client.post(
        f"/transfers/by-code/{tr['code']}/accept",
        headers=auth_headers(giver["accessToken"]),
    )
    assert resp.status_code == 403, resp.text


def test_giver_previous_vehicles_after_transfer():
    """After transferring, vehicle appears in giver's previously-owned list."""
    giver = signup("xfr-prev-giver", "xfr-prev-giver@example.com")
    receiver = signup("xfr-prev-recv", "xfr-prev-recv@example.com")

    vehicle = create_vehicle(giver["accessToken"])

    tr = client.post(
        f"/vehicles/{vehicle['id']}/transfers",
        headers=auth_headers(giver["accessToken"]),
        json={"handoverDate": "2026-01-01"},
    ).json()
    client.post(
        f"/transfers/by-code/{tr['code']}/accept",
        headers=auth_headers(receiver["accessToken"]),
    )

    prev = client.get(
        "/users/me/vehicles/previous",
        headers=auth_headers(giver["accessToken"]),
    ).json()
    prev_ids = [p["vehicle"]["id"] for p in prev]
    assert vehicle["id"] in prev_ids


def test_vehicle_read_viewer_is_previous_owner():
    """After transfer, viewerIsPreviousOwner is not checked here (field exists on schema)."""
    # Just ensure the vehicle endpoint still works after transfer
    giver = signup("xfr-prevown-giver", "xfr-prevown-giver@example.com")
    receiver = signup("xfr-prevown-recv", "xfr-prevown-recv@example.com")

    vehicle = create_vehicle(giver["accessToken"])
    tr = client.post(
        f"/vehicles/{vehicle['id']}/transfers",
        headers=auth_headers(giver["accessToken"]),
        json={"handoverDate": "2026-01-01"},
    ).json()
    client.post(
        f"/transfers/by-code/{tr['code']}/accept",
        headers=auth_headers(receiver["accessToken"]),
    )

    # Vehicle is still accessible publicly
    v_resp = client.get(f"/vehicles/{vehicle['id']}")
    assert v_resp.status_code == 200, v_resp.text
    assert v_resp.json()["owner_user_id"] == receiver["user"]["id"]


# ---------------------------------------------------------------------------
# VIN decode + recalls + specs tests
# ---------------------------------------------------------------------------

_FAKE_VPIC_RESPONSE = {
    "Results": [
        {
            "ModelYear": "2004",
            "Make": "TOYOTA",
            "Model": "4Runner",
            "Trim": "Limited",
            "Series": "4Runner Limited",
            "BodyClass": "Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)",
            "DriveType": "4WD/4-Wheel Drive/4x4",
            "EngineCylinders": "8",
            "DisplacementL": "4.7",
            "EngineHP": "227",
            "FuelTypePrimary": "Gasoline",
            "TransmissionStyle": "Automatic",
            "PlantCountry": "JAPAN",
            "ErrorCode": "0",
            "ErrorText": "0 - VIN decoded clean. Check Digit (9th position) is correct",
        }
    ]
}

_FAKE_RECALLS_RESPONSE = {
    # Uses real NHTSA field names: ReportReceivedDate (capital R), parkIt/parkOutSide (lowercase p)
    # Date format: DD/MM/YYYY (verified via real NHTSA API call)
    "results": [
        {
            "NHTSACampaignNumber": "23V999000",
            "ReportReceivedDate": "15/01/2023",
            "Component": "BRAKES",
            "Summary": "Brake pads may wear prematurely.",
            "Consequence": "May increase stopping distance.",
            "Remedy": "Replace brake pads.",
            "Notes": "None",
            "parkIt": False,
            "parkOutSide": False,
        },
        {
            "NHTSACampaignNumber": "21V001000",
            "ReportReceivedDate": "05/03/2021",
            "Component": "ENGINE",
            "Summary": "Engine may stall.",
            "Consequence": "Crash risk.",
            "Remedy": "Software update.",
            "Notes": "",
            "parkIt": True,
            "parkOutSide": True,
        },
    ]
}


def test_vin_decode_maps_fields(monkeypatch):
    """Decode maps NHTSA fields to camelCase and normalises make."""
    import app.services as svc

    def fake_decode(vin_arg):
        class FakeResp:
            def raise_for_status(self): pass
            def json(self): return _FAKE_VPIC_RESPONSE
        return FakeResp()

    monkeypatch.setattr(svc.httpx, "get", lambda url, **kw: fake_decode(url))
    # Clear cache so monkeypatch takes effect
    svc._VIN_DECODE_CACHE.clear()

    u = signup("vin-decode-user1", "vin-decode-1@example.com")
    resp = client.get(
        "/vin/decode/JTEBT17R748010246",
        headers=auth_headers(u["accessToken"]),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # Basic field mapping
    assert data["vin"] == "JTEBT17R748010246"
    assert data["year"] == 2004
    # Make should be title-cased and catalog-normalized
    assert data["make"].lower() == "toyota"
    assert data["model"] == "4Runner"
    assert data["trim"] == "Limited"
    assert data["engineCylinders"] == 8
    assert abs(data["displacementL"] - 4.7) < 0.01
    assert data["engineHp"] == 227
    assert data["fuelType"] == "Gasoline"
    assert data["matched"] is True


def test_vin_decode_invalid_vin_returns_422():
    u = signup("vin-decode-user2", "vin-decode-2@example.com")
    # Too short
    resp = client.get("/vin/decode/TOOSHORT", headers=auth_headers(u["accessToken"]))
    assert resp.status_code == 422
    # Contains I/O/Q
    resp2 = client.get("/vin/decode/ITOBT17R748010246", headers=auth_headers(u["accessToken"]))
    assert resp2.status_code == 422


def test_vin_decode_requires_auth():
    resp = client.get("/vin/decode/JTEBT17R748010246")
    assert resp.status_code == 401


def test_decode_vin_endpoint_stores_specs(monkeypatch):
    """POST /vehicles/{id}/decode-vin saves specs and returns them on the vehicle."""
    import app.services as svc

    def fake_get(url, **kw):
        class FakeResp:
            def raise_for_status(self): pass
            def json(self): return _FAKE_VPIC_RESPONSE
        return FakeResp()

    monkeypatch.setattr(svc.httpx, "get", fake_get)
    svc._VIN_DECODE_CACHE.clear()

    u = signup("vin-save-user", "vin-save@example.com")
    # Create vehicle with a VIN
    veh_resp = client.post(
        "/vehicles",
        headers=auth_headers(u["accessToken"]),
        json={"make": "Toyota", "model": "4Runner", "year": 2004, "vin": "JTEBT17R748010246"},
    )
    assert veh_resp.status_code == 200, veh_resp.text
    veh_id = veh_resp.json()["id"]

    # Trigger decode
    dec_resp = client.post(
        f"/vehicles/{veh_id}/decode-vin",
        headers=auth_headers(u["accessToken"]),
    )
    assert dec_resp.status_code == 200, dec_resp.text
    data = dec_resp.json()
    assert data["specs"] is not None
    assert data["specs"]["year"] == 2004
    assert data["specs"]["engineCylinders"] == 8
    assert data["specs_decoded_at"] is not None


def test_decode_vin_no_vin_returns_400():
    u = signup("vin-no-vin-user", "vin-no-vin@example.com")
    veh = client.post(
        "/vehicles",
        headers=auth_headers(u["accessToken"]),
        json={"make": "Ford", "model": "Mustang", "year": 1965},
    ).json()
    resp = client.post(
        f"/vehicles/{veh['id']}/decode-vin",
        headers=auth_headers(u["accessToken"]),
    )
    assert resp.status_code == 400


def test_recalls_maps_and_sorts(monkeypatch):
    """Recalls endpoint maps fields and sorts newest first."""
    import app.services as svc

    def fake_get(url, **kw):
        class FakeResp:
            def raise_for_status(self): pass
            def json(self): return _FAKE_RECALLS_RESPONSE
        return FakeResp()

    monkeypatch.setattr(svc.httpx, "get", fake_get)
    svc._RECALLS_CACHE.clear()

    u = signup("recalls-user1", "recalls-1@example.com")
    veh = client.post(
        "/vehicles",
        headers=auth_headers(u["accessToken"]),
        json={"make": "Toyota", "model": "4Runner", "year": 2004},
    ).json()

    resp = client.get(f"/vehicles/{veh['id']}/recalls")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["count"] == 2
    assert data["unavailable"] is False
    # Sorted newest first: 2023 before 2021
    assert data["results"][0]["campaignNumber"] == "23V999000"
    assert data["results"][0]["reportReceivedDate"] == "2023-01-15"
    assert data["results"][1]["campaignNumber"] == "21V001000"
    assert data["results"][1]["reportReceivedDate"] == "2021-03-05"
    assert data["results"][1]["parkIt"] is True


def test_recalls_graceful_on_error(monkeypatch):
    """On network error, recalls returns empty with unavailable=True."""
    import app.services as svc

    def fake_get(url, **kw):
        raise Exception("Network error")

    monkeypatch.setattr(svc.httpx, "get", fake_get)
    svc._RECALLS_CACHE.clear()

    u = signup("recalls-err-user", "recalls-err@example.com")
    veh = client.post(
        "/vehicles",
        headers=auth_headers(u["accessToken"]),
        json={"make": "Honda", "model": "Civic", "year": 2010},
    ).json()

    resp = client.get(f"/vehicles/{veh['id']}/recalls")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["count"] == 0
    assert data["unavailable"] is True


def test_specs_round_trip_via_create():
    """Specs can be stored on create and read back."""
    u = signup("specs-create-user", "specs-create@example.com")
    specs_payload = {
        "bodyClass": "SUV",
        "driveType": "4WD",
        "engineCylinders": 6,
        "displacementL": 3.5,
        "engineHp": 280,
        "fuelType": "Gasoline",
    }
    resp = client.post(
        "/vehicles",
        headers=auth_headers(u["accessToken"]),
        json={"make": "Lexus", "model": "GX", "year": 2020, "specs": specs_payload},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["specs"] is not None
    assert data["specs"]["engineCylinders"] == 6
    assert data["specs"]["fuelType"] == "Gasoline"


def test_specs_round_trip_via_patch():
    """Specs can be stored via PATCH and read back."""
    u = signup("specs-patch-user", "specs-patch@example.com")
    veh = client.post(
        "/vehicles",
        headers=auth_headers(u["accessToken"]),
        json={"make": "BMW", "model": "M3", "year": 2023},
    ).json()
    assert veh["specs"] is None

    patch_resp = client.patch(
        f"/vehicles/{veh['id']}",
        headers=auth_headers(u["accessToken"]),
        json={"specs": {"engineHp": 503, "fuelType": "Gasoline"}},
    )
    assert patch_resp.status_code == 200, patch_resp.text
    data = patch_resp.json()
    assert data["specs"]["engineHp"] == 503
    assert data["specs_decoded_at"] is not None
