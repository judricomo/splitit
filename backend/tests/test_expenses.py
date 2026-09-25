from __future__ import annotations


def _members(group):
    ana, luis, marta = group["members"]
    return ana, luis, marta


def test_create_expense_equal_split(client, group):
    ana, luis, marta = _members(group)
    resp = client.post(
        f"/api/v1/g/{group['slug']}/expenses",
        json={
            "description": "Dinner",
            "total_minor": 100,
            "spent_on": "2026-01-01",
            "payers": [{"member_id": ana["id"], "paid_minor": 100}],
            "split": {
                "method": "equal",
                "participants": [
                    {"member_id": ana["id"]},
                    {"member_id": luis["id"]},
                    {"member_id": marta["id"]},
                ],
            },
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    owed = {s["member_id"]: s["owed_minor"] for s in body["splits"]}
    # 100 / 3 = 33 each, remainder 1 goes to the primary payer (ana).
    assert owed[luis["id"]] == 33
    assert owed[marta["id"]] == 33
    assert owed[ana["id"]] == 34
    assert body["created_by_member_id"] == ana["id"]  # creator is device identity by default


def test_create_expense_shares_split(client, group):
    ana, luis, marta = _members(group)
    resp = client.post(
        f"/api/v1/g/{group['slug']}/expenses",
        json={
            "description": "Groceries",
            "total_minor": 120000,
            "spent_on": "2026-09-20",
            "payers": [
                {"member_id": ana["id"], "paid_minor": 80000},
                {"member_id": luis["id"], "paid_minor": 40000},
            ],
            "split": {
                "method": "shares",
                "participants": [
                    {"member_id": ana["id"], "shares": 2},
                    {"member_id": luis["id"], "shares": 1},
                    {"member_id": marta["id"], "shares": 1},
                ],
            },
        },
    )
    assert resp.status_code == 201
    owed = {s["member_id"]: s["owed_minor"] for s in resp.json()["splits"]}
    assert owed[ana["id"]] == 60000
    assert owed[luis["id"]] == 30000
    assert owed[marta["id"]] == 30000


def test_create_expense_percent_split_must_sum_to_100(client, group):
    ana, luis, _marta = _members(group)
    resp = client.post(
        f"/api/v1/g/{group['slug']}/expenses",
        json={
            "description": "Taxi",
            "total_minor": 1000,
            "spent_on": "2026-01-01",
            "payers": [{"member_id": ana["id"], "paid_minor": 1000}],
            "split": {
                "method": "percent",
                "participants": [
                    {"member_id": ana["id"], "bp": 4000},
                    {"member_id": luis["id"], "bp": 4000},
                ],
            },
        },
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_SPLIT"


def test_create_expense_exact_split_must_sum_to_total(client, group):
    ana, luis, _marta = _members(group)
    resp = client.post(
        f"/api/v1/g/{group['slug']}/expenses",
        json={
            "description": "Snacks",
            "total_minor": 1000,
            "spent_on": "2026-01-01",
            "payers": [{"member_id": ana["id"], "paid_minor": 1000}],
            "split": {
                "method": "exact",
                "participants": [
                    {"member_id": ana["id"], "exact_minor": 400},
                    {"member_id": luis["id"], "exact_minor": 400},
                ],
            },
        },
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_SPLIT"


def test_create_expense_payers_must_sum_to_total(client, group):
    ana, _luis, _marta = _members(group)
    resp = client.post(
        f"/api/v1/g/{group['slug']}/expenses",
        json={
            "description": "Snacks",
            "total_minor": 1000,
            "spent_on": "2026-01-01",
            "payers": [{"member_id": ana["id"], "paid_minor": 500}],
            "split": {"method": "equal", "participants": [{"member_id": ana["id"]}]},
        },
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "PAYERS_MISMATCH"


def test_create_expense_requires_identity(client, group):
    client.cookies.clear()
    ana, _luis, _marta = _members(group)
    resp = client.post(
        f"/api/v1/g/{group['slug']}/expenses",
        json={
            "description": "Snacks",
            "total_minor": 1000,
            "spent_on": "2026-01-01",
            "payers": [{"member_id": ana["id"], "paid_minor": 1000}],
            "split": {"method": "equal", "participants": [{"member_id": ana["id"]}]},
        },
    )
    assert resp.status_code == 409
    assert resp.json()["code"] == "IDENTITY_REQUIRED"


def test_preview_split_does_not_persist(client, group):
    ana, luis, _marta = _members(group)
    resp = client.post(
        f"/api/v1/g/{group['slug']}/expenses/preview-split",
        json={
            "total_minor": 100,
            "payers": [{"member_id": ana["id"], "paid_minor": 100}],
            "split": {
                "method": "equal",
                "participants": [{"member_id": ana["id"]}, {"member_id": luis["id"]}],
            },
        },
    )
    assert resp.status_code == 200
    assert len(resp.json()["splits"]) == 2
    listed = client.get(f"/api/v1/g/{group['slug']}/expenses")
    assert listed.json() == []


def test_list_expenses_filters_by_query_and_date(client, group):
    ana, _luis, _marta = _members(group)
    for desc, spent_on in [("Dinner", "2026-01-01"), ("Taxi", "2026-01-05")]:
        client.post(
            f"/api/v1/g/{group['slug']}/expenses",
            json={
                "description": desc,
                "total_minor": 100,
                "spent_on": spent_on,
                "payers": [{"member_id": ana["id"], "paid_minor": 100}],
                "split": {"method": "equal", "participants": [{"member_id": ana["id"]}]},
            },
        )
    resp = client.get(f"/api/v1/g/{group['slug']}/expenses", params={"q": "din"})
    assert [e["description"] for e in resp.json()] == ["Dinner"]

    resp = client.get(f"/api/v1/g/{group['slug']}/expenses", params={"from": "2026-01-03"})
    assert [e["description"] for e in resp.json()] == ["Taxi"]


def test_update_expense(client, group):
    ana, _luis, _marta = _members(group)
    created = client.post(
        f"/api/v1/g/{group['slug']}/expenses",
        json={
            "description": "Dinner",
            "total_minor": 100,
            "spent_on": "2026-01-01",
            "payers": [{"member_id": ana["id"], "paid_minor": 100}],
            "split": {"method": "equal", "participants": [{"member_id": ana["id"]}]},
        },
    ).json()
    resp = client.patch(
        f"/api/v1/g/{group['slug']}/expenses/{created['id']}",
        json={
            "description": "Fancy dinner",
            "total_minor": 200,
            "spent_on": "2026-01-02",
            "payers": [{"member_id": ana["id"], "paid_minor": 200}],
            "split": {"method": "equal", "participants": [{"member_id": ana["id"]}]},
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["description"] == "Fancy dinner"
    assert body["total_minor"] == 200
    assert body["version"] == created["version"] + 1


def test_delete_and_restore_expense(client, group):
    ana, _luis, _marta = _members(group)
    created = client.post(
        f"/api/v1/g/{group['slug']}/expenses",
        json={
            "description": "Dinner",
            "total_minor": 100,
            "spent_on": "2026-01-01",
            "payers": [{"member_id": ana["id"], "paid_minor": 100}],
            "split": {"method": "equal", "participants": [{"member_id": ana["id"]}]},
        },
    ).json()

    resp = client.delete(f"/api/v1/g/{group['slug']}/expenses/{created['id']}")
    assert resp.status_code == 204
    assert client.get(f"/api/v1/g/{group['slug']}/expenses").json() == []

    resp = client.post(f"/api/v1/g/{group['slug']}/expenses/{created['id']}/restore")
    assert resp.status_code == 204
    listed = client.get(f"/api/v1/g/{group['slug']}/expenses").json()
    assert len(listed) == 1


def test_delete_expense_not_found(client, group):
    resp = client.delete(f"/api/v1/g/{group['slug']}/expenses/exp_ghost")
    assert resp.status_code == 404
    assert resp.json()["code"] == "EXPENSE_NOT_FOUND"
