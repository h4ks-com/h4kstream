import asyncio
from datetime import UTC
from datetime import datetime

import jwt
import pytest

from app.services.jwt_service import generate_livestream_token
from app.services.livestream_service import LivestreamService


class MockRedisClient:
    """Mock Redis client for testing without actual Redis connection."""

    def __init__(self):
        self._data = {}
        self._ttl = {}

    async def get(self, key: str) -> bytes | None:
        """Mock get operation."""
        if key in self._data:
            value = self._data[key]
            return value.encode() if isinstance(value, str) else value
        return None

    async def setex(self, key: str, ttl: int, value: str) -> None:
        """Mock setex operation."""
        self._data[key] = value
        self._ttl[key] = ttl

    async def setnx(self, key: str, value: str) -> bool:
        """Mock setnx operation - returns True if key was set."""
        if key not in self._data:
            self._data[key] = value
            return True
        return False

    async def delete(self, *keys: str) -> None:
        """Mock delete operation."""
        for key in keys:
            self._data.pop(key, None)
            self._ttl.pop(key, None)

    async def expire(self, key: str, ttl: int) -> None:
        """Mock expire operation."""
        if key in self._data:
            self._ttl[key] = ttl

    async def flushdb(self) -> None:
        """Mock flushdb operation."""
        self._data.clear()
        self._ttl.clear()

    async def aclose(self) -> None:
        """Mock aclose operation."""
        pass


@pytest.fixture
async def redis_client():
    """Create mock Redis client for testing."""
    client = MockRedisClient()
    yield client
    await client.flushdb()


@pytest.fixture
async def livestream_service(redis_client):
    """Create LivestreamService instance with mock Redis."""
    return LivestreamService(redis_client)


async def test_generate_livestream_token():
    """Test JWT token generation for livestreaming."""
    token, expires_at = generate_livestream_token(3600, "test-show")

    assert isinstance(token, str)
    assert isinstance(expires_at, datetime)

    payload = jwt.decode(token, options={"verify_signature": False})
    assert payload["type"] == "livestream"
    assert payload["max_streaming_seconds"] == 3600
    assert payload["show_name"] == "test-show"
    assert "user_id" in payload


async def test_validate_and_reserve_slot_success(livestream_service):
    """Test successful slot reservation."""
    token, _ = generate_livestream_token(3600, "test-show")
    success, reason, show_name, min_duration = await livestream_service.validate_and_reserve_slot(token, "192.168.1.1")

    assert success is True
    assert reason is None
    assert show_name == "test-show"
    assert min_duration == 60


