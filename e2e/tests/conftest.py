import os

import httpx
import pytest
from dotenv import load_dotenv

load_dotenv("../.env")

API_URL = os.getenv("API_URL", "http://localhost:8383")
ADMIN_TOKEN = os.getenv("ADMIN_API_TOKEN", "changeme")


@pytest.fixture
def client() -> httpx.Client:
    """Create HTTP client for testing."""
    return httpx.Client(base_url=API_URL, timeout=30.0)


@pytest.fixture
def admin_headers() -> dict[str, str]:
    """Get admin authorization headers."""
    return {"Authorization": f"Bearer {ADMIN_TOKEN}"}
