from __future__ import annotations


def test_verify_pin_sets_session_cookie(client, pinned_group):
    client.cookies.clear()
    resp = client.post(f"/api/v1/g/{pinned_group['slug']}/session", json={"pin": "1234"})
    assert resp.status_code == 204
    assert any(c.startswith(f"splitit_session_{pinned_group['slug']}") for c in resp.headers.get_list("set-cookie"))

    # And now the group is reachable.
    resp2 = client.get(f"/api/v1/g/{pinned_group['slug']}")
    assert resp2.status_code == 200


def test_verify_pin_rejects_wrong_pin(client, pinned_group):
    client.cookies.clear()
    resp = client.post(f"/api/v1/g/{pinned_group['slug']}/session", json={"pin": "0000"})
    assert resp.status_code == 401
    assert resp.json()["code"] == "INVALID_PIN"


def test_verify_pin_rate_limited_after_five_attempts(client, pinned_group):
    client.cookies.clear()
    for _ in range(5):
        resp = client.post(f"/api/v1/g/{pinned_group['slug']}/session", json={"pin": "0000"})
        assert resp.status_code == 401
    resp = client.post(f"/api/v1/g/{pinned_group['slug']}/session", json={"pin": "0000"})
    assert resp.status_code == 429
    assert resp.json()["code"] == "TOO_MANY_ATTEMPTS"


def test_set_identity_stores_member_choice(client, group):
    member_id = group["members"][1]["id"]
    resp = client.put(f"/api/v1/g/{group['slug']}/session/identity", json={"member_id": member_id})
    assert resp.status_code == 204


def test_set_identity_rejects_unknown_member(client, group):
    resp = client.put(
        f"/api/v1/g/{group['slug']}/session/identity", json={"member_id": "mem_ghost"}
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "MEMBER_NOT_FOUND"
