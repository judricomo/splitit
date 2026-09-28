from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from .errors import ApiError, api_error_handler, validation_error_handler
from .routers import balances, expenses, groups, members, session, settlements
from .db import init_db
from .seed import seed_demo_group


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_db()
    seed_demo_group()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="SplitIt API",
        version="1.0.0",
        description="Backend for the SplitIt expense splitter (see /openapi.yaml at the repo root).",
        openapi_url="/api/v1/openapi.json",
        docs_url="/api/v1/docs",
        lifespan=_lifespan,
    )
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)

    # The Vite dev server's origin(s). `allow_credentials=True` requires
    # explicit origins (no "*") since the session/identity cookies must
    # round-trip for the frontend to work.
    default_origins = "http://localhost:8080,http://127.0.0.1:8080"
    origins = os.environ.get("SPLITIT_CORS_ORIGINS", default_origins).split(",")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in origins if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    router_prefix = "/api/v1"
    app.include_router(groups.router, prefix=router_prefix)
    app.include_router(session.router, prefix=router_prefix)
    app.include_router(members.router, prefix=router_prefix)
    app.include_router(expenses.router, prefix=router_prefix)
    app.include_router(settlements.router, prefix=router_prefix)
    app.include_router(balances.router, prefix=router_prefix)

    return app


app = create_app()
