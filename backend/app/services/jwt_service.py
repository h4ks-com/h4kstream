from datetime import UTC
from datetime import datetime
from datetime import timedelta
from uuid import UUID
from uuid import uuid4

import jwt

from app.settings import settings


def generate_token(
    duration_seconds: int,
    user_id: str | UUID | None = None,
    max_queue_songs: int | None = None,
    max_add_requests: int | None = None,
) -> str:
    """Generate a JWT token with specified duration and limits.

    :param duration_seconds: Token validity duration in seconds (max 86400)
    :param user_id: User UUID (None = generate random ID for temporary tokens)
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

    if user_id is None:
        user_id_str = uuid4().hex
    else:
        user_id_str = str(user_id) if isinstance(user_id, UUID) else user_id

    expiration = datetime.now(UTC) + timedelta(seconds=duration_seconds)
    payload = {
        "exp": expiration,
        "type": "temporary",
        "user_id": user_id_str,
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


def generate_livestream_token(
    max_streaming_seconds: int,
    show_name: str | None = None,
    user_id: str | UUID | None = None,
    min_recording_duration: int = 60,
) -> tuple[str, datetime]:
    """Generate a JWT token for livestreaming with time limit and recording settings.

    :param max_streaming_seconds: Maximum allowed streaming time in seconds
    :param show_name: Optional show identifier (for show ownership tracking)
    :param user_id: Optional user UUID who owns the show
    :param min_recording_duration: Minimum duration in seconds to keep recording (default 60)
    :return: Tuple of (encoded JWT token, expiration datetime)
    """
    max_duration = 86400
    if max_streaming_seconds > max_duration:
        max_streaming_seconds = max_duration

    if user_id is None:
        user_id_str = uuid4().hex
    else:
        user_id_str = str(user_id) if isinstance(user_id, UUID) else user_id

    if show_name is None:
        show_name = "livestream"

    expiration = datetime.now(UTC) + timedelta(hours=24)
    payload = {
        "exp": expiration,
        "type": "livestream",
        "user_id": user_id_str,
        "max_streaming_seconds": max_streaming_seconds,
        "show_name": show_name,
        "min_recording_duration": min_recording_duration,
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
    return token, expiration


def decode_livestream_token(token: str) -> dict:
    """Decode a livestream JWT token and return payload.

    :param token: JWT token to decode
    :return: Token payload with user_id and max_streaming_seconds
    :raises jwt.ExpiredSignatureError: If token has expired
    :raises jwt.InvalidTokenError: If token is invalid or not a livestream token
    """
    payload = decode_token(token)
    if payload.get("type") != "livestream":
        raise jwt.InvalidTokenError("Token is not a livestream token")
    return payload
