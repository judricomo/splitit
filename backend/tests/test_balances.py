from __future__ import annotations


def test_balances_zero_sum_after_expense_and_settlement(client, group):
    ana, luis, marta = group["members"]
    client.post(
        f"/api/v1/g/{group['slug']}/expenses",
        json={
            "description": "Dinner",
            "total_minor": 300,
            "spent_on": "2026-01-01",
            "payers": [{"member_id": ana["id"], "paid_minor": 300}],
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
    resp = client.get(f"/api/v1/g/{group['slug']}/balances")
    assert resp.status_code == 200
    body = resp.json()
    balances = {b["member_id"]: b["balance"] for b in body["members"]}
    assert balances[ana["id"]] == 200  # paid 300, owed 100
    assert balances[luis["id"]] == -100
    assert balances[marta["id"]] == -100
    assert sum(balances.values()) == 0

    transfers = body["transfers"]
    assert len(transfers) == 2
    assert all(t["to"] == ana["id"] for t in transfers)
    assert sum(t["amount_minor"] for t in transfers) == 200


def test_balances_reflect_settlements(client, group):
    ana, luis, marta = group["members"]
    client.post(
        f"/api/v1/g/{group['slug']}/expenses",
        json={
            "description": "Dinner",
            "total_minor": 300,
            "spent_on": "2026-01-01",
            "payers": [{"member_id": ana["id"], "paid_minor": 300}],
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
    client.post(
        f"/api/v1/g/{group['slug']}/settlements",
        json={
            "from_member_id": luis["id"],
            "to_member_id": ana["id"],
            "amount_minor": 100,
            "settled_on": "2026-01-02",
        },
    )
    resp = client.get(f"/api/v1/g/{group['slug']}/balances")
    balances = {b["member_id"]: b["balance"] for b in resp.json()["members"]}
    assert balances[luis["id"]] == 0
    assert balances[ana["id"]] == 100
    assert balances[marta["id"]] == -100


def test_member_breakdown_lists_expense_and_settlement_lines(client, group):
    ana, luis, _marta = group["members"]
    client.post(
        f"/api/v1/g/{group['slug']}/expenses",
        json={
            "description": "Dinner",
            "total_minor": 200,
            "spent_on": "2026-01-01",
            "payers": [{"member_id": ana["id"], "paid_minor": 200}],
            "split": {
                "method": "equal",
                "participants": [{"member_id": ana["id"]}, {"member_id": luis["id"]}],
            },
        },
    )
    client.post(
        f"/api/v1/g/{group['slug']}/settlements",
        json={
            "from_member_id": luis["id"],
            "to_member_id": ana["id"],
            "amount_minor": 100,
            "settled_on": "2026-01-02",
        },
    )
    resp = client.get(f"/api/v1/g/{group['slug']}/balances/{luis['id']}")
    assert resp.status_code == 200
    kinds = [line["kind"] for line in resp.json()]
    assert "expense_owed" in kinds
    assert "settlement_sent" in kinds
