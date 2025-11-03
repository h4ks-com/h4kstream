"""User authentication and management endpoints."""

import logging
import secrets
from datetime import UTC
from datetime import datetime
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter
from fastapi import Depends
from fastapi import Header
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
from app.dependencies import dep_redis_client
from app.dependencies import get_jwt_token
from app.models import ErrorResponse
from app.models import TokenCreateResponse
from app.models import TokenRefreshRequest
from app.models import TokenRefreshResponse
from app.services.crud_service import CRUDService
from app.services.jwt_service import decode_token
from app.services.jwt_service import decode_token_ignore_expiry
from app.services.jwt_service import generate_refresh_token
from app.services.jwt_service import generate_token
from app.services.jwt_service import hash_refresh_token
from app.services.jwt_service import preserve_token_expiry
from app.services.password_service import hash_password
from app.services.password_service import verify_password
from app.services.redis_service import RedisService

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


@router.get(
    "/validate-signup-token",
    response_model=PendingUserPublic,
    summary="Validate Signup Token",
    description="Validate a pending user signup token and return email information.",
    responses={400: {"model": ErrorResponse, "description": "Invalid or expired token"}},
)
def validate_signup_token(
    signup_token: str = Query(..., description="Pending user signup token"),
    session: Session = Depends(get_session),
) -> PendingUserPublic:
    """Validate signup token and return pending user information."""
    pending = session.exec(select(PendingUser).where(PendingUser.token == signup_token)).first()

    if not pending:
        raise HTTPException(status_code=400, detail="Invalid signup token")

    if pending.used:
        raise HTTPException(status_code=400, detail="Signup token already used")

    # Ensure timezone-aware comparison
    expires_at = pending.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)

    if expires_at < datetime.now(UTC):
        raise HTTPException(status_code=400, detail="Signup token expired")

    return pending


@router.post(
    "/register",
    response_model=TokenCreateResponse,
    summary="Register New User",
    description="Register a new user with a valid pending user token.",
    responses={400: {"model": ErrorResponse, "description": "Invalid token or user already exists"}},
)
async def register_user(
    user_data: UserCreate,
    signup_token: str = Query(..., description="Pending user signup token"),
    session: Session = Depends(get_session),
    redis: RedisService = Depends(dep_redis_client),
) -> TokenCreateResponse:
    """Register a new user with a pending token."""
    pending = session.exec(select(PendingUser).where(PendingUser.token == signup_token)).first()

    if not pending:
        raise HTTPException(status_code=400, detail="Invalid signup token")

    if pending.used:
        raise HTTPException(status_code=400, detail="Signup token already used")

    # Ensure timezone-aware comparison
    expires_at = pending.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)

    if expires_at < datetime.now(UTC):
        raise HTTPException(status_code=400, detail="Signup token expired")

    if pending.email != user_data.email:
        raise HTTPException(status_code=400, detail="Email does not match signup token")

    existing_user = session.exec(select(User).where(User.email == user_data.email)).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")

    password_hash = hash_password(user_data.password)
    user = user_crud.create(
        session,
        obj_in=user_data,
        password_hash=password_hash,
        max_queue_songs=pending.max_queue_songs,
        max_add_requests=pending.max_add_requests,
    )

    pending.used = True
    session.add(pending)
    session.commit()

    # Use user's limits if set, otherwise use pending user limits
    max_queue_songs = user.max_queue_songs if user.max_queue_songs is not None else pending.max_queue_songs
    max_add_requests = user.max_add_requests if user.max_add_requests is not None else pending.max_add_requests

    token = generate_token(
        duration_seconds=3600,
        user_id=user.id,
        max_queue_songs=max_queue_songs,
        max_add_requests=max_add_requests,
    )

    refresh_token = generate_refresh_token()
    refresh_token_hash = hash_refresh_token(refresh_token)
    await redis.set_refresh_token(str(user.id), refresh_token_hash)

    return TokenCreateResponse(token=token, refresh_token=refresh_token)


