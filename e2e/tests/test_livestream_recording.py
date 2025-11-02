"""E2E tests for livestream recording functionality."""

import subprocess
import time
from collections.abc import Generator

import httpx
import pytest

from .conftest import ADMIN_TOKEN
from .conftest import API_URL
from .conftest import STREAM_BASE_URL

# Track last recording test completion time to add delay between tests
_last_recording_test_time = 0.0


@pytest.fixture(autouse=True)
def delay_between_recording_tests() -> Generator[None, None, None]:
    """Add 5-second delay between recording tests to let liquidsoap harbor reset.

    This prevents race conditions when multiple 10-second streams run back-to-back, where the harbor output (fallible
    source) might not be ready for the next stream.
    """
    global _last_recording_test_time
    current_time = time.time()
    time_since_last = current_time - _last_recording_test_time

    # Add delay if less than 5 seconds have passed since last test
    if _last_recording_test_time > 0 and time_since_last < 5.0:
        delay = 5.0 - time_since_last
        time.sleep(delay)

    yield

    # Update last test time
    _last_recording_test_time = time.time()


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
    # Use HTTP Basic Auth URL format: http://source:token@host/path
    stream_url = f"{STREAM_BASE_URL}/stream/live"
    url = f"http://source:{token}@{stream_url.split('://', 1)[1]}"

    # Build Icecast metadata headers
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


def cleanup_test_recordings(show_name_prefix: str) -> None:
    """Cleanup test recordings by show name prefix."""
    response = httpx.get(f"{API_URL}/recordings/list", params={"page_size": 100})
    if response.status_code != 200:
        return

    recordings_data = response.json()
    for show in recordings_data["shows"]:
        if show["show_name"].startswith(show_name_prefix):
            for recording in show["recordings"]:
                httpx.delete(
                    f"{API_URL}/admin/recordings/{recording['id']}",
                    headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                )


def test_livestream_recording_too_short_is_deleted() -> None:
    """Test that recordings shorter than minimum duration are deleted."""
    show_name = f"test_show_short_{int(time.time())}"

    response = httpx.post(
        f"{API_URL}/admin/livestream/token",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"max_streaming_seconds": 3600, "show_name": show_name, "min_recording_duration": 10},
    )
    assert response.status_code == 200
    token_data = response.json()
    token = token_data["token"]

    ffmpeg_process = stream_to_liquidsoap(token, duration=3)

    try:
        stdout, stderr = ffmpeg_process.communicate(timeout=10)
    except subprocess.TimeoutExpired:
        ffmpeg_process.kill()
        pytest.fail("FFmpeg timed out")

    time.sleep(3)

    response = httpx.get(f"{API_URL}/recordings/list?show_name={show_name}")
    assert response.status_code == 200
    recordings_data = response.json()

    assert recordings_data["total_recordings"] == 0, "Short recording should not be saved"
