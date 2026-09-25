"""RFC-9457-ish problem+json errors, matching ``frontend/src/lib/types.ts``'s
``ApiError`` and the `ProblemDetail` schema in /openapi.yaml.
"""

from __future__ import annotations

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(self, status: int, code: str, title: str) -> None:
        self.status = status
        self.code = code
        self.title = title
        super().__init__(title)


async def api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status,
        content={"status": exc.status, "code": exc.code, "title": exc.title},
        media_type="application/problem+json",
    )


async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """Pydantic/FastAPI request-shape errors, in the same problem+json envelope."""
    return JSONResponse(
        status_code=422,
        content={
            "status": 422,
            "code": "VALIDATION_ERROR",
            "title": "The request body did not match the expected shape.",
            "errors": exc.errors(),
        },
        media_type="application/problem+json",
    )
