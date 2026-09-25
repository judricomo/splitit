"""Cookie-based auth helpers.

Two independent, per-group cookies:

- ``splitit_session_{slug}``: set after a correct PIN (POST /g/{slug}/session).
  Required to reach any ``/g/{slug}/...`` route *only* when the group has
  ``pin_required = True``. Holds an opaque server-side session token (see
  ``store.issue_session_token`` / ``store.is_valid_session``).
- ``splitit_identity_{slug}``: set by ``PUT /g/{slug}/session/identity``.
  Holds the plain ``member_id`` this device claims to be. Per spec, this is
  a label, not a security boundary — any device can claim any member.
"""

from __future__ import annotations

from fastapi import Request, Response

from . import store as store_mod
from .errors import ApiError
from .models import Group


def session_cookie_name(slug: str) -> str:
    return f"splitit_session_{slug}"


def identity_cookie_name(slug: str) -> str:
    return f"splitit_identity_{slug}"


def require_group_access(slug: str, request: Request) -> Group:
    """Resolve the group and enforce the PIN-session cookie when required."""
    group = store_mod.find_group(slug)
    if group.pin_required:
        token = request.cookies.get(session_cookie_name(slug))
        if not store_mod.is_valid_session(slug, token):
            raise ApiError(401, "PIN_REQUIRED", "Enter the group PIN to continue.")
    return group


def get_identity(slug: str, request: Request) -> str | None:
    return request.cookies.get(identity_cookie_name(slug))


def require_identity(slug: str, request: Request) -> str:
    member_id = get_identity(slug, request)
    if not member_id:
        raise ApiError(409, "IDENTITY_REQUIRED", "Pick who you are first.")
    return member_id


def set_identity_cookie(response: Response, slug: str, member_id: str) -> None:
    response.set_cookie(
        identity_cookie_name(slug),
        member_id,
        httponly=True,
        samesite="lax",
        max_age=90 * 24 * 60 * 60,
        path="/",
    )


def set_session_cookie(response: Response, slug: str, token: str) -> None:
    response.set_cookie(
        session_cookie_name(slug),
        token,
        httponly=True,
        samesite="lax",
        # `secure=True` in production (HTTPS-only); left off here so the
        # mock backend also works over plain HTTP during local development.
        max_age=90 * 24 * 60 * 60,
        path="/",
    )
