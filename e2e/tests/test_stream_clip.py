"""E2E tests for the public live-stream clip endpoint.

The clip buffer continuously pulls the live radio mix, so it needs a few seconds of audio before it can serve a clip.
These tests retry briefly to let the buffer warm up.
"""

import subprocess
import tempfile
import time
from pathlib import Path

import httpx

from tests.api_endpoints import PUBLIC_CLIP


def _fetch_clip(client: httpx.Client, start_offset: float, end_offset: float) -> httpx.Response:
    """Request a clip, retrying while the buffer warms up (503)."""
    deadline = time.monotonic() + 40
    response = client.get(PUBLIC_CLIP, params={"start_offset": start_offset, "end_offset": end_offset})
    while response.status_code == 503 and time.monotonic() < deadline:
        time.sleep(2)
        response = client.get(PUBLIC_CLIP, params={"start_offset": start_offset, "end_offset": end_offset})
    return response


def _probe_duration(content: bytes) -> float:
    """Return the duration in seconds of an MP3 payload via ffprobe."""
    with tempfile.NamedTemporaryFile(suffix=".mp3") as tmp:
        tmp.write(content)
        tmp.flush()
        probe = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(Path(tmp.name)),
            ],
            capture_output=True,
        )
    return float(probe.stdout.decode().strip())


def test_clip_returns_mp3(client: httpx.Client) -> None:
    """A valid window returns a non-empty MP3 audio body."""
    response = _fetch_clip(client, start_offset=20, end_offset=2)
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert len(response.content) > 0


def test_clip_duration_matches_window(client: httpx.Client) -> None:
    """The returned clip duration approximates the requested 18s window once buffered.

    While the buffer is still filling, the clip is clamped to whatever is available, so this polls until the buffer
    holds enough audio to satisfy the full window.
    """
    deadline = time.monotonic() + 40
    duration = 0.0
    while time.monotonic() < deadline:
        response = _fetch_clip(client, start_offset=20, end_offset=2)
        assert response.status_code == 200
        duration = _probe_duration(response.content)
        if duration >= 14:
            break
        time.sleep(2)

    # Requested 18s window; clip never exceeds it, and reaches it once the buffer is warm.
    assert 14 <= duration <= 22


def test_clip_rejects_inverted_window(client: httpx.Client) -> None:
    """start_offset must be greater than end_offset."""
    response = client.get(PUBLIC_CLIP, params={"start_offset": 10, "end_offset": 20})
    assert response.status_code == 400


def test_clip_rejects_zero_start(client: httpx.Client) -> None:
    """start_offset must be positive (query validation)."""
    response = client.get(PUBLIC_CLIP, params={"start_offset": 0, "end_offset": 0})
    assert response.status_code == 422


def test_clip_clamps_to_available(client: httpx.Client) -> None:
    """Requesting the full window returns whatever is buffered without erroring."""
    response = _fetch_clip(client, start_offset=300, end_offset=5)
    assert response.status_code == 200
    assert len(response.content) > 0
