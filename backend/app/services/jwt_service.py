from datetime import UTC
from datetime import datetime
from datetime import timedelta

import jwt

from app.settings import settings


def generate_token(duration_seconds: int) -> str:
    """Generate a JWT token with specified duration.

    :param duration_seconds: Token validity duration in seconds (max 86400)
    :return: Encoded JWT token
    """
    max_duration = 86400
    if duration_seconds > max_duration:
        duration_seconds = max_duration

    expiration = datetime.now(UTC) + timedelta(seconds=duration_seconds)
    payload = {"exp": expiration, "type": "temporary"}
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
