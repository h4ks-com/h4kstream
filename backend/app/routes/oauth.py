import json
import secrets

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Request
from fastapi.responses import RedirectResponse
from sqlmodel import Session
from sqlmodel import select

from app.db import get_session
from app.db.models import User
from app.dependencies import dep_redis_client
from app.services.jwt_service import generate_refresh_token
from app.services.jwt_service import generate_token
from app.services.jwt_service import hash_refresh_token
from app.services.oauth_service import OAuthService
from app.services.oauth_service import compute_code_challenge
from app.services.password_service import hash_password
from app.services.redis_service import RedisService
from app.settings import settings

router = APIRouter(prefix="/users/oauth", tags=["users", "oauth"])

_OAUTH_STATE_TTL = 600  # 10 minutes


def _get_oauth_service() -> OAuthService:
    return OAuthService(
        endpoint=settings.LOGTO_ENDPOINT,
        app_id=settings.LOGTO_APP_ID,
        app_secret=settings.LOGTO_APP_SECRET,
        redirect_uri=settings.LOGTO_REDIRECT_URI,
    )


@router.get("/status", summary="OAuth Login Status")
async def oauth_status() -> dict:
    return {"enabled": settings.oauth_enabled}


@router.get("/login", summary="Initiate OAuth Login")
async def oauth_login(redis: RedisService = Depends(dep_redis_client)) -> RedirectResponse:
    if not settings.oauth_enabled:
        raise HTTPException(status_code=404, detail="OAuth login not configured")

    state = secrets.token_urlsafe(32)
    code_verifier = secrets.token_urlsafe(48)
    code_challenge = compute_code_challenge(code_verifier)

    await redis.redis.setex(
        f"oauth:state:{state}",
        _OAUTH_STATE_TTL,
        json.dumps({"code_verifier": code_verifier}),
    )

    oauth_service = _get_oauth_service()
    authorization_url = oauth_service.build_authorization_url(state, code_challenge)
    return RedirectResponse(authorization_url, status_code=302)


@router.get("/callback", summary="OAuth Callback")
async def oauth_callback(
    request: Request,
    code: str,
    state: str,
    redis: RedisService = Depends(dep_redis_client),
    session: Session = Depends(get_session),
) -> RedirectResponse:
    if not settings.oauth_enabled:
        raise HTTPException(status_code=404, detail="OAuth login not configured")

    raw = await redis.redis.get(f"oauth:state:{state}")
    if not raw:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    await redis.redis.delete(f"oauth:state:{state}")

    state_data = json.loads(raw)
    code_verifier = state_data["code_verifier"]

    oauth_service = _get_oauth_service()
    token_response = await oauth_service.exchange_code(code, code_verifier)

    if not token_response.access_token:
        raise HTTPException(status_code=502, detail="No access token in OAuth response")

    userinfo = await oauth_service.fetch_userinfo(token_response.access_token)
    roles: list[str] = userinfo.get("roles") or []
    if "radio" not in roles:
        frontend_url = f"{request.url.scheme}://{request.url.netloc}"
        return RedirectResponse(f"{frontend_url}/no-access", status_code=302)

    claims = oauth_service.extract_user_claims(token_response.id_token)
    username = claims.username

    user = session.exec(select(User).where(User.username == username)).first()
    if not user:
        email = claims.email or f"{username}@oauth.local"
        user = User(
            email=email,
            username=username,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            role="",
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)

    token = generate_token(
        duration_seconds=3600,
        user_id=user.id,
        max_queue_songs=user.max_queue_songs,
        max_add_requests=user.max_add_requests,
        role=user.role,
    )
    refresh_token = generate_refresh_token()
    refresh_token_hash = hash_refresh_token(refresh_token)
    await redis.set_refresh_token(str(user.id), refresh_token_hash)

    frontend_url = f"{request.url.scheme}://{request.url.netloc}"
    return RedirectResponse(
        f"{frontend_url}/login/callback?token={token}&refresh_token={refresh_token}",
        status_code=302,
    )
