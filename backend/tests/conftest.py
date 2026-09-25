from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from splitit_backend.main import create_app
from splitit_backend.store import reset_store


@pytest.fixture()
def client():
    reset_store()
    app = create_app()
    with TestClient(app) as c:
        yield c
    reset_store()


@pytest.fixture()
def group(client: TestClient) -> dict:
    """A freshly created group with 3 members and no PIN."""
    resp = client.post(
        "/api/v1/groups",
        json={
            "name": "Cartagena trip",
            "currency_code": "COP",
            "my_name": "Ana",
            "member_names": ["Luis", "Marta"],
        },
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.fixture()
def pinned_group(client: TestClient) -> dict:
    resp = client.post(
        "/api/v1/groups",
        json={
            "name": "Secret trip",
            "currency_code": "USD",
            "my_name": "Ana",
            "member_names": ["Luis"],
            "pin": "1234",
        },
    )
    assert resp.status_code == 201
    return resp.json()
