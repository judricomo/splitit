from __future__ import annotations


def test_create_group_returns_group_with_members(client):
    resp = client.post(
        "/api/v1/groups",
        json={
            "name": "Cartagena trip",
            "currency_code": "cop",
            "my_name": "Ana",
            "member_names": ["Luis", "Marta"],
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Cartagena trip"
    assert body["currency_code"] == "COP"
    assert body["currency_exponent"] == 0
    assert body["pin_required"] is False
    assert [m["name"] for m in body["members"]] == ["Ana", "Luis", "Marta"]
    assert len(body["slug"]) >= 20


def test_create_group_sets_pin_required_when_pin_given(client):
    resp = client.post(
        "/api/v1/groups",
        json={
            "name": "Secret trip",
            "currency_code": "USD",
            "my_name": "Ana",
            "member_names": [],
            "pin": "1234",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["pin_required"] is True
    assert resp.json()["currency_exponent"] == 2


def test_create_group_rejects_duplicate_member_names(client):
    resp = client.post(
        "/api/v1/groups",
        json={
            "name": "Trip",
            "currency_code": "USD",
            "my_name": "Ana",
            "member_names": ["ana"],
        },
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "DUPLICATE_MEMBER"


def test_get_group_by_slug(client, group):
    resp = client.get(f"/api/v1/g/{group['slug']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == group["id"]


def test_get_group_unknown_slug_is_404(client):
    resp = client.get("/api/v1/g/does-not-exist")
    assert resp.status_code == 404
    assert resp.json()["code"] == "GROUP_NOT_FOUND"


def test_patch_group_renames_and_bumps_version(client, group):
    resp = client.patch(f"/api/v1/g/{group['slug']}", json={"name": "Renamed trip"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Renamed trip"
    assert body["version"] == group["version"] + 1


def test_get_pinned_group_without_session_cookie_is_rejected(client, pinned_group):
    client.cookies.clear()
    resp = client.get(f"/api/v1/g/{pinned_group['slug']}")
    assert resp.status_code == 401
    assert resp.json()["code"] == "PIN_REQUIRED"


def test_patch_group_sets_pin(client, group):
    resp = client.patch(f"/api/v1/g/{group['slug']}", json={"pin": "4321"})
    assert resp.status_code == 200
    assert resp.json()["pin_required"] is True

    # A device without the new session cookie is now locked out.
    client.cookies.clear()
    resp = client.get(f"/api/v1/g/{group['slug']}")
    assert resp.status_code == 401
    assert resp.json()["code"] == "PIN_REQUIRED"

    # ...but the right PIN unlocks it.
    resp = client.post(f"/api/v1/g/{group['slug']}/session", json={"pin": "4321"})
    assert resp.status_code == 204
    resp = client.get(f"/api/v1/g/{group['slug']}")
    assert resp.status_code == 200


def test_patch_group_rejects_invalid_pin(client, group):
    resp = client.patch(f"/api/v1/g/{group['slug']}", json={"pin": "12"})
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_PIN"


def test_patch_group_changes_existing_pin(client, pinned_group):
    resp = client.patch(f"/api/v1/g/{pinned_group['slug']}", json={"pin": "9999"})
    assert resp.status_code == 200
    assert resp.json()["pin_required"] is True

    # Old PIN no longer works from a fresh device (no session cookie).
    client.cookies.clear()
    resp = client.post(f"/api/v1/g/{pinned_group['slug']}/session", json={"pin": "1234"})
    assert resp.status_code == 401
    assert resp.json()["code"] == "INVALID_PIN"

    resp = client.post(f"/api/v1/g/{pinned_group['slug']}/session", json={"pin": "9999"})
    assert resp.status_code == 204


def test_patch_group_removes_pin(client, pinned_group):
    resp = client.patch(f"/api/v1/g/{pinned_group['slug']}", json={"remove_pin": True})
    assert resp.status_code == 200
    assert resp.json()["pin_required"] is False

    client.cookies.clear()
    resp = client.get(f"/api/v1/g/{pinned_group['slug']}")
    assert resp.status_code == 200
