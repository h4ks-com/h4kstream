import os
import subprocess
import time
from collections.abc import Generator

import httpx
import pytest
import redis
from dotenv import load_dotenv

load_dotenv("../.env")

API_URL = os.getenv("API_URL", "http://localhost/api")
STREAM_BASE_URL = API_URL.rsplit("/api", 1)[0]  # http://localhost
ADMIN_TOKEN = os.getenv("ADMIN_API_TOKEN", "changeme")
REDIS_HOST = "localhost"
REDIS_PORT = 6379


def stream_to_liquidsoap(
    token: str,
    duration: int,
    metadata: dict[str, str] | None = None,
    timeout: int | None = None,
) -> subprocess.Popen:
    """Stream OGG/Vorbis audio to liquidsoap via Caddy using HTTP PUT + Basic Auth.

    Args:
        token: JWT authentication token
        duration: Stream duration in seconds
        metadata: Optional Icecast metadata (artist, title, genre, description)
        timeout: Optional timeout for the stream

    Returns:
        subprocess.Popen object for the ffmpeg process
    """
    stream_url = f"{STREAM_BASE_URL}/stream/live"
    url = f"http://source:{token}@{stream_url.split('://', 1)[1]}"

    title = metadata.get("title", "") if metadata else ""
    artist = metadata.get("artist", "") if metadata else ""
    genre = metadata.get("genre", "") if metadata else ""
    description = metadata.get("description", "") if metadata else ""

    ice_name = f"{artist} - {title}" if artist and title else ""
    headers = ""
    if ice_name:
        headers += f"ice-name: {ice_name}\r\n"
    if genre:
        headers += f"ice-genre: {genre}\r\n"
    if description:
        headers += f"ice-description: {description}\r\n"

    cmd = [
        "ffmpeg",
        "-re",
        "-f",
        "lavfi",
        "-i",
        f"sine=frequency=1000:sample_rate=48000:duration={duration}",
        "-t",
        str(duration),
        "-c:a",
        "libvorbis",
        "-b:a",
        "128k",
        "-f",
        "ogg",
        "-method",
        "PUT",
        "-auth_type",
        "basic",
        "-chunked_post",
        "1",
        "-send_expect_100",
        "0",
        "-content_type",
        "application/ogg",
    ]

    if headers:
        cmd.extend(["-headers", headers])

    cmd.extend([url, "-loglevel", "error", "-stats"])

    return subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


@pytest.fixture
def client() -> httpx.Client:
    """Create HTTP client for testing."""
    return httpx.Client(base_url=API_URL, timeout=30.0)


@pytest.fixture
def admin_headers() -> dict[str, str]:
    """Get admin authorization headers."""
    return {"Authorization": f"Bearer {ADMIN_TOKEN}"}


@pytest.fixture(autouse=True)
def cleanup_livestream_state():
    """Clean up livestream state in Redis between tests."""
    yield
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    keys = r.keys("livestream:*")
    if keys:
        r.delete(*keys)
    r.close()


# Track last recording test completion time across all test files
_last_recording_test_time = 0.0


@pytest.fixture
def delay_between_recording_tests() -> Generator[None, None, None]:
    """Add delay between recording tests to prevent recording worker backlog.

    When multiple livestream tests run back-to-back, the recording worker can get backlogged processing events
    sequentially. By the time it processes a test's event, the stream may have already ended. This fixture ensures
    adequate spacing.

    Use this fixture on tests that stream audio via stream_to_liquidsoap().
    """
    global _last_recording_test_time
    current_time = time.time()
    time_since_last = current_time - _last_recording_test_time

    # Add delay if less than 15 seconds have passed since last test
    if _last_recording_test_time > 0 and time_since_last < 15.0:
        delay = 15.0 - time_since_last
        time.sleep(delay)

    yield

    # Update last test time
    _last_recording_test_time = time.time()
