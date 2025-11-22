import secrets
from collections.abc import AsyncGenerator

import jwt
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Request
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.security import HTTPBearer
from sqlmodel import Session

from app.db import engine
from app.services.client_count_service import ClientCountService
from app.services.event_publisher import EventPublisher
from app.services.jwt_service import get_role
from app.services.jwt_service import validate_token
from app.services.livestream_service import LivestreamService
from app.services.mpd_service import MPDClient
from app.services.redis_service import RedisService
from app.settings import settings

security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)


def _extract_token(credentials: HTTPAuthorizationCredentials) -> str:
    return credentials.credentials.strip()


def _is_admin_token(token: str) -> bool:
    """Check if token matches any valid admin token."""
    return any(secrets.compare_digest(token.encode("utf8"), valid.encode("utf8")) for valid in settings.admin_tokens)


def admin_auth(credentials: HTTPAuthorizationCredentials = Depends(security)) -> bool:
    """Validate admin bearer token using secure comparison."""
    token = _extract_token(credentials)
    is_valid = _is_admin_token(token)
    if not is_valid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True


def jwt_or_admin_auth(credentials: HTTPAuthorizationCredentials = Depends(security)) -> bool:
    """Validate either JWT token or admin token."""
    token = _extract_token(credentials)

    if _is_admin_token(token):
        return True

    try:
        if validate_token(token):
            return True
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    raise HTTPException(status_code=401, detail="Unauthorized")


async def dep_mpd_user() -> AsyncGenerator[MPDClient, None]:
    """User queue MPD instance."""
    client = MPDClient(settings.MPD_USER_HOST, settings.MPD_USER_PORT)
    await client.connect()
    yield client
    await client.disconnect()


async def dep_mpd_fallback() -> AsyncGenerator[MPDClient, None]:
    """Fallback playlist MPD instance."""
    client = MPDClient(settings.MPD_FALLBACK_HOST, settings.MPD_FALLBACK_PORT)
    await client.connect()
    yield client
    await client.disconnect()


async def dep_mpd_client() -> AsyncGenerator[MPDClient, None]:
    """Legacy: User MPD instance (for backwards compatibility)."""
    async for client in dep_mpd_user():
        yield client


async def dep_redis_client(request: Request) -> AsyncGenerator[RedisService, None]:
    client = RedisService(request.app.state.redis_pool)
    yield client


async def dep_livestream_service(request: Request) -> AsyncGenerator[LivestreamService, None]:
    """Livestream service with Redis and DB backend."""
    db_session = Session(engine)
    service = LivestreamService(request.app.state.redis_pool, db_session)
    try:
        yield service
    finally:
        db_session.close()


def get_jwt_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract JWT token from request (exclude admin tokens)."""
    token = _extract_token(credentials)
    if _is_admin_token(token):
        raise HTTPException(status_code=403, detail="Admin token not allowed for this operation")
    try:
        validate_token(token)
        return token
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_jwt_token_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_optional),
) -> str | None:
    """Extract JWT token from request if present (exclude admin tokens)."""
    if not credentials:
        return None

    token = _extract_token(credentials)
    if _is_admin_token(token):
        return None

    try:
        validate_token(token)
        return token
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def dep_liquidsoap_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> bool:
    """Validate Liquidsoap internal token."""
    token = _extract_token(credentials)
    is_valid = secrets.compare_digest(token.encode("utf8"), settings.LIQUIDSOAP_TOKEN.encode("utf8"))
    if not is_valid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True


async def dep_event_publisher(request: Request) -> AsyncGenerator[EventPublisher, None]:
    """Event publisher for webhook notifications."""
    publisher = EventPublisher(request.app.state.redis_pool)
    yield publisher


def dep_client_count_service() -> ClientCountService:
    """Client count service for tracking radio listeners."""
    return ClientCountService()


def require_admin_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> bool:
    """Require admin TOKEN (ADMIN_API_TOKEN only, not role-based admin).

    This dependency ensures only true admin tokens can perform sensitive operations like changing user roles. Users with
    role="admin" in their JWT are NOT allowed.
    """
    token = _extract_token(credentials)
    if not _is_admin_token(token):
        raise HTTPException(status_code=403, detail="Admin token required")
    return True


def require_admin_role(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Require admin role (either admin TOKEN or JWT with role="admin").

    This dependency allows both:
    - Admin tokens (ADMIN_API_TOKEN)
    - JWT tokens with role="admin"

    Returns the token for further processing.
    """
    token = _extract_token(credentials)

    # Admin tokens always allowed
    if _is_admin_token(token):
        return token

    # Check JWT token for admin role
    try:
        validate_token(token)
        role = get_role(token)
        if role == "admin":
            return token
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    raise HTTPException(status_code=403, detail="Admin access required")
