import secrets
from collections.abc import AsyncGenerator

from fastapi import Depends
from fastapi import HTTPException
from fastapi.security import APIKeyHeader

from app.services.mpd_service import MPDClient
from app.settings import settings


def admin_auth(api_key: str = Depends(APIKeyHeader(name="Authorization"))):
    api_key = api_key.replace("Bearer ", "").strip()

    is_valid = secrets.compare_digest(
        api_key.encode("utf8"),
        settings.ADMIN_API_TOKEN.encode("utf8"),
    )
    if not is_valid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True


async def dep_mpd_client() -> AsyncGenerator[MPDClient, None]:
    client = MPDClient(settings.MPD_HOST, settings.MPD_PORT)
    await client.connect()
    yield client
    await client.disconnect()
