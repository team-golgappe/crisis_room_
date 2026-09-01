"""
SQLAlchemy engine + session wiring for the authenticated product area.

SQLite by default (a single file at the repo root). The `/console` demo
surface never imports this module.
"""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from config import settings

_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    """Create tables if they don't exist. Safe to call on every startup."""
    from db import models  # noqa: F401  (register mappers before create_all)

    Base.metadata.create_all(bind=engine)


def get_db() -> Iterator[Session]:
    """FastAPI dependency — yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def session_scope() -> Session:
    """For use outside the request cycle (e.g. background monitor tasks).
    Caller owns commit/rollback/close."""
    return SessionLocal()
