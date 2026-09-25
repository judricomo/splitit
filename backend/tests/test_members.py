from __future__ import annotations


def test_add_member(client, group):
    resp = client.post(f"/api/v1/g/{group['slug']}/members", json={"name": "Juan"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Juan"
    assert body["removed_at"] is None


def test_add_member_rejects_duplicate_name(client, group):
    resp = client.post(f"/api/v1/g/{group['slug']}/members", json={"name": "Ana"})
    assert resp.status_code == 409
    assert resp.json()["code"] == "DUPLICATE_MEMBER"


def test_add_member_rejects_invalid_name_length(client, group):
    resp = client.post(f"/api/v1/g/{group['slug']}/members", json={"name": ""})
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_NAME"


def test_rename_member(client, group):
    member_id = group["members"][1]["id"]
    resp = client.patch(
        f"/api/v1/g/{group['slug']}/members/{member_id}", json={"name": "Luisito"}
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Luisito"


def test_rename_member_not_found(client, group):
    resp = client.patch(
        f"/api/v1/g/{group['slug']}/members/mem_ghost", json={"name": "Nope"}
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "MEMBER_NOT_FOUND"


def test_remove_member_with_zero_balance(client, group):
    member_id = group["members"][2]["id"]  # Marta never participates below
    resp = client.delete(f"/api/v1/g/{group['slug']}/members/{member_id}")
    assert resp.status_code == 204


def test_remove_member_with_nonzero_balance_is_rejected(client, group):
    ana, luis, _marta = group["members"]
    client.post(
        f"/api/v1/g/{group['slug']}/expenses",
        json={
            "description": "Dinner",
            "total_minor": 10000,
            "spent_on": "2026-01-01",
            "payers": [{"member_id": ana["id"], "paid_minor": 10000}],
            "split": {
                "method": "equal",
                "participants": [{"member_id": ana["id"]}, {"member_id": luis["id"]}],
            },
        },
    )
    resp = client.delete(f"/api/v1/g/{group['slug']}/members/{luis['id']}")
    assert resp.status_code == 409
    assert resp.json()["code"] == "BALANCE_NOT_ZERO"
