"""E2E tests for livestream recording functionality."""

import os
import subprocess
import time

import httpx
import pytest

BASE_URL = os.getenv("API_URL", "http://localhost:8383")
ADMIN_TOKEN = os.getenv("ADMIN_API_TOKEN", "changeme")


def cleanup_test_recordings(show_name_prefix: str) -> None:
    """Cleanup test recordings by show name prefix."""
    response = httpx.get(f"{BASE_URL}/recordings/list", params={"page_size": 100})
    if response.status_code != 200:
        return

    recordings_data = response.json()
    for show in recordings_data["shows"]:
        if show["show_name"].startswith(show_name_prefix):
            for recording in show["recordings"]:
                httpx.delete(
                    f"{BASE_URL}/admin/recordings/{recording['id']}",
                    headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                )


def test_livestream_recording_with_5_second_minimum() -> None:
    """Test livestream recording with 5-second minimum duration."""
    show_name = f"test_show_{int(time.time())}"

    response = httpx.post(
        f"{BASE_URL}/admin/livestream/token",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"max_streaming_seconds": 3600, "show_name": show_name, "min_recording_duration": 5},
    )
    assert response.status_code == 200
    token_data = response.json()
    token = token_data["token"]

    assert token, "Token should be returned"

    ffmpeg_process = subprocess.Popen(
        [
            "ffmpeg",
            "-re",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=1000:sample_rate=48000:duration=10",
            "-t",
            "10",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "128k",
            "-f",
            "mp3",
            "-method",
            "PUT",
            "-auth_type",
            "basic",
            "-chunked_post",
            "1",
            "-send_expect_100",
            "0",
            "-content_type",
            "audio/mpeg",
            f"http://source:{token}@localhost/stream/live",
            "-loglevel",
            "error",
            "-stats",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        stdout, stderr = ffmpeg_process.communicate(timeout=20)
        assert ffmpeg_process.returncode == 0, f"FFmpeg failed: {stderr.decode()}"
    except subprocess.TimeoutExpired:
        ffmpeg_process.kill()
        pytest.fail("FFmpeg timed out")

    # Wait for recording worker to: stop recording, trim silence, save to DB
    time.sleep(6)

    response = httpx.get(f"{BASE_URL}/recordings/list?show_name={show_name}")
    assert response.status_code == 200
    recordings_data = response.json()

    assert recordings_data["total_recordings"] >= 1
    assert len(recordings_data["shows"]) >= 1

    found_show = None
    for show in recordings_data["shows"]:
        if show["show_name"] == show_name:
            found_show = show
            break

    assert found_show is not None, f"Show '{show_name}' should be in API response"
    assert len(found_show["recordings"]) >= 1

    recording = found_show["recordings"][0]
    assert recording["duration_seconds"] >= 5.0, f"Duration should be >= 5 seconds, got {recording['duration_seconds']}"
    recording_id = recording["id"]

    response = httpx.get(f"{BASE_URL}/recordings/stream/{recording_id}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/ogg"

    response = httpx.delete(
        f"{BASE_URL}/admin/recordings/{recording_id}", headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
    )
    assert response.status_code == 200

    response = httpx.get(f"{BASE_URL}/recordings/list?show_name={show_name}")
    assert response.status_code == 200
    recordings_data = response.json()
    assert recordings_data["total_recordings"] == 0, "Recording should be deleted"


def test_livestream_recording_too_short_is_deleted() -> None:
    """Test that recordings shorter than minimum duration are deleted."""
    show_name = f"test_show_short_{int(time.time())}"

    response = httpx.post(
        f"{BASE_URL}/admin/livestream/token",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"max_streaming_seconds": 3600, "show_name": show_name, "min_recording_duration": 10},
    )
    assert response.status_code == 200
    token_data = response.json()
    token = token_data["token"]

    ffmpeg_process = subprocess.Popen(
        [
            "ffmpeg",
            "-re",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=1000:sample_rate=48000:duration=3",
            "-t",
            "3",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "128k",
            "-f",
            "mp3",
            "-method",
            "PUT",
            "-auth_type",
            "basic",
            "-chunked_post",
            "1",
            "-send_expect_100",
            "0",
            "-content_type",
            "audio/mpeg",
            f"http://source:{token}@localhost/stream/live",
            "-loglevel",
            "error",
            "-stats",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        stdout, stderr = ffmpeg_process.communicate(timeout=10)
    except subprocess.TimeoutExpired:
        ffmpeg_process.kill()
        pytest.fail("FFmpeg timed out")

    time.sleep(3)

    response = httpx.get(f"{BASE_URL}/recordings/list?show_name={show_name}")
    assert response.status_code == 200
    recordings_data = response.json()

    assert recordings_data["total_recordings"] == 0, "Short recording should not be saved"


def test_recording_list_search_and_cleanup() -> None:
    """Test recording list, search, streaming, and cleanup functionality."""
    test_prefix = f"e2e_test_{int(time.time())}"
    show_name_1 = f"{test_prefix}_show_alpha"
    show_name_2 = f"{test_prefix}_show_beta"

    created_ids = []

    try:
        for show_name in [show_name_1, show_name_2]:
            response = httpx.post(
                f"{BASE_URL}/admin/livestream/token",
                headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                json={"max_streaming_seconds": 3600, "show_name": show_name, "min_recording_duration": 3},
            )
            assert response.status_code == 200
            token = response.json()["token"]

            ffmpeg_process = subprocess.Popen(
                [
                    "ffmpeg",
                    "-re",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=1000:sample_rate=48000:duration=5",
                    "-t",
                    "5",
                    "-c:a",
                    "libmp3lame",
                    "-b:a",
                    "128k",
                    "-f",
                    "mp3",
                    "-method",
            "PUT",
            "-auth_type",
            "basic",
            "-chunked_post",
            "1",
            "-send_expect_100",
            "0",
            "-content_type",
            "audio/mpeg",
            f"http://source:{token}@localhost/stream/live",
                    "-loglevel",
                    "error",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            ffmpeg_process.communicate(timeout=10)
            time.sleep(2)

        time.sleep(1)

        response = httpx.get(f"{BASE_URL}/recordings/list", params={"page": 1, "page_size": 50})
        assert response.status_code == 200
        all_recordings = response.json()
        assert all_recordings["total_recordings"] >= 2

        response = httpx.get(f"{BASE_URL}/recordings/list", params={"show_name": show_name_1})
        assert response.status_code == 200
        filtered = response.json()
        assert filtered["total_recordings"] == 1
        assert filtered["shows"][0]["show_name"] == show_name_1
        recording_1 = filtered["shows"][0]["recordings"][0]
        created_ids.append(recording_1["id"])

        response = httpx.get(f"{BASE_URL}/recordings/list", params={"show_name": show_name_2})
        assert response.status_code == 200
        filtered = response.json()
        assert filtered["total_recordings"] == 1
        recording_2 = filtered["shows"][0]["recordings"][0]
        created_ids.append(recording_2["id"])

        for recording_id in created_ids:
            response = httpx.get(f"{BASE_URL}/recordings/stream/{recording_id}")
            assert response.status_code == 200
            assert response.headers["content-type"] == "audio/ogg"
            assert len(response.content) > 0, "Audio file should not be empty"

    finally:
        for recording_id in created_ids:
            response = httpx.delete(
                f"{BASE_URL}/admin/recordings/{recording_id}",
                headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
            )
            assert response.status_code == 200

        response = httpx.get(f"{BASE_URL}/recordings/list", params={"show_name": show_name_1})
        assert response.status_code == 200
        assert response.json()["total_recordings"] == 0

        response = httpx.get(f"{BASE_URL}/recordings/list", params={"show_name": show_name_2})
        assert response.status_code == 200
        assert response.json()["total_recordings"] == 0


def test_recording_metadata_preservation() -> None:
    """Test that metadata embedded in stream is saved to recording."""
    show_name = f"test_metadata_{int(time.time())}"
    test_metadata = {
        "title": "My Test Stream",
        "artist": "Test Artist",
        "genre": "Electronic",
        "description": "A test livestream recording",
    }

    response = httpx.post(
        f"{BASE_URL}/admin/livestream/token",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"max_streaming_seconds": 3600, "show_name": show_name, "min_recording_duration": 3},
    )
    assert response.status_code == 200
    token = response.json()["token"]

    # Stream with embedded Icecast metadata (simulating OBS/Mixxx)
    # Liquidsoap will extract this and send to backend before triggering recording
    # ice-name should be in "Artist - Title" format for proper parsing
    ice_name = f"{test_metadata['artist']} - {test_metadata['title']}"

    # For HTTP PUT, we need to send Icecast headers via -headers option
    headers = (
        f"ice-name: {ice_name}\r\n"
        f"ice-genre: {test_metadata['genre']}\r\n"
        f"ice-description: {test_metadata['description']}\r\n"
    )

    ffmpeg_process = subprocess.Popen(
        [
            "ffmpeg",
            "-re",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=1000:sample_rate=48000:duration=5",
            "-t",
            "5",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "128k",
            "-f",
            "mp3",
            "-method",
            "PUT",
            "-auth_type",
            "basic",
            "-chunked_post",
            "1",
            "-send_expect_100",
            "0",
            "-content_type",
            "audio/mpeg",
            "-headers",
            headers,
            f"http://source:{token}@localhost/stream/live",
            "-loglevel",
            "error",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        ffmpeg_process.communicate(timeout=15)
    except subprocess.TimeoutExpired:
        ffmpeg_process.kill()
        pytest.fail("FFmpeg timed out")

    time.sleep(3)

    response = httpx.get(f"{BASE_URL}/recordings/list", params={"show_name": show_name})
    assert response.status_code == 200
    recordings_data = response.json()

    assert recordings_data["total_recordings"] == 1
    recording = recordings_data["shows"][0]["recordings"][0]

    assert recording["title"] == test_metadata["title"], f"Expected title '{test_metadata['title']}', got '{recording.get('title')}'"
    assert recording["artist"] == test_metadata["artist"], f"Expected artist '{test_metadata['artist']}', got '{recording.get('artist')}'"
    assert recording["genre"] == test_metadata["genre"], f"Expected genre '{test_metadata['genre']}', got '{recording.get('genre')}'"

    recording_id = recording["id"]

    # Cleanup - delete the test recording
    response = httpx.delete(
        f"{BASE_URL}/admin/recordings/{recording_id}",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
    )
    assert response.status_code == 200, f"Failed to delete recording: {response.status_code} - {response.text}"

    # Verify deletion worked
    response = httpx.get(f"{BASE_URL}/recordings/list", params={"show_name": show_name})
    assert response.status_code == 200
    recordings_data = response.json()
    assert recordings_data["total_recordings"] == 0, "Recording should be deleted"
