"""Seeds the same demo group the frontend mock client used to seed locally
(``frontend/src/lib/mock-api.ts``'s ``seedDb()``), so the "Open the demo
group" link on the homepage keeps working against the real backend.
Idempotent: a no-op if the demo group already exists in the store.
"""

from __future__ import annotations

from datetime import datetime, timezone

from .ledger import compute_splits
from .models import Expense, Group, Member, Payer, SplitInput
from .store import store

DEMO_SLUG = "kQ7xR2mVb9LtYc4PzNs1Aw"


def seed_demo_group() -> None:
    if DEMO_SLUG in store.groups:
        return

    now = datetime.now(timezone.utc)
    ids = {"ana": "mem_ana", "luis": "mem_luis", "marta": "mem_marta", "juan": "mem_juan"}
    members = [
        Member(id=ids["ana"], name="Ana", color="chart-1", removed_at=None),
        Member(id=ids["luis"], name="Luis", color="chart-2", removed_at=None),
        Member(id=ids["marta"], name="Marta", color="chart-3", removed_at=None),
        Member(id=ids["juan"], name="Juan", color="chart-4", removed_at=None),
    ]
    group = Group(
        id="grp_demo",
        slug=DEMO_SLUG,
        name="Cartagena trip",
        currency_code="COP",
        currency_exponent=0,
        pin_required=False,
        archived_at=None,
        created_at=now,
        members=members,
        version=1,
    )
    store.groups[group.slug] = group

    def build(
        id: str,
        description: str,
        total: int,
        spent_on: str,
        payers: list[Payer],
        split: SplitInput,
    ) -> Expense:
        result = compute_splits(total, split, payers)
        return Expense(
            id=id,
            group_id=group.id,
            description=description,
            total_minor=total,
            spent_on=spent_on,
            notes=None,
            split_method=split.method,
            payers=payers,
            splits=result.rows,
            created_by_member_id=payers[0].member_id,
            created_at=now,
            deleted_at=None,
            version=1,
        )

    expenses = [
        build(
            "exp_dinner",
            "Dinner",
            100000,
            "2026-09-20",
            [Payer(member_id=ids["ana"], paid_minor=100000)],
            SplitInput(
                method="equal",
                participants=[
                    {"member_id": ids["ana"]},
                    {"member_id": ids["luis"]},
                    {"member_id": ids["marta"]},
                ],
            ),
        ),
        build(
            "exp_taxi",
            "Taxi",
            30000,
            "2026-09-21",
            [Payer(member_id=ids["luis"], paid_minor=30000)],
            SplitInput(
                method="equal",
                participants=[{"member_id": ids["marta"]}, {"member_id": ids["juan"]}],
            ),
        ),
        build(
            "exp_groceries",
            "Groceries",
            120000,
            "2026-09-22",
            [
                Payer(member_id=ids["ana"], paid_minor=80000),
                Payer(member_id=ids["juan"], paid_minor=40000),
            ],
            SplitInput(
                method="shares",
                participants=[
                    {"member_id": ids["ana"], "shares": 2},
                    {"member_id": ids["luis"], "shares": 1},
                    {"member_id": ids["marta"], "shares": 1},
                    {"member_id": ids["juan"], "shares": 2},
                ],
            ),
        ),
    ]
    for e in expenses:
        store.expenses[e.id] = e
