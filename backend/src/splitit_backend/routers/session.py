from __future__ import annotations

from fastapi import APIRouter, Request, Response

from .. import store as store_mod
from ..errors import ApiError
from ..models import IdentityInput, PinInput
from ..security import set_identity_cookie, set_session_cookie

router = APIRouter(tags=["Session"])

MAX_PIN_ATTEMPTS = 5


@router.post("/g/{slug}/session", status_code=204)
def verify_pin(slug: str, body: PinInput, request: Request, response: Response) -> None:
    group = store_mod.find_group(slug)
    client_ip = request.client.host if request.client else "unknown"
    attempts = store_mod.record_pin_attempt(f"{slug}:{client_ip}")
    if attempts > MAX_PIN_ATTEMPTS:
        raise ApiError(429, "TOO_MANY_ATTEMPTS", "Too many attempts. Try again in 15 minutes.")

    expected = store_mod.store.pin_hashes.get(slug)
    if not expected or store_mod._hash_pin(body.pin) != expected:
        raise ApiError(401, "INVALID_PIN", "That PIN is incorrect.")

    token = store_mod.issue_session_token(slug)
    set_session_cookie(response, slug, token)


@router.put("/g/{slug}/session/identity", status_code=204)
def set_identity(slug: str, body: IdentityInput, response: Response) -> None:
    group = store_mod.find_group(slug)
    if not any(m.id == body.member_id for m in group.members):
        raise ApiError(404, "MEMBER_NOT_FOUND", "That member no longer exists.")
    set_identity_cookie(response, slug, body.member_id)
