from __future__ import annotations


def test_create_settlement(client, group):
    ana, luis, _marta = group["members"]
    resp = client.post(
        f"/api/v1/g/{group['slug']}/settlements",
        json={
            "from_member_id": luis["id"],
            "to_member_id": ana["id"],
            "amount_minor": 500,
            "settled_on": "2026-01-01",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["amount_minor"] == 500
    assert body["deleted_at"] is None


def test_create_settlement_rejects_same_member(client, group):
    ana, _luis, _marta = group["members"]
    resp = client.post(
        f"/api/v1/g/{group['slug']}/settlements",
        json={
            "from_member_id": ana["id"],
            "to_member_id": ana["id"],
            "amount_minor": 500,
            "settled_on": "2026-01-01",
        },
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "SAME_MEMBER"


def test_create_settlement_rejects_non_positive_amount(client, group):
    ana, luis, _marta = group["members"]
    resp = client.post(
        f"/api/v1/g/{group['slug']}/settlements",
        json={
            "from_member_id": luis["id"],
            "to_member_id": ana["id"],
            "amount_minor": 0,
            "settled_on": "2026-01-01",
        },
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_AMOUNT"


def test_list_settlements_excludes_deleted(client, group):
    ana, luis, _marta = group["members"]
    created = client.post(
        f"/api/v1/g/{group['slug']}/settlements",
        json={
            "from_member_id": luis["id"],
            "to_member_id": ana["id"],
            "amount_minor": 500,
            "settled_on": "2026-01-01",
        },
    ).json()
    client.delete(f"/api/v1/g/{group['slug']}/settlements/{created['id']}")
    resp = client.get(f"/api/v1/g/{group['slug']}/settlements")
    assert resp.json() == []


def test_delete_settlement_not_found(client, group):
    resp = client.delete(f"/api/v1/g/{group['slug']}/settlements/stl_ghost")
    assert resp.status_code == 404
    assert resp.json()["code"] == "SETTLEMENT_NOT_FOUND"