async def test_validate_and_reserve_slot_expired_token(livestream_service):
    """Test slot reservation with expired token."""
    # Create a token that expired 10 seconds ago
    from datetime import timedelta
    from uuid import uuid4

    from app.settings import settings

    expiration = datetime.now(UTC) - timedelta(seconds=10)
    payload = {
        "exp": expiration,
        "type": "livestream",
        "user_id": uuid4().hex,
        "max_streaming_seconds": 3600,
        "show_name": "test-show",
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

    success, reason, show_name, min_duration = await livestream_service.validate_and_reserve_slot(token, "192.168.1.1")

    assert success is False
    assert "expired" in reason.lower()
    assert show_name is None
    assert min_duration is None


async def test_validate_and_reserve_slot_invalid_token(livestream_service):
    """Test slot reservation with invalid token."""
    success, reason, show_name, min_duration = await livestream_service.validate_and_reserve_slot("invalid_token", "192.168.1.1")

    assert success is False
    assert "invalid" in reason.lower()
    assert show_name is None
    assert min_duration is None


async def test_validate_and_reserve_slot_already_occupied(livestream_service, redis_client):
    """Test slot reservation when slot is already taken."""
    token1, _ = generate_livestream_token(3600, "test-show-1")
    token2, _ = generate_livestream_token(3600, "test-show-2")

    success1, _, _, _ = await livestream_service.validate_and_reserve_slot(token1, "192.168.1.1")
    assert success1 is True

    success2, reason2, _, _ = await livestream_service.validate_and_reserve_slot(token2, "192.168.1.2")
    assert success2 is False
    assert "occupied" in reason2.lower()

    await redis_client.delete("livestream:active")


async def test_validate_and_reserve_slot_time_limit_exceeded(livestream_service, redis_client):
    """Test slot reservation when user has exceeded time limit."""
    token, _ = generate_livestream_token(100, "test-show")
    payload = jwt.decode(token, options={"verify_signature": False})
    user_id = payload["user_id"]

    await redis_client.setex(f"livestream:user:{user_id}:total", 3600, "150")

    success, reason, _, _ = await livestream_service.validate_and_reserve_slot(token, "192.168.1.1")

    assert success is False
    assert "limit exceeded" in reason.lower()


async def test_track_connection_start(livestream_service, redis_client):
    """Test connection start tracking."""
    token, _ = generate_livestream_token(3600, "test-show")
    payload = jwt.decode(token, options={"verify_signature": False})
    user_id = payload["user_id"]

    result = await livestream_service.track_connection_start(token)
    assert result is not None

    session_start = await redis_client.get(f"livestream:session:{user_id}:start")
    assert session_start is not None

    start_time = datetime.fromisoformat(session_start.decode())
    assert (datetime.now(UTC) - start_time).total_seconds() < 2


async def test_handle_disconnect_updates_total_time(livestream_service, redis_client):
    """Test that disconnect properly updates total streaming time."""
    token, _ = generate_livestream_token(3600, "test-show")
    payload = jwt.decode(token, options={"verify_signature": False})
    user_id = payload["user_id"]

    await livestream_service.validate_and_reserve_slot(token, "192.168.1.1")
    await livestream_service.track_connection_start(token)

    await asyncio.sleep(2)

    result = await livestream_service.handle_disconnect(token)
    assert isinstance(result, dict)
    assert "elapsed_seconds" in result
    assert 1 <= result["elapsed_seconds"] <= 3

    total_time = await redis_client.get(f"livestream:user:{user_id}:total")
    assert total_time is not None

    total_seconds = int(total_time.decode())
    assert 1 <= total_seconds <= 3

    active_slot = await redis_client.get("livestream:active")
    assert active_slot is None


async def test_handle_disconnect_accumulates_time(livestream_service, redis_client):
    """Test that multiple sessions accumulate time correctly."""
    token, _ = generate_livestream_token(3600, "test-show")
    payload = jwt.decode(token, options={"verify_signature": False})
    user_id = payload["user_id"]

    await redis_client.setex(f"livestream:user:{user_id}:total", 3600, "50")

    await livestream_service.validate_and_reserve_slot(token, "192.168.1.1")
    await livestream_service.track_connection_start(token)
    await asyncio.sleep(2)
    await livestream_service.handle_disconnect(token)

    total_time = await redis_client.get(f"livestream:user:{user_id}:total")
    total_seconds = int(total_time.decode())

    assert total_seconds >= 50
    assert total_seconds <= 55


async def test_get_active_session(livestream_service):
    """Test retrieving active session data."""
    token, _ = generate_livestream_token(3600, "test-show")

    session = await livestream_service.get_active_session()
    assert session is None

    await livestream_service.validate_and_reserve_slot(token, "192.168.1.1")
    await livestream_service.track_connection_start(token)

    session = await livestream_service.get_active_session()
    assert session is not None
    assert "user_id" in session
    assert "max_streaming_seconds" in session
    assert "session_start" in session


async def test_check_and_enforce_time_limit_no_active_session(livestream_service):
    """Test time limit check with no active session."""
    await livestream_service.check_and_enforce_time_limit()


async def test_time_limit_enforcement_logic(livestream_service, redis_client):
    """Test that time limit logic correctly identifies when to disconnect."""
    token, _ = generate_livestream_token(5, "test-show")
    payload = jwt.decode(token, options={"verify_signature": False})
    user_id = payload["user_id"]

    await redis_client.setex(f"livestream:user:{user_id}:total", 3600, "3")

    await livestream_service.validate_and_reserve_slot(token, "192.168.1.1")
    await livestream_service.track_connection_start(token)

    await asyncio.sleep(3)

    await livestream_service.check_and_enforce_time_limit()

    active_slot = await redis_client.get("livestream:active")
    assert active_slot is None

    total_time = await redis_client.get(f"livestream:user:{user_id}:total")
    total_seconds = int(total_time.decode())
    assert total_seconds >= 5
