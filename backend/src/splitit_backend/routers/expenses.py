from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Query, Request

from ..errors import ApiError
from ..ledger import compute_splits, validate_payers
from ..models import Expense, ExpenseInput, PreviewSplitInput, PreviewSplitResponse
from ..security import require_group_access, require_identity
from .. import store as store_mod
from ..store import _uid

router = APIRouter(tags=["Expenses"])


def _validate_expense(input: ExpenseInput) -> list:
    description = input.description.strip()
    if not (1 <= len(description) <= 120):
        raise ApiError(422, "INVALID_DESCRIPTION", "The description must be 1\u2013120 characters.")
    if input.total_minor <= 0:
        raise ApiError(422, "INVALID_TOTAL", "The total must be greater than 0.")
    payer_error = validate_payers(input.total_minor, input.payers)
    if payer_error:
        raise ApiError(422, "PAYERS_MISMATCH", payer_error)
    result = compute_splits(input.total_minor, input.split, input.payers)
    if result.error:
        raise ApiError(422, "INVALID_SPLIT", result.error)
    return result.rows


@router.get("/g/{slug}/expenses", response_model=list[Expense])
def list_expenses(
    slug: str,
    request: Request,
    member: str | None = None,
    q: str | None = None,
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = None,
) -> list[Expense]:
    group = require_group_access(slug, request)
    rows = [e for e in store_mod.group_expenses(group.id) if not e.deleted_at]
    if member:
        rows = [
            e
            for e in rows
            if any(p.member_id == member for p in e.payers)
            or any(s.member_id == member for s in e.splits)
        ]
    if q:
        needle = q.lower()
        rows = [e for e in rows if needle in e.description.lower()]
    if from_:
        rows = [e for e in rows if e.spent_on >= from_]
    if to:
        rows = [e for e in rows if e.spent_on <= to]
    rows.sort(key=lambda e: (e.spent_on, e.created_at), reverse=True)
    return rows


@router.post("/g/{slug}/expenses/preview-split", response_model=PreviewSplitResponse)
def preview_split(slug: str, body: PreviewSplitInput, request: Request) -> PreviewSplitResponse:
    require_group_access(slug, request)
    result = compute_splits(body.total_minor, body.split, body.payers)
    if result.error:
        raise ApiError(422, "INVALID_SPLIT", result.error)
    return PreviewSplitResponse(splits=result.rows)


@router.post("/g/{slug}/expenses", response_model=Expense, status_code=201)
def create_expense(slug: str, input: ExpenseInput, request: Request) -> Expense:
    group = require_group_access(slug, request)
    actor_member_id = require_identity(slug, request)
    splits = _validate_expense(input)
    expense = Expense(
        id=_uid("exp"),
        group_id=group.id,
        description=input.description.strip(),
        total_minor=input.total_minor,
        spent_on=input.spent_on,
        notes=(input.notes or "").strip() or None,
        split_method=input.split.method,
        payers=[p for p in input.payers if p.paid_minor > 0],
        splits=splits,
        created_by_member_id=actor_member_id,
        created_at=datetime.now(timezone.utc),
        deleted_at=None,
        version=1,
    )
    store_mod.create_expense(expense)
    return expense


@router.patch("/g/{slug}/expenses/{expense_id}", response_model=Expense)
def update_expense(slug: str, expense_id: str, input: ExpenseInput, request: Request) -> Expense:
    require_group_access(slug, request)
    expense = store_mod.get_expense(expense_id)
    if expense is None:
        raise ApiError(404, "EXPENSE_NOT_FOUND", "That expense no longer exists.")
    splits = _validate_expense(input)
    expense.description = input.description.strip()
    expense.total_minor = input.total_minor
    expense.spent_on = input.spent_on
    expense.notes = (input.notes or "").strip() or None
    expense.split_method = input.split.method
    expense.payers = [p for p in input.payers if p.paid_minor > 0]
    expense.splits = splits
    expense.version += 1
    store_mod.save_expense(expense)
    return expense


@router.delete("/g/{slug}/expenses/{expense_id}", status_code=204)
def delete_expense(slug: str, expense_id: str, request: Request) -> None:
    require_group_access(slug, request)
    expense = store_mod.get_expense(expense_id)
    if expense is None:
        raise ApiError(404, "EXPENSE_NOT_FOUND", "That expense no longer exists.")
    expense.deleted_at = datetime.now(timezone.utc)
    store_mod.save_expense(expense)


@router.post("/g/{slug}/expenses/{expense_id}/restore", status_code=204)
def restore_expense(slug: str, expense_id: str, request: Request) -> None:
    require_group_access(slug, request)
    expense = store_mod.get_expense(expense_id)
    if expense is None:
        raise ApiError(404, "EXPENSE_NOT_FOUND", "That expense no longer exists.")
    expense.deleted_at = None
    store_mod.save_expense(expense)
