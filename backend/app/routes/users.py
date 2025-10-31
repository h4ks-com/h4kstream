"""User authentication and management endpoints."""

import logging
import secrets
from datetime import UTC
from datetime import datetime
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Query
from sqlmodel import Session
from sqlmodel import select

from app.db import get_session
from app.db.models import PendingUser
from app.db.models import PendingUserCreate
from app.db.models import PendingUserPublic
from app.db.models import User
from app.db.models import UserCreate
from app.db.models import UserLogin
from app.db.models import UserPublic
from app.db.models import UserUpdate
from app.dependencies import admin_auth
from app.dependencies import get_jwt_token
from app.models import ErrorResponse
from app.models import TokenCreateResponse
from app.services.crud_service import CRUDService
from app.services.jwt_service import decode_token
from app.services.jwt_service import generate_token
from app.services.password_service import hash_password
from app.services.password_service import verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])
admin_router = APIRouter(
    prefix="/admin/users",
    tags=["admin", "users"],
    dependencies=[Depends(admin_auth)],
    responses={401: {"model": ErrorResponse, "description": "Unauthorized"}},
)

user_crud = CRUDService[User, UserCreate, UserUpdate](User)
pending_user_crud = CRUDService[PendingUser, PendingUserCreate, PendingUser](PendingUser)


@admin_router.post(
    "/pending",
    response_model=PendingUserPublic,
    summary="Create Pending User Token",
    description="Admin endpoint to generate a signup token for a new user.",
)
def create_pending_user(
    pending_user: PendingUserCreate,
    session: Session = Depends(get_session),
) -> PendingUserPublic:
    """Create a pending user registration token."""
    existing = session.exec(select(PendingUser).where(PendingUser.email == pending_user.email)).first()
    if existing and not existing.used:
        raise HTTPException(status_code=400, detail="Pending user already exists for this email")

    existing_user = session.exec(select(User).where(User.email == pending_user.email)).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists with this email")

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(hours=pending_user.duration_hours)

    db_pending = PendingUser(
        token=token,
        email=pending_user.email,
        expires_at=expires_at,
        max_queue_songs=pending_user.max_queue_songs,
        max_add_requests=pending_user.max_add_requests,
        used=False,
    )

    session.add(db_pending)
    session.commit()
    session.refresh(db_pending)

    return db_pending


@router.post(
    "/register",
    response_model=TokenCreateResponse,
    summary="Register New User",
    description="Register a new user with a valid pending user token.",
    responses={400: {"model": ErrorResponse, "description": "Invalid token or user already exists"}},
)
def register_user(
    user_data: UserCreate,
    signup_token: str = Query(..., description="Pending user signup token"),
    session: Session = Depends(get_session),
) -> TokenCreateResponse:
    """Register a new user with a pending token."""
    pending = session.exec(select(PendingUser).where(PendingUser.token == signup_token)).first()

    if not pending:
        raise HTTPException(status_code=400, detail="Invalid signup token")

    if pending.used:
        raise HTTPException(status_code=400, detail="Signup token already used")

    if pending.expires_at < datetime.now(UTC):
        raise HTTPException(status_code=400, detail="Signup token expired")

    if pending.email != user_data.email:
        raise HTTPException(status_code=400, detail="Email does not match signup token")

    existing_user = session.exec(select(User).where(User.email == user_data.email)).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")

    password_hash = hash_password(user_data.password)
    user = user_crud.create(session, obj_in=user_data, password_hash=password_hash)

    pending.used = True
    session.add(pending)
    session.commit()

    token = generate_token(
        duration_seconds=86400,
        user_id=user.id,
        max_queue_songs=pending.max_queue_songs,
        max_add_requests=pending.max_add_requests,
    )

    return TokenCreateResponse(token=token)


@router.post(
    "/login",
    response_model=TokenCreateResponse,
    summary="User Login",
    description="Login with email and password to receive a JWT token.",
    responses={401: {"model": ErrorResponse, "description": "Invalid credentials"}},
)
def login_user(
    credentials: UserLogin,
    session: Session = Depends(get_session),
) -> TokenCreateResponse:
    """Login user and return JWT token."""
    user = session.exec(select(User).where(User.email == credentials.email)).first()

    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=401, detail="User account is inactive")

    token = generate_token(duration_seconds=86400, user_id=user.id)

    return TokenCreateResponse(token=token)


@router.get(
    "/me",
    response_model=UserPublic,
    summary="Get Current User",
    description="Get the current authenticated user's information.",
)
def get_current_user(
    token: str = Depends(get_jwt_token),
    session: Session = Depends(get_session),
) -> UserPublic:
    """Get current authenticated user."""
    payload = decode_token(token)
    user_id_str = payload.get("user_id")

    if not user_id_str:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid user ID in token")

    user = user_crud.get(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user


@router.patch(
    "/me",
    response_model=UserPublic,
    summary="Update Current User",
    description="Update the current authenticated user's information.",
)
def update_current_user(
    user_update: UserUpdate,
    token: str = Depends(get_jwt_token),
    session: Session = Depends(get_session),
) -> UserPublic:
    """Update current authenticated user."""
    payload = decode_token(token)
    user_id_str = payload.get("user_id")

    if not user_id_str:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid user ID in token")

    user = user_crud.get(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_update.model_dump(exclude_unset=True)
    if "password" in update_data:
        update_data["password_hash"] = hash_password(update_data.pop("password"))

    updated_user = user_crud.update(session, db_obj=user, obj_in=update_data)
    return updated_user


@admin_router.get(
    "/",
    response_model=list[UserPublic],
    summary="List All Users",
    description="Admin endpoint to list all users.",
)
def list_users(
    skip: int = 0,
    limit: int = Query(default=100, le=100),
    session: Session = Depends(get_session),
) -> list[UserPublic]:
    """List all users (admin only)."""
    return user_crud.get_multi(session, skip=skip, limit=limit)


@admin_router.get(
    "/{user_id}",
    response_model=UserPublic,
    summary="Get User by ID",
    description="Admin endpoint to get a specific user.",
    responses={404: {"model": ErrorResponse, "description": "User not found"}},
)
def get_user(
    user_id: UUID,
    session: Session = Depends(get_session),
) -> UserPublic:
    """Get user by ID (admin only)."""
    user = user_crud.get(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@admin_router.delete(
    "/{user_id}",
    summary="Delete User",
    description="Admin endpoint to delete a user.",
    responses={404: {"model": ErrorResponse, "description": "User not found"}},
)
def delete_user(
    user_id: UUID,
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    """Delete user (admin only)."""
    user = user_crud.delete(session, id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}
