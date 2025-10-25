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
    return secrets.compare_digest(token.encode("utf8"), settings.ADMIN_API_TOKEN.encode("utf8"))


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


async def dep_mpd_client() -> AsyncGenerator[MPDClient, None]:
    client = MPDClient(settings.MPD_HOST, settings.MPD_PORT)
    await client.connect()
    yield client
    await client.disconnect()


async def dep_redis_client() -> AsyncGenerator[RedisService, None]:
    redis_url = f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}"
    client = RedisService(redis_url)
    try:
        yield client
    finally:
        await client.close()
