"""Database engine/session wiring.

Database-agnostic by design: the connection string comes from the
``SPLITIT_DATABASE_URL`` environment variable (any SQLAlchemy-supported URL,
e.g. ``sqlite:///./splitit.db`` or ``postgresql+psycopg://user:pass@host/db``).
If unset, we default to a local SQLite file so the app works out of the box.

Nothing outside this module (and ``db_models.py``) should know or care which
database engine is actually in use — ``store.py`` only talks to SQLAlchemy's
engine-agnostic ORM/Core APIs.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.orm import declarative_base

Base = declarative_base()

DEFAULT_DATABASE_URL = "sqlite:///./splitit.db"


def database_url() -> str:
    return os.environ.get("SPLITIT_DATABASE_URL", DEFAULT_DATABASE_URL)


def _make_engine() -> Engine:
    url = database_url()
    connect_args: dict[str, object] = {}
    if url.startswith("sqlite"):
        # SQLite only allows a connection to be used by the thread that
        # created it by default; FastAPI/uvicorn may hand requests to
        # different worker threads, so relax that restriction. This
        # `connect_args` tweak is SQLite-specific and skipped for every
        # other dialect (e.g. Postgres) so the engine stays portable.
        connect_args["check_same_thread"] = False
    return create_engine(url, connect_args=connect_args, future=True)


engine: Engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def _reload_engine() -> None:
    """Rebuild the module-level engine/session factory from the current
    ``SPLITIT_DATABASE_URL``. Used by tests that need an isolated database
    per test run (see ``tests/conftest.py``).
    """
    global engine, SessionLocal
    engine.dispose()
    engine = _make_engine()
    SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


@contextmanager
def session_scope() -> Iterator[Session]:
    """Provide a transactional scope: commits on success, rolls back on error."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db() -> None:
    """Create all tables that don't already exist. Safe to call repeatedly
    (e.g. on every app startup) since it's idempotent.
    """
    from . import db_models  # noqa: F401 -- registers models on Base.metadata

    Base.metadata.create_all(bind=engine)


def reset_db() -> None:
    """Drop and recreate every table. Used by the test suite to start each
    test from a clean database.
    """
    from . import db_models  # noqa: F401

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
