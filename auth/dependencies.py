"""
FastAPI dependencies for reading the current user from the session cookie.
"""
from __future__ import annotations

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth.security import decode_session_token
from config import settings
from db.database import get_db
from db.models import User


def _user_from_cookie(token: str | None, db: Session) -> User | None:
    if not token:
        return None
    claims = decode_session_token(token)
    if not claims:
        return None
    try:
        user_id = int(claims.get("sub", ""))
    except (TypeError, ValueError):
        return None
    return db.get(User, user_id)


def get_current_user(
    db: Session = Depends(get_db),
    session_token: str | None = Cookie(default=None, alias=settings.session_cookie_name),
) -> User:
    user = _user_from_cookie(session_token, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return user


def get_current_user_optional(
    db: Session = Depends(get_db),
    session_token: str | None = Cookie(default=None, alias=settings.session_cookie_name),
) -> User | None:
    return _user_from_cookie(session_token, db)
