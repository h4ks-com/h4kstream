import secrets
from collections.abc import AsyncGenerator

import jwt
from fastapi import Depends
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.security import HTTPBearer

from app.services.jwt_service import validate_token
from app.services.mpd_service import MPDClient
from app.services.redis_service import RedisService
from app.settings import settings

security = HTTPBearer()


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


async def dep_redis_client() -> AsyncGenerator[RedisService, None]:
    redis_url = f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}"
    client = RedisService(redis_url)
    try:
        yield client
    finally:
        await client.close()


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
