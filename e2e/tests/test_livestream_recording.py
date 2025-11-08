"""E2E tests for livestream recording functionality."""

import subprocess
import time

import httpx
import pytest

from .conftest import ADMIN_TOKEN
from .conftest import API_URL
from .conftest import stream_to_liquidsoap


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


def test_livestream_recording_too_short_is_deleted(delay_between_recording_tests) -> None:
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