@router.post(
    "/login",
    response_model=TokenCreateResponse,
    summary="User Login",
    description="Login with email and password to receive a JWT token.",
    responses={401: {"model": ErrorResponse, "description": "Invalid credentials"}},
)
async def login_user(
    credentials: UserLogin,
    session: Session = Depends(get_session),
    redis: RedisService = Depends(dep_redis_client),
) -> TokenCreateResponse:
    """Login user and return JWT token."""
    user = session.exec(select(User).where(User.email == credentials.email)).first()

    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=401, detail="User account is inactive")

    token = generate_token(
        duration_seconds=3600,
        user_id=user.id,
        max_queue_songs=user.max_queue_songs,
        max_add_requests=user.max_add_requests,
    )

    refresh_token = generate_refresh_token()
    refresh_token_hash = hash_refresh_token(refresh_token)
    await redis.set_refresh_token(str(user.id), refresh_token_hash)

    return TokenCreateResponse(token=token, refresh_token=refresh_token)


@router.post(
    "/auth/refresh",
    response_model=TokenRefreshResponse,
    summary="Refresh Token",
    description="Refresh JWT token using a valid refresh token.",
    responses={401: {"model": ErrorResponse, "description": "Invalid or expired refresh token"}},
)
async def refresh_token(
    request: TokenRefreshRequest,
    x_refresh_token: str = Header(..., description="Refresh token"),
    session: Session = Depends(get_session),
    redis: RedisService = Depends(dep_redis_client),
) -> TokenRefreshResponse:
    """Refresh JWT token with refresh token."""
    try:
        payload = decode_token_ignore_expiry(request.token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id_str = payload.get("user_id")
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid user ID in token")

    user = user_crud.get(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.is_active:
        raise HTTPException(status_code=401, detail="User account is inactive")

    stored_hash = await redis.get_refresh_token(str(user_id))
    if not stored_hash:
        raise HTTPException(status_code=401, detail="No refresh token found")

    provided_hash = hash_refresh_token(x_refresh_token)
    if not secrets.compare_digest(stored_hash, provided_hash):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    preserved_expiry = preserve_token_expiry(request.token, threshold_seconds=60)

    new_token = generate_token(
        user_id=user_id,
        max_queue_songs=user.max_queue_songs,
        max_add_requests=user.max_add_requests,
        expiry=preserved_expiry,
    )

    new_refresh_token = generate_refresh_token()
    new_refresh_token_hash = hash_refresh_token(new_refresh_token)
    await redis.set_refresh_token(str(user_id), new_refresh_token_hash)

    return TokenRefreshResponse(token=new_token, refresh_token=new_refresh_token)


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


@admin_router.patch(
    "/{user_id}",
    response_model=UserPublic,
    summary="Update User Limits",
    description="Admin endpoint to update user limits.",
    responses={404: {"model": ErrorResponse, "description": "User not found"}},
)
def update_user_limits(
    user_id: UUID,
    user_update: UserUpdate,
    session: Session = Depends(get_session),
) -> UserPublic:
    """Update user limits (admin only)."""
    user = user_crud.get(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_update.model_dump(exclude_unset=True)
    if "password" in update_data:
        update_data["password_hash"] = hash_password(update_data.pop("password"))

    updated_user = user_crud.update(session, db_obj=user, obj_in=update_data)
    return updated_user


@admin_router.post(
    "/{user_id}/logout",
    summary="Logout User",
    description="Admin endpoint to logout a user by deleting their refresh token.",
    responses={404: {"model": ErrorResponse, "description": "User not found"}},
)
async def logout_user(
    user_id: UUID,
    session: Session = Depends(get_session),
    redis: RedisService = Depends(dep_redis_client),
) -> dict[str, bool]:
    """Logout user by deleting refresh token (admin only)."""
    user = user_crud.get(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await redis.delete_refresh_token(str(user_id))
    return {"ok": True}
