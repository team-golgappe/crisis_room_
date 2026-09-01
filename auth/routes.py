"""
Email + password auth. Sessions are a signed JWT in an httpOnly cookie.
No OAuth.

  POST /api/auth/signup   {email, password}  -> sets session cookie
  POST /api/auth/login    {email, password}  -> sets session cookie
  POST /api/auth/logout                      -> clears session cookie
  GET  /api/auth/me                          -> current user, or 401
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from auth.security import create_session_token, hash_password, verify_password
from config import settings
from db.database import get_db
from db.models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    slack_webhook_configured: bool = False


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        slack_webhook_configured=bool(user.slack_webhook_url),
    )


def _set_session_cookie(response: Response, user: User) -> None:
    token = create_session_token(user.id, user.email)
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
        path="/",
    )


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def signup(creds: Credentials, response: Response, db: Session = Depends(get_db)) -> UserOut:
    email = creds.email.lower().strip()
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with that email already exists.")

    user = User(email=email, hashed_password=hash_password(creds.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    _set_session_cookie(response, user)
    return _user_out(user)


@router.post("/login", response_model=UserOut)
def login(creds: Credentials, response: Response, db: Session = Depends(get_db)) -> UserOut:
    email = creds.email.lower().strip()
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(creds.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.")

    _set_session_cookie(response, user)
    return _user_out(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> Response:
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return _user_out(user)
