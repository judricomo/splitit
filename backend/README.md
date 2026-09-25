# SplitIt backend

A FastAPI implementation of the contract in `/openapi.yaml` (repo root),
which in turn mirrors `frontend/src/lib/mock-api.ts`. State is kept in an
**in-memory mock "database"** (`src/splitit_backend/store.py`) — swap that
module for a real Postgres-backed repository later; the routers only call
its functions, so nothing else needs to change.

## Requirements

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) for dependency management

## Setup

```bash
cd backend
uv sync
```

## Run the dev server

```bash
uv run uvicorn splitit_backend.main:app --reload --port 8000
```

The API is served under `/api/v1` (e.g. `POST http://localhost:8000/api/v1/groups`).
Interactive docs: http://localhost:8000/api/v1/docs

A demo group is seeded on startup at the same slug the frontend's old mock
client used (`kQ7xR2mVb9LtYc4PzNs1Aw`), so the "Open the demo group" link on
the frontend's homepage works against the real backend too.

CORS allows `http://localhost:8080` and `http://127.0.0.1:8080` (the Vite
dev server) with credentials, so browser cookies round-trip correctly.
Override with a comma-separated `SPLITIT_CORS_ORIGINS` env var if your
frontend runs elsewhere.

> If `splitit_backend` is ever reported as "not found" after editing
> `pyproject.toml`, re-run `uv sync` (a stale `.venv` from an interrupted
> install can leave a broken editable-install `.pth` file — deleting
> `.venv` and re-running `uv sync` fixes it).

## Run the tests

```bash
uv run pytest
```

Tests live in `tests/` and hit the FastAPI app in-process via
`fastapi.testclient.TestClient`, resetting the mock store before/after each
test (see `tests/conftest.py`).

## Project layout

```
src/splitit_backend/
  main.py        # FastAPI app + router wiring
  models.py       # Pydantic schemas (mirrors openapi.yaml components)
  ledger.py       # Pure split/balance/debt-simplification math
  store.py        # In-memory mock "database"
  security.py     # Per-group session/identity cookie helpers
  errors.py       # ApiError -> RFC-9457-ish problem+json responses
  routers/        # One module per resource (groups, session, members, ...)
tests/            # pytest suite, one module per resource
```

## Auth model (mock)

- `splitit_session_{slug}` cookie: required only for groups created with a
  PIN (`pin_required = true`); obtained via `POST /g/{slug}/session`.
- `splitit_identity_{slug}` cookie: the device's chosen `member_id`, set via
  `PUT /g/{slug}/session/identity`. **Not** `HttpOnly` — the frontend reads
  it directly (identity is a label, not a security boundary; spec §7.2).
  Writes with no identity chosen return `409 IDENTITY_REQUIRED`.

## Known gap

There's no PIN-entry UI in the frontend yet. A group created with a PIN
sets the session cookie for the creating browser, so it keeps working
there, but a different browser/device opening that group's link will get
`401 PIN_REQUIRED` with nothing in the UI to enter the PIN and retry.
