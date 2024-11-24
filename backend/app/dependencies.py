import secrets

from fastapi import Depends
from fastapi import HTTPException
from fastapi.security import APIKeyHeader

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
