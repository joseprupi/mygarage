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
        json={"eventType": "maintenance", "title": "Oil change", "visibility": "public", "media": []},
    )
    assert event.status_code == 200, event.text

    denied = client.patch(
        f"/vehicle-events/{event.json()['id']}",
        headers=auth_headers(other["accessToken"]),
        json={"title": "Changed"},
    )
    assert denied.status_code == 403
