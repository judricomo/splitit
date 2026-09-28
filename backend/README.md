# SplitIt backend

A FastAPI implementation of the contract in `/openapi.yaml` (repo root),
which in turn mirrors `frontend/src/lib/mock-api.ts`. State is persisted in
a real database via SQLAlchemy (`src/splitit_backend/db.py` +
`db_models.py`), defaulting to a local SQLite file. The connection string is
fully configurable via an environment variable, and the schema/queries are
written against SQLAlchemy's engine-agnostic APIs, so pointing it at
Postgres (or any other SQLAlchemy dialect) later is just a URL change — no
code changes required.

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
the frontend's homepage works against the real backend too. Seeding is
idempotent — it's a no-op once the row already exists in the database.

CORS allows `http://localhost:8080` and `http://127.0.0.1:8080` (the Vite
dev server) with credentials, so browser cookies round-trip correctly.
Override with a comma-separated `SPLITIT_CORS_ORIGINS` env var if your
frontend runs elsewhere.

> If `splitit_backend` is ever reported as "not found" after editing
> `pyproject.toml`, re-run `uv sync` (a stale `.venv` from an interrupted
> install can leave a broken editable-install `.pth` file — deleting
> `.venv` and re-running `uv sync` fixes it).

## Database

Configure with the `SPLITIT_DATABASE_URL` environment variable (any
SQLAlchemy connection URL). If unset, it defaults to a SQLite file at
`backend/splitit.db`, created automatically on first startup.

```bash
# Default (SQLite file next to backend/):
uv run uvicorn splitit_backend.main:app --reload --port 8000

# Custom SQLite path:
SPLITIT_DATABASE_URL="sqlite:////tmp/splitit.db" uv run uvicorn splitit_backend.main:app --reload --port 8000

# Postgres (once you `uv add "psycopg[binary]"` or another Postgres driver):
SPLITIT_DATABASE_URL="postgresql+psycopg://user:pass@localhost:5432/splitit" \
  uv run uvicorn splitit_backend.main:app --reload --port 8000
```

Tables are created automatically on startup (`Base.metadata.create_all`) —
there's no separate migration step yet. If the schema changes significantly
in the future, consider adding Alembic migrations.

## Run the tests

```bash
uv run pytest
```

Tests live in `tests/` and hit the FastAPI app in-process via
`fastapi.testclient.TestClient`. `tests/conftest.py` points
`SPLITIT_DATABASE_URL` at an isolated, disposable SQLite file for the whole
test run and drops/recreates all tables before/after each test.

## Project layout

```
src/splitit_backend/
  main.py        # FastAPI app + router wiring
  models.py       # Pydantic schemas (mirrors openapi.yaml components)
  ledger.py       # Pure split/balance/debt-simplification math
  db.py           # SQLAlchemy engine/session setup (reads SPLITIT_DATABASE_URL)
  db_models.py    # SQLAlchemy ORM tables (groups, members, expenses, settlements)
  store.py        # Repository functions the routers call (DB-backed)
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

Session tokens and PIN rate-limiting are kept in an in-process dict rather
than the database — they're ephemeral, security-only bookkeeping, not
domain data, so they don't need to survive a restart.

## Known gap

There's no PIN-entry UI in the frontend yet. A group created with a PIN
sets the session cookie for the creating browser, so it keeps working
there, but a different browser/device opening that group's link will get
`401 PIN_REQUIRED` with nothing in the UI to enter the PIN and retry.
