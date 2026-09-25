"""Pure ledger core: split computation, rounding, net balances and debt
simplification. Integer maths only — a direct port of the frontend's
``frontend/src/lib/ledger.ts`` so both sides agree on the numbers.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .models import (
    BalanceRow,
    Payer,
    SplitInput,
    SplitRow,
    Transfer,
)


def primary_payer(payers: list[Payer]) -> str | None:
    """The payer who absorbs leftover minor units: largest paid, ties -> lowest member id."""
    active = [p for p in payers if p.paid_minor > 0]
    if not active:
        return None
    return sorted(active, key=lambda p: (-p.paid_minor, p.member_id))[0].member_id


@dataclass
class SplitResult:
    rows: list[SplitRow] = field(default_factory=list)
    leftover_minor: int = 0
    error: str | None = None


def compute_splits(total_minor: int, split: SplitInput, payers: list[Payer]) -> SplitResult:
    """Spec §4.2 — floor each raw share, then the primary payer absorbs the remainder."""
    parts = split.participants
    if total_minor <= 0:
        return SplitResult(rows=[], leftover_minor=0, error="Total must be greater than 0")
    if not parts:
        return SplitResult(rows=[], leftover_minor=0, error="Pick at least one participant")

    rows: list[SplitRow] = []
    error: str | None = None

    if split.method == "equal":
        n = len(parts)
        base = total_minor // n
        for p in parts:
            rows.append(SplitRow(member_id=p.member_id, owed_minor=base, is_rounding=False))
    elif split.method == "exact":
        total_sum = 0
        for p in parts:
            amount = p.exact_minor or 0
            total_sum += amount
            rows.append(
                SplitRow(
                    member_id=p.member_id,
                    owed_minor=amount,
                    is_rounding=False,
                    input_exact_minor=amount,
                )
            )
        if total_sum != total_minor:
            error = "Exact amounts must add up to the total"
    elif split.method == "percent":
        bp_sum = 0
        for p in parts:
            bp = p.bp or 0
            bp_sum += bp
            rows.append(
                SplitRow(
                    member_id=p.member_id,
                    owed_minor=(total_minor * bp) // 10000,
                    is_rounding=False,
                    input_bp=bp,
                )
            )
        if bp_sum != 10000:
            error = "Percentages must add up to 100.00%"
    else:  # shares
        total_shares = sum(p.shares or 0 for p in parts)
        if total_shares <= 0:
            error = "Total shares must be at least 1"
        for p in parts:
            s = p.shares or 0
            owed = (total_minor * s) // total_shares if total_shares > 0 else 0
            rows.append(
                SplitRow(member_id=p.member_id, owed_minor=owed, is_rounding=False, input_shares=s)
            )

    assigned = sum(r.owed_minor for r in rows)
    leftover = total_minor - assigned

    if not error and leftover != 0 and split.method != "exact":
        absorber = primary_payer(payers)
        if absorber:
            existing = next((r for r in rows if r.member_id == absorber), None)
            if existing:
                existing.owed_minor += leftover
            else:
                rows.append(SplitRow(member_id=absorber, owed_minor=leftover, is_rounding=True))
        elif rows:
            rows[0].owed_minor += leftover

    return SplitResult(rows=rows, leftover_minor=leftover, error=error)


def validate_payers(total_minor: int, payers: list[Payer]) -> str | None:
    active = [p for p in payers if p.paid_minor > 0]
    if not active:
        return "Add at least one payer"
    total_sum = sum(p.paid_minor for p in active)
    if total_sum != total_minor:
        return "Paid amounts must add up to the total"
    return None


def compute_balances(
    member_ids: list[str],
    expenses: list,
    settlements: list,
) -> list[BalanceRow]:
    """Spec §4.3 — B = paid − owed + sent − received. Σ B is always 0."""
    rows: dict[str, BalanceRow] = {}

    def row(member_id: str) -> BalanceRow:
        r = rows.get(member_id)
        if r is None:
            r = BalanceRow(member_id=member_id, paid=0, owed=0, sent=0, received=0, balance=0)
            rows[member_id] = r
        return r

    for member_id in member_ids:
        row(member_id)

    for e in expenses:
        if e.deleted_at:
            continue
        for p in e.payers:
            row(p.member_id).paid += p.paid_minor
        for s in e.splits:
            row(s.member_id).owed += s.owed_minor

    for s in settlements:
        if s.deleted_at:
            continue
        row(s.from_member_id).sent += s.amount_minor
        row(s.to_member_id).received += s.amount_minor

    result = list(rows.values())
    for r in result:
        r.balance = r.paid - r.owed + r.sent - r.received
    return result


def simplify_debts(balances: list[BalanceRow]) -> list[Transfer]:
    """Spec §4.4 — deterministic greedy simplification, at most n−1 transfers."""
    creditors = sorted(
        ({"id": b.member_id, "amount": b.balance} for b in balances if b.balance > 0),
        key=lambda x: (-x["amount"], x["id"]),
    )
    debtors = sorted(
        ({"id": b.member_id, "amount": -b.balance} for b in balances if b.balance < 0),
        key=lambda x: (-x["amount"], x["id"]),
    )

    transfers: list[Transfer] = []
    ci = 0
    di = 0
    while ci < len(creditors) and di < len(debtors):
        c = creditors[ci]
        d = debtors[di]
        amount = min(c["amount"], d["amount"])
        if amount > 0:
            transfers.append(Transfer(**{"from": d["id"], "to": c["id"], "amount_minor": amount}))
        c["amount"] -= amount
        d["amount"] -= amount
        if c["amount"] == 0:
            ci += 1
        if d["amount"] == 0:
            di += 1
    return transfers
