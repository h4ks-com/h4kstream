from datetime import UTC
from datetime import datetime
from datetime import timedelta
from uuid import uuid4

import jwt

from app.settings import settings


def generate_token(
    duration_seconds: int, max_queue_songs: int | None = None, max_add_requests: int | None = None
) -> str:
    """Generate a JWT token with specified duration and limits.

    :param duration_seconds: Token validity duration in seconds (max 86400)
    :param max_queue_songs: Maximum songs user can have in queue simultaneously (None = use default)
    :param max_add_requests: Total add requests allowed for lifetime of token (None = use default)
    :return: Encoded JWT token
    """
    max_duration = 86400
    if duration_seconds > max_duration:
        duration_seconds = max_duration

    if max_queue_songs is None:
        max_queue_songs = settings.DEFAULT_MAX_QUEUE_SONGS

    if max_add_requests is None:
        max_add_requests = settings.DEFAULT_MAX_ADD_REQUESTS

    expiration = datetime.now(UTC) + timedelta(seconds=duration_seconds)
    payload = {
        "exp": expiration,
        "type": "temporary",
        "user_id": uuid4().hex,
        "max_queue_songs": max_queue_songs,
        "max_add_requests": max_add_requests,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def validate_token(token: str) -> bool:
    """Validate a JWT token.

    :param token: JWT token to validate
    :return: True if valid
    :raises jwt.ExpiredSignatureError: If token has expired
    :raises jwt.InvalidTokenError: If token is invalid
    """
    jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    return True


def decode_token(token: str) -> dict:
    """Decode a JWT token and return payload.

    :param token: JWT token to decode
    :return: Token payload
    :raises jwt.ExpiredSignatureError: If token has expired
    :raises jwt.InvalidTokenError: If token is invalid
    """
    return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])


def get_user_id(token: str) -> str:
    """Extract user_id from JWT token."""
    payload = decode_token(token)
    return payload.get("user_id", "unknown")


def get_max_queue_songs(token: str) -> int:
    """Extract max_queue_songs from JWT token."""
    payload = decode_token(token)
    return payload.get("max_queue_songs", settings.DEFAULT_MAX_QUEUE_SONGS)


def get_max_add_requests(token: str) -> int:
    """Extract max_add_requests from JWT token."""
    payload = decode_token(token)
    return payload.get("max_add_requests", settings.DEFAULT_MAX_ADD_REQUESTS)
