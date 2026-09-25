from __future__ import annotations

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

from .errors import ApiError, api_error_handler, validation_error_handler
from .routers import balances, expenses, groups, members, session, settlements


def create_app() -> FastAPI:
    app = FastAPI(
        title="SplitIt API",
        version="1.0.0",
        description="Backend for the SplitIt expense splitter (see /openapi.yaml at the repo root).",
        openapi_url="/api/v1/openapi.json",
        docs_url="/api/v1/docs",
    )
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)

    router_prefix = "/api/v1"
    app.include_router(groups.router, prefix=router_prefix)
    app.include_router(session.router, prefix=router_prefix)
    app.include_router(members.router, prefix=router_prefix)
    app.include_router(expenses.router, prefix=router_prefix)
    app.include_router(settlements.router, prefix=router_prefix)
    app.include_router(balances.router, prefix=router_prefix)

    return app


app = create_app()
