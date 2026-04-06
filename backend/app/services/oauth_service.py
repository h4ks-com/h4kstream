import base64
import hashlib

import httpx
import jwt
from pydantic import BaseModel

_oidc_config_cache: dict[str, "OIDCConfig"] = {}


class OIDCConfig(BaseModel):
    authorization_endpoint: str
    token_endpoint: str
    userinfo_endpoint: str


class TokenResponse(BaseModel):
    id_token: str
    access_token: str | None = None
    token_type: str | None = None
    expires_in: int | None = None


class UserClaims(BaseModel):
    sub: str
    username: str
    email: str | None = None
    name: str | None = None


class OAuthService:
    def __init__(self, endpoint: str, app_id: str, app_secret: str, redirect_uri: str):
        self.endpoint = endpoint.rstrip("/")
        self.app_id = app_id
        self.app_secret = app_secret
        self.redirect_uri = redirect_uri

    async def get_oidc_config(self) -> OIDCConfig:
        if self.endpoint in _oidc_config_cache:
            return _oidc_config_cache[self.endpoint]
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.endpoint}/oidc/.well-known/openid-configuration")
            response.raise_for_status()
            config = OIDCConfig.model_validate(response.json())
        _oidc_config_cache[self.endpoint] = config
        return config

    def build_authorization_url(self, state: str, code_challenge: str) -> str:
        params = {
            "response_type": "code",
            "client_id": self.app_id,
            "redirect_uri": self.redirect_uri,
            "scope": "openid profile email username roles",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        # Logto's authorization endpoint follows the standard path.
        return f"{self.endpoint}/oidc/auth?{query}"

    async def exchange_code(self, code: str, code_verifier: str) -> TokenResponse:
        config = await self.get_oidc_config()
        async with httpx.AsyncClient() as client:
            response = await client.post(
                config.token_endpoint,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": self.redirect_uri,
                    "client_id": self.app_id,
                    "client_secret": self.app_secret,
                    "code_verifier": code_verifier,
                },
            )
            response.raise_for_status()
            return TokenResponse.model_validate(response.json())

    async def fetch_userinfo(self, access_token: str) -> dict:
        config = await self.get_oidc_config()
        async with httpx.AsyncClient() as client:
            response = await client.get(
                config.userinfo_endpoint,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            response.raise_for_status()
            return response.json()

    def extract_user_claims(self, id_token: str) -> UserClaims:
        raw = jwt.decode(id_token, options={"verify_signature": False})
        sub = raw.get("sub", "")
        username = raw.get("username") or raw.get("preferred_username") or sub
        return UserClaims(
            sub=sub,
            username=username,
            email=raw.get("email"),
            name=raw.get("name"),
        )


def compute_code_challenge(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
