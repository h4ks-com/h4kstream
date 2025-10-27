import os

import httpx
import pytest
import redis
from dotenv import load_dotenv

load_dotenv("../.env")

API_URL = os.getenv("API_URL", "http://localhost:8383")
ADMIN_TOKEN = os.getenv("ADMIN_API_TOKEN", "changeme")
REDIS_HOST = "localhost"
REDIS_PORT = 6379


@pytest.fixture
def client() -> httpx.Client:
    """Create HTTP client for testing."""
    return httpx.Client(base_url=API_URL, timeout=30.0)


@pytest.fixture
def admin_headers() -> dict[str, str]:
    """Get admin authorization headers."""
    return {"Authorization": f"Bearer {ADMIN_TOKEN}"}


@pytest.fixture(autouse=True)
def cleanup_livestream_state() -> None:
    """Clean up livestream state in Redis between tests."""
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    keys = r.keys("livestream:*")
    if keys:
        r.delete(*keys)
    r.close()
