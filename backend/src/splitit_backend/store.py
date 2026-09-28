"""Database-backed repository. A direct analogue of the `Db` object and
`seedDb()` in ``frontend/src/lib/mock-api.ts``, now persisted via SQLAlchemy
(see ``db.py`` for the engine/session wiring and ``db_models.py`` for the
ORM tables) instead of kept in memory. The routers only depend on the
functions below, not on how or where state is stored, so swapping SQLite for
Postgres later is just a ``SPLITIT_DATABASE_URL`` change.

Session/PIN-rate-limit state (``issue_session_token`` / `is_valid_session`` /
``record_pin_attempt``) stays in an in-process dict: it's ephemeral,
security-only bookkeeping rather than domain data, so it doesn't need to
survive a restart or be portable across databases.
"""

from __future__ import annotations

import hashlib
import random
import string
import threading
import time
from datetime import date, datetime, timezone

from .db import reset_db, session_scope
from .db_models import ExpenseRow, GroupRow, MemberRow, SettlementRow
from .models import Expense, Group, Member, Payer, Settlement, SplitRow

MEMBER_COLORS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"]
_SLUG_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

# ISO 4217 minor-unit exponents for a handful of common currencies; anything
# unlisted defaults to 2 (mirrors frontend/src/lib/money.ts::exponentFor).
_ZERO_EXPONENT_CURRENCIES = {"COP", "JPY", "KRW", "VND", "CLP"}

_lock = threading.RLock()
_sessions: dict[str, set[str]] = {}  # slug -> set of valid PIN-session tokens
_pin_attempts: dict[str, list[float]] = {}  # f"{slug}:{ip}" -> timestamps


def exponent_for(currency_code: str) -> int:
    return 0 if currency_code.upper() in _ZERO_EXPONENT_CURRENCIES else 2


def _uid(prefix: str) -> str:
    return f"{prefix}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=8))}"


def _slug() -> str:
    return "".join(random.choices(_SLUG_ALPHABET, k=22))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> date:
    return date.today()


def _hash_pin(pin: str) -> str:
    # Mock only — the real backend hashes with argon2id (spec §7.2).
    return hashlib.sha256(pin.encode()).hexdigest()


def reset_store() -> None:
    """Wipe all persisted domain data and in-memory session state. Used
    between tests to start from a clean slate."""
    reset_db()
    with _lock:
        _sessions.clear()
        _pin_attempts.clear()


# --------------------------------------------------------------------------
# Groups / members
# --------------------------------------------------------------------------


def _group_from_row(row: GroupRow) -> Group:
    return Group(
        id=row.id,
        slug=row.slug,
        name=row.name,
        currency_code=row.currency_code,
        currency_exponent=row.currency_exponent,
        pin_required=row.pin_required,
        archived_at=row.archived_at,
        created_at=row.created_at,
        version=row.version,
        members=[
            Member(id=m.id, name=m.name, color=m.color, removed_at=m.removed_at)
            for m in row.members
        ],
    )


def find_group(slug: str) -> Group:
    from .errors import ApiError

    with session_scope() as session:
        row = session.query(GroupRow).filter_by(slug=slug).one_or_none()
        if row is None:
            raise ApiError(404, "GROUP_NOT_FOUND", "This group link is not valid.")
        return _group_from_row(row)


def get_group_or_none(slug: str) -> Group | None:
    with session_scope() as session:
        row = session.query(GroupRow).filter_by(slug=slug).one_or_none()
        return _group_from_row(row) if row else None


def create_group(group: Group, pin_hash: str | None = None) -> None:
    with session_scope() as session:
        row = GroupRow(
            id=group.id,
            slug=group.slug,
            name=group.name,
            currency_code=group.currency_code,
            currency_exponent=group.currency_exponent,
            pin_required=group.pin_required,
            pin_hash=pin_hash,
            archived_at=group.archived_at,
            created_at=group.created_at,
            version=group.version,
        )
        row.members = [
            MemberRow(
                id=m.id,
                group_id=group.id,
                name=m.name,
                color=m.color,
                removed_at=m.removed_at,
                order_index=i,
            )
            for i, m in enumerate(group.members)
        ]
        session.add(row)


def save_group(group: Group) -> None:
    """Persist in-place edits made to a `Group` returned by `find_group`
    (name/pin/version changes, member add/rename/remove)."""
    with session_scope() as session:
        row = session.query(GroupRow).filter_by(id=group.id).one()
        row.name = group.name
        row.pin_required = group.pin_required
        row.archived_at = group.archived_at
        row.version = group.version

        existing = {m.id: m for m in row.members}
        for i, m in enumerate(group.members):
            member_row = existing.get(m.id)
            if member_row is None:
                row.members.append(
                    MemberRow(
                        id=m.id,
                        group_id=group.id,
                        name=m.name,
                        color=m.color,
                        removed_at=m.removed_at,
                        order_index=i,
                    )
                )
            else:
                member_row.name = m.name
                member_row.color = m.color
                member_row.removed_at = m.removed_at
                member_row.order_index = i


def get_pin_hash(slug: str) -> str | None:
    with session_scope() as session:
        row = session.query(GroupRow).filter_by(slug=slug).one_or_none()
        return row.pin_hash if row else None


def set_pin_hash(slug: str, pin_hash: str) -> None:
    with session_scope() as session:
        row = session.query(GroupRow).filter_by(slug=slug).one()
        row.pin_hash = pin_hash


