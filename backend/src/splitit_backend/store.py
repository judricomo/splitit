"""In-memory mock "database". A direct analogue of the `Db` object and
`seedDb()` in ``frontend/src/lib/mock-api.ts``. Swap this module out for a
real database-backed repository later; the routers only depend on the
functions below, not on how state is stored.
"""

from __future__ import annotations

import hashlib
import random
import string
import threading
import time
from datetime import date, datetime, timezone

from .models import Expense, Group, Member, Settlement

MEMBER_COLORS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"]
_SLUG_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

# ISO 4217 minor-unit exponents for a handful of common currencies; anything
# unlisted defaults to 2 (mirrors frontend/src/lib/money.ts::exponentFor).
_ZERO_EXPONENT_CURRENCIES = {"COP", "JPY", "KRW", "VND", "CLP"}


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


class _Store:
    """Process-wide in-memory store, guarded by a lock (tests use one process)."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.groups: dict[str, Group] = {}
        self.pin_hashes: dict[str, str] = {}  # slug -> hashed pin
        self.expenses: dict[str, Expense] = {}
        self.settlements: dict[str, Settlement] = {}
        # Mock session state (real backend uses signed HttpOnly cookies).
        self.sessions: dict[str, set[str]] = {}  # slug -> set of valid PIN-session tokens
        self.pin_attempts: dict[str, list[float]] = {}  # f"{slug}:{ip}" -> timestamps

    def reset(self) -> None:
        with self._lock:
            self.groups.clear()
            self.pin_hashes.clear()
            self.expenses.clear()
            self.settlements.clear()
            self.sessions.clear()
            self.pin_attempts.clear()


store = _Store()


def reset_store() -> None:
    store.reset()


def find_group(slug: str) -> Group:
    from .errors import ApiError

    group = store.groups.get(slug)
    if group is None:
        raise ApiError(404, "GROUP_NOT_FOUND", "This group link is not valid.")
    return group


def group_expenses(group_id: str) -> list[Expense]:
    return [e for e in store.expenses.values() if e.group_id == group_id]


def group_settlements(group_id: str) -> list[Settlement]:
    return [s for s in store.settlements.values() if s.group_id == group_id]


def issue_session_token(slug: str) -> str:
    token = _uid("sess")
    store.sessions.setdefault(slug, set()).add(token)
    return token


def is_valid_session(slug: str, token: str | None) -> bool:
    if not token:
        return False
    return token in store.sessions.get(slug, set())


def record_pin_attempt(key: str) -> int:
    """Returns the number of attempts in the current 15-minute window (inclusive)."""
    now = time.time()
    window_start = now - 15 * 60
    attempts = [t for t in store.pin_attempts.get(key, []) if t >= window_start]
    attempts.append(now)
    store.pin_attempts[key] = attempts
    return len(attempts)


__all__ = [
    "MEMBER_COLORS",
    "exponent_for",
    "find_group",
    "group_expenses",
    "group_settlements",
    "issue_session_token",
    "is_valid_session",
    "record_pin_attempt",
    "reset_store",
    "store",
    "_hash_pin",
    "_now",
    "_slug",
    "_today",
    "_uid",
]
