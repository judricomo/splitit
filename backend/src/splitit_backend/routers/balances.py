from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Request

from ..ledger import compute_balances, simplify_debts
from ..models import BalancesResponse, BreakdownLine
from ..security import require_group_access
from ..store import group_expenses, group_settlements

router = APIRouter(tags=["Balances"])


@router.get("/g/{slug}/balances", response_model=BalancesResponse)
def get_balances(slug: str, request: Request) -> BalancesResponse:
    group = require_group_access(slug, request)
    balances = compute_balances(
        [m.id for m in group.members if not m.removed_at],
        group_expenses(group.id),
        group_settlements(group.id),
    )
    return BalancesResponse(
        members=balances,
        transfers=simplify_debts(balances),
        computed_at=datetime.now(timezone.utc),
    )


@router.get("/g/{slug}/balances/{member_id}", response_model=list[BreakdownLine])
def get_member_breakdown(slug: str, member_id: str, request: Request) -> list[BreakdownLine]:
    group = require_group_access(slug, request)

    def name_of(mid: str) -> str:
        return next((m.name for m in group.members if m.id == mid), "Unknown")

    lines: list[BreakdownLine] = []
    for e in group_expenses(group.id):
        if e.deleted_at:
            continue
        paid = next((p for p in e.payers if p.member_id == member_id), None)
        if paid:
            lines.append(
                BreakdownLine(
                    kind="expense_paid",
                    label=f'Paid for "{e.description}"',
                    date=e.spent_on,
                    amount_minor=paid.paid_minor,
                )
            )
        owed = next((s for s in e.splits if s.member_id == member_id), None)
        if owed:
            lines.append(
                BreakdownLine(
                    kind="expense_owed",
                    label=f'Share of "{e.description}"',
                    date=e.spent_on,
                    amount_minor=-owed.owed_minor,
                )
            )
    for s in group_settlements(group.id):
        if s.deleted_at:
            continue
        if s.from_member_id == member_id:
            lines.append(
                BreakdownLine(
                    kind="settlement_sent",
                    label=f"Paid {name_of(s.to_member_id)}",
                    date=s.settled_on,
                    amount_minor=s.amount_minor,
                )
            )
        if s.to_member_id == member_id:
            lines.append(
                BreakdownLine(
                    kind="settlement_received",
                    label=f"Received from {name_of(s.from_member_id)}",
                    date=s.settled_on,
                    amount_minor=-s.amount_minor,
                )
            )
    lines.sort(key=lambda line: line.date, reverse=True)
    return lines
