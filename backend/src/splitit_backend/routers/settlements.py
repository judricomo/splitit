from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Request

from ..errors import ApiError
from ..models import Settlement, SettlementInput
from ..security import require_group_access
from .. import store as store_mod
from ..store import _uid

router = APIRouter(tags=["Settlements"])


@router.get("/g/{slug}/settlements", response_model=list[Settlement])
def list_settlements(slug: str, request: Request) -> list[Settlement]:
    group = require_group_access(slug, request)
    rows = [s for s in store_mod.group_settlements(group.id) if not s.deleted_at]
    rows.sort(key=lambda s: s.settled_on, reverse=True)
    return rows


@router.post("/g/{slug}/settlements", response_model=Settlement, status_code=201)
def create_settlement(slug: str, input: SettlementInput, request: Request) -> Settlement:
    group = require_group_access(slug, request)
    if input.from_member_id == input.to_member_id:
        raise ApiError(422, "SAME_MEMBER", "Pick two different members.")
    if input.amount_minor <= 0:
        raise ApiError(422, "INVALID_AMOUNT", "The amount must be greater than 0.")
    settlement = Settlement(
        id=_uid("stl"),
        group_id=group.id,
        from_member_id=input.from_member_id,
        to_member_id=input.to_member_id,
        amount_minor=input.amount_minor,
        settled_on=input.settled_on,
        note=(input.note or "").strip() or None,
        created_at=datetime.now(timezone.utc),
        deleted_at=None,
        version=1,
    )
    store_mod.create_settlement(settlement)
    return settlement


@router.delete("/g/{slug}/settlements/{settlement_id}", status_code=204)
def delete_settlement(slug: str, settlement_id: str, request: Request) -> None:
    require_group_access(slug, request)
    settlement = store_mod.get_settlement(settlement_id)
    if settlement is None:
        raise ApiError(404, "SETTLEMENT_NOT_FOUND", "That payment no longer exists.")
    settlement.deleted_at = datetime.now(timezone.utc)
    store_mod.save_settlement(settlement)