def clear_pin_hash(slug: str) -> None:
    with session_scope() as session:
        row = session.query(GroupRow).filter_by(slug=slug).one_or_none()
        if row is not None:
            row.pin_hash = None


# --------------------------------------------------------------------------
# Expenses
# --------------------------------------------------------------------------


def _expense_from_row(row: ExpenseRow) -> Expense:
    return Expense(
        id=row.id,
        group_id=row.group_id,
        description=row.description,
        total_minor=row.total_minor,
        spent_on=row.spent_on,
        notes=row.notes,
        split_method=row.split_method,
        payers=[Payer(**p) for p in row.payers],
        splits=[SplitRow(**s) for s in row.splits],
        created_by_member_id=row.created_by_member_id,
        created_at=row.created_at,
        deleted_at=row.deleted_at,
        version=row.version,
    )


def create_expense(expense: Expense) -> None:
    with session_scope() as session:
        session.add(
            ExpenseRow(
                id=expense.id,
                group_id=expense.group_id,
                description=expense.description,
                total_minor=expense.total_minor,
                spent_on=expense.spent_on,
                notes=expense.notes,
                split_method=expense.split_method,
                payers=[p.model_dump(mode="json") for p in expense.payers],
                splits=[s.model_dump(mode="json") for s in expense.splits],
                created_by_member_id=expense.created_by_member_id,
                created_at=expense.created_at,
                deleted_at=expense.deleted_at,
                version=expense.version,
            )
        )


def get_expense(expense_id: str) -> Expense | None:
    with session_scope() as session:
        row = session.get(ExpenseRow, expense_id)
        return _expense_from_row(row) if row else None


def save_expense(expense: Expense) -> None:
    with session_scope() as session:
        row = session.get(ExpenseRow, expense.id)
        if row is None:
            raise ValueError(f"Expense {expense.id} not found")
        row.description = expense.description
        row.total_minor = expense.total_minor
        row.spent_on = expense.spent_on
        row.notes = expense.notes
        row.split_method = expense.split_method
        row.payers = [p.model_dump(mode="json") for p in expense.payers]
        row.splits = [s.model_dump(mode="json") for s in expense.splits]
        row.deleted_at = expense.deleted_at
        row.version = expense.version


def group_expenses(group_id: str) -> list[Expense]:
    with session_scope() as session:
        rows = session.query(ExpenseRow).filter_by(group_id=group_id).all()
        return [_expense_from_row(r) for r in rows]


# --------------------------------------------------------------------------
# Settlements
# --------------------------------------------------------------------------


def _settlement_from_row(row: SettlementRow) -> Settlement:
    return Settlement(
        id=row.id,
        group_id=row.group_id,
        from_member_id=row.from_member_id,
        to_member_id=row.to_member_id,
        amount_minor=row.amount_minor,
        settled_on=row.settled_on,
        note=row.note,
        created_at=row.created_at,
        deleted_at=row.deleted_at,
        version=row.version,
    )


def create_settlement(settlement: Settlement) -> None:
    with session_scope() as session:
        session.add(
            SettlementRow(
                id=settlement.id,
                group_id=settlement.group_id,
                from_member_id=settlement.from_member_id,
                to_member_id=settlement.to_member_id,
                amount_minor=settlement.amount_minor,
                settled_on=settlement.settled_on,
                note=settlement.note,
                created_at=settlement.created_at,
                deleted_at=settlement.deleted_at,
                version=settlement.version,
            )
        )


def get_settlement(settlement_id: str) -> Settlement | None:
    with session_scope() as session:
        row = session.get(SettlementRow, settlement_id)
        return _settlement_from_row(row) if row else None


def save_settlement(settlement: Settlement) -> None:
    with session_scope() as session:
        row = session.get(SettlementRow, settlement.id)
        if row is None:
            raise ValueError(f"Settlement {settlement.id} not found")
        row.deleted_at = settlement.deleted_at
        row.version = settlement.version


def group_settlements(group_id: str) -> list[Settlement]:
    with session_scope() as session:
        rows = session.query(SettlementRow).filter_by(group_id=group_id).all()
        return [_settlement_from_row(r) for r in rows]


# --------------------------------------------------------------------------
# Session tokens / PIN rate limiting (in-memory, ephemeral — see module docstring)
# --------------------------------------------------------------------------


def issue_session_token(slug: str) -> str:
    token = _uid("sess")
    with _lock:
        _sessions.setdefault(slug, set()).add(token)
    return token


def is_valid_session(slug: str, token: str | None) -> bool:
    if not token:
        return False
    with _lock:
        return token in _sessions.get(slug, set())


def record_pin_attempt(key: str) -> int:
    """Returns the number of attempts in the current 15-minute window (inclusive)."""
    now = time.time()
    window_start = now - 15 * 60
    with _lock:
        attempts = [t for t in _pin_attempts.get(key, []) if t >= window_start]
        attempts.append(now)
        _pin_attempts[key] = attempts
        return len(attempts)


__all__ = [
    "MEMBER_COLORS",
    "clear_pin_hash",
    "create_expense",
    "create_group",
    "create_settlement",
    "exponent_for",
    "find_group",
    "get_expense",
    "get_group_or_none",
    "get_pin_hash",
    "get_settlement",
    "group_expenses",
    "group_settlements",
    "issue_session_token",
    "is_valid_session",
    "record_pin_attempt",
    "reset_store",
    "save_expense",
    "save_group",
    "save_settlement",
    "set_pin_hash",
    "_hash_pin",
    "_now",
    "_slug",
    "_today",
    "_uid",
]
