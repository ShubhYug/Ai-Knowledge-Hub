"""Auth endpoints: register, login and current user."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.deps import current_user
from app.models import User
from app.schemas.user import AuthResponse, Credentials, UserOut

router = APIRouter()


def _response(user: User) -> AuthResponse:
    """Build the login/register reply: a fresh token plus the user."""
    return AuthResponse(
        access_token=create_access_token(user.id),
        user=UserOut(id=user.id, email=user.email),
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: Credentials, db: Session = Depends(get_db)) -> AuthResponse:
    """Create an account. Emails are stored lowercase and must be unique (409 if taken)."""
    email = payload.email.lower()
    user = User(email=email, password_hash=hash_password(payload.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "User already exists.")
    return _response(user)


@router.post("/login", response_model=AuthResponse)
def login(payload: Credentials, db: Session = Depends(get_db)) -> AuthResponse:
    """Check email and password. The same 401 is used for both, so emails are not revealed."""
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")
    return _response(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> UserOut:
    """Return the signed-in user."""
    return UserOut(id=user.id, email=user.email)
