"""E2E tests for the public recording-edit clip render endpoint.

A clip is a multi-segment edit of a recording encoded entirely in the URL blob and rendered on the
fly (no caching). These tests create a real recording by streaming to liquidsoap, then render edits
of it and verify the output with ffprobe.
"""

import base64
import json
import subprocess
import tempfile
import time
from pathlib import Path

import httpx
import pytest

from .conftest import ADMIN_TOKEN
from .conftest import API_URL
from .conftest import stream_to_liquidsoap


def _encode_edit(recording_id: int, segments: list[list[float]]) -> str:
    """Encode an edit the same way the frontend/backend codec does (base64url of compact JSON)."""
    raw = json.dumps([1, recording_id, segments], separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _clip_url(blob: str) -> str:
    return f"{API_URL}/recordings/clip/{blob}.mp3"


def _probe_duration(content: bytes) -> float:
    with tempfile.NamedTemporaryFile(suffix=".mp3") as tmp:
        tmp.write(content)
        tmp.flush()
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(Path(tmp.name))],
            capture_output=True,
        )
    return float(probe.stdout.decode().strip())


def _create_recording(show_name: str, stream_seconds: int = 15) -> dict:
    """Stream to liquidsoap and return the resulting recording metadata."""
    response = httpx.post(
        f"{API_URL}/admin/livestream/token",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"max_streaming_seconds": 3600, "show_name": show_name, "min_recording_duration": 5},
    )
    assert response.status_code == 200
    token = response.json()["token"]

    proc = stream_to_liquidsoap(token, duration=stream_seconds)
    try:
        proc.communicate(timeout=stream_seconds + 10)
    except subprocess.TimeoutExpired:
        proc.kill()
        pytest.fail("ffmpeg stream timed out")

    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        listing = httpx.get(f"{API_URL}/recordings/list", params={"show_name": show_name})
        if listing.status_code == 200 and listing.json()["total_recordings"] > 0:
            return listing.json()["shows"][0]["recordings"][0]
        time.sleep(2)
    pytest.fail("recording was not created in time")


def test_clip_render_returns_mp3(delay_between_recording_tests) -> None:
    """A valid multi-segment edit renders to an MP3 whose duration matches the window."""
    show_name = f"test_clip_{int(time.time())}"
    recording = _create_recording(show_name)
    try:
        # Two 4s segments with a 1.0s crossfade -> ~7s of audio.
        blob = _encode_edit(recording["id"], [[0, 0, 4, 1, 0, 0, 0], [0, 2, 6, 1.0, 0, 0, 1.0]])
        response = httpx.get(_clip_url(blob), timeout=60)
        assert response.status_code == 200
        assert response.headers["content-type"] == "audio/mpeg"
        assert len(response.content) > 0
        assert 5.0 <= _probe_duration(response.content) <= 9.0
    finally:
        httpx.delete(
            f"{API_URL}/admin/recordings/{recording['id']}",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        )


def test_clip_rejects_malformed_blob() -> None:
    """A blob that does not decode to a valid edit returns 400."""
    response = httpx.get(_clip_url("zzzz"))
    assert response.status_code == 400


def test_clip_unknown_recording_returns_404() -> None:
    """A well-formed edit referencing a missing recording returns 404."""
    blob = _encode_edit(999999, [[0, 0, 1.0, 1, 0, 0, 0]])
    response = httpx.get(_clip_url(blob))
    assert response.status_code == 404
