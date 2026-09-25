from __future__ import annotations

from fastapi import APIRouter, Request

from ..errors import ApiError
from ..ledger import compute_balances
from ..models import AddMemberInput, Member, RenameMemberInput
from ..security import require_group_access
from ..store import MEMBER_COLORS, _uid, group_expenses, group_settlements

router = APIRouter(tags=["Members"])


@router.post("/g/{slug}/members", response_model=Member, status_code=201)
def add_member(slug: str, body: AddMemberInput, request: Request) -> Member:
    group = require_group_access(slug, request)
    trimmed = body.name.strip()
    if not (1 <= len(trimmed) <= 40):
        raise ApiError(422, "INVALID_NAME", "A name must be 1\u201340 characters.")
    if any(
        not m.removed_at and m.name.lower() == trimmed.lower() for m in group.members
    ):
        raise ApiError(409, "DUPLICATE_MEMBER", f'"{trimmed}" is already in this group.')
    member = Member(
        id=_uid("mem"),
        name=trimmed,
        color=MEMBER_COLORS[len(group.members) % len(MEMBER_COLORS)],
        removed_at=None,
    )
    group.members.append(member)
    return member


@router.patch("/g/{slug}/members/{member_id}", response_model=Member)
def rename_member(slug: str, member_id: str, body: RenameMemberInput, request: Request) -> Member:
    group = require_group_access(slug, request)
    member = next((m for m in group.members if m.id == member_id), None)
    if member is None:
        raise ApiError(404, "MEMBER_NOT_FOUND", "That member no longer exists.")
    trimmed = body.name.strip()
    if any(
        m.id != member_id and not m.removed_at and m.name.lower() == trimmed.lower()
        for m in group.members
    ):
        raise ApiError(409, "DUPLICATE_MEMBER", f'"{trimmed}" is already in this group.')
    member.name = trimmed
    return member


@router.delete("/g/{slug}/members/{member_id}", status_code=204)
def remove_member(slug: str, member_id: str, request: Request) -> None:
    group = require_group_access(slug, request)
    member = next((m for m in group.members if m.id == member_id), None)
    if member is None:
        raise ApiError(404, "MEMBER_NOT_FOUND", "That member no longer exists.")
    balances = compute_balances(
        [m.id for m in group.members],
        group_expenses(group.id),
        group_settlements(group.id),
    )
    row = next((b for b in balances if b.member_id == member_id), None)
    if row and row.balance != 0:
        raise ApiError(
            409,
            "BALANCE_NOT_ZERO",
            f"{member.name} still has an open balance. Settle up first.",
        )
    from datetime import datetime, timezone

    member.removed_at = datetime.now(timezone.utc)
