from __future__ import annotations

from fastapi import APIRouter, Request, Response

from .. import store as store_mod
from ..errors import ApiError
from ..models import CreateGroupInput, Group, UpdateGroupInput
from ..security import require_group_access, set_identity_cookie, set_session_cookie
from ..store import MEMBER_COLORS, _hash_pin, _now, _slug, _uid, exponent_for
from ..models import Member

router = APIRouter(tags=["Groups"])


@router.post("/groups", response_model=Group, status_code=201)
def create_group(input: CreateGroupInput, response: Response) -> Group:
    names = [n.strip() for n in [input.my_name, *input.member_names] if n.strip()]
    seen: set[str] = set()
    for name in names:
        low = name.lower()
        if low in seen:
            raise ApiError(422, "DUPLICATE_MEMBER", f'"{name}" is listed twice.')
        seen.add(low)

    members = [
        Member(id=_uid("mem"), name=name, color=MEMBER_COLORS[i % len(MEMBER_COLORS)], removed_at=None)
        for i, name in enumerate(names)
    ]
    group = Group(
        id=_uid("grp"),
        slug=_slug(),
        name=input.name.strip(),
        currency_code=input.currency_code.upper(),
        currency_exponent=exponent_for(input.currency_code),
        pin_required=bool(input.pin),
        archived_at=None,
        created_at=_now(),
        version=1,
        members=members,
    )
    pin_hash = _hash_pin(input.pin) if input.pin else None
    store_mod.create_group(group, pin_hash=pin_hash)
    if input.pin:
        token = store_mod.issue_session_token(group.slug)
        set_session_cookie(response, group.slug, token)
    if members:
        set_identity_cookie(response, group.slug, members[0].id)
    return group


@router.get("/g/{slug}", response_model=Group)
def get_group(slug: str, request: Request) -> Group:
    return require_group_access(slug, request)


@router.patch("/g/{slug}", response_model=Group)
def update_group(slug: str, patch: UpdateGroupInput, request: Request) -> Group:
    group = require_group_access(slug, request)
    if patch.name and patch.name.strip():
        group.name = patch.name.strip()
    if patch.remove_pin:
        store_mod.clear_pin_hash(slug)
        group.pin_required = False
    elif patch.pin is not None:
        pin = patch.pin.strip()
        if not (pin.isdigit() and 4 <= len(pin) <= 8):
            raise ApiError(422, "INVALID_PIN", "The PIN must be 4-8 digits.")
        store_mod.set_pin_hash(slug, _hash_pin(pin))
        group.pin_required = True
    group.version += 1
    store_mod.save_group(group)
    return group
