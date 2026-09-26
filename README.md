# SplitIt

SplitIt is a web app for splitting shared expenses in a group. Anyone opens a
group from a secret link — no sign-up — logs what everyone paid, splits it
equally, by exact amounts, percentages or shares, and SplitIt works out
exactly who owes whom, simplified to the fewest possible payments.

Full product spec: [`docs/spec.md`](docs/spec.md).

## Repo layout

```
frontend/   React + Vite + TanStack Start app (UI)
backend/    FastAPI app with a mock in-memory database
openapi.yaml  API contract shared by both — the source of truth for every
              endpoint, request/response shape and auth requirement
docs/       Product spec
```

The frontend talks to the backend over HTTP using the contract in
`openapi.yaml`. The backend currently stores everything in memory
(`backend/src/splitit_backend/store.py`) so it can be swapped for a real
database later without touching the routers.

## Features

- Create a group and get a shareable link; optionally protect it with a PIN.
- Log expenses split equally, by exact amounts, percentages or shares, with
  one or several payers.
- See balances per person and the shortest list of payments to settle up.
- Record payments between members (no money actually moves through the app).
- Pick "I am…" once per device to label what you add — a convenience, not
  authentication.
- English and Spanish UI, auto-detected from the browser and switchable
  anytime.

## Quickstart

Requirements: Node.js + npm, Python 3.12+ and [uv](https://docs.astral.sh/uv/).

**Backend** (http://localhost:8000):

```bash
cd backend
uv sync
uv run uvicorn splitit_backend.main:app --reload --port 8000
```

**Frontend** (http://localhost:8080):

```bash
cd frontend
npm i
npm run dev
```

Open http://localhost:8080 — the homepage links to a seeded demo group, or
create your own. See [`backend/README.md`](backend/README.md) and
[`frontend/README.md`](frontend/README.md) for details, testing, and
troubleshooting.

## Testing

```bash
# Backend
cd backend && uv run pytest

# Frontend
cd frontend && npx tsc --noEmit && npm run lint
```
