"""Tests for the recording stream endpoint including segment slicing.

Coverage strategy:
- Unit-level: mock DB + real ffmpeg subprocess (fast, tests slicing logic)
- Integration-level: real in-memory SQLite DB + real ffmpeg (exercises full request path)
- Duration verification: ffprobe on response bytes confirms the segment is actually
  the requested duration, not just smaller in bytes
"""

import subprocess
import tempfile
from pathlib import Path
from unittest.mock import MagicMock
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session
from sqlmodel import SQLModel
from sqlmodel import create_engine

from app.db import get_session
from app.db.models import LivestreamRecording
from app.db.models import Show
from app.main import app

client = TestClient(app)


def _make_test_mp3(path: Path, duration_seconds: int = 10) -> None:
    subprocess.run(
        [
            "ffmpeg", "-loglevel", "error",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            "-t", str(duration_seconds),
            "-c:a", "libmp3lame", "-b:a", "128k",
            str(path), "-y",
        ],
        check=True,
    )


def _ffprobe_duration(data: bytes) -> float:
    """Return duration (seconds) of raw audio bytes via ffprobe."""
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        f.write(data)
        tmp = Path(f.name)
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(tmp),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        return float(result.stdout.strip())
    finally:
        tmp.unlink(missing_ok=True)


@pytest.fixture(scope="module")
def recording_file(tmp_path_factory):
    """Create a single 10-second silent MP3 reused across the module."""
    mp3 = tmp_path_factory.mktemp("recordings") / "test_recording.mp3"
    _make_test_mp3(mp3, duration_seconds=10)
    return mp3


# ---------------------------------------------------------------------------
# Fixtures: unit-level (mock DB, real ffmpeg)
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_recording(recording_file):
    rec = MagicMock()
    rec.id = 1
    rec.file_path = recording_file.name
    return rec


@pytest.fixture
def patched_client(recording_file, mock_recording):
    """Client with DB and settings mocked, pointing at the real MP3 file."""
    with (
        patch("app.routes.recordings.recordings_db.get_recording", return_value=mock_recording),
        patch("app.routes.recordings.settings") as mock_settings,
    ):
        mock_settings.RECORDINGS_PATH = str(recording_file.parent)
        yield client


# ---------------------------------------------------------------------------
# Fixtures: integration-level (real SQLite in-memory DB)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def db_engine():
    # StaticPool reuses one connection so in-memory data persists across sessions
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture(scope="module")
def db_recording(db_engine, recording_file):
    """Insert a real Show + LivestreamRecording into the in-memory DB."""
    with Session(db_engine) as session:
        show = Show(show_name="Test Show")
        session.add(show)
        session.commit()
        session.refresh(show)

        recording = LivestreamRecording(
            show_id=show.id,
            title="Test Recording",
            duration_seconds=10.0,
            file_path=recording_file.name,
        )
        session.add(recording)
        session.commit()
        session.refresh(recording)
        return recording.id


@pytest.fixture
def integration_client(db_engine, recording_file):
    """Client using a real in-memory SQLite DB and the real file path."""
    def override_session():
        with Session(db_engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session

    with patch("app.routes.recordings.settings") as mock_settings:
        mock_settings.RECORDINGS_PATH = str(recording_file.parent)
        yield client

    app.dependency_overrides.pop(get_session, None)


# ---------------------------------------------------------------------------
# Unit tests (mocked DB)
# ---------------------------------------------------------------------------

class TestStreamRecordingUnit:
    def test_full_stream_200(self, patched_client):
        assert patched_client.get("/recordings/stream/1").status_code == 200

    def test_missing_db_entry_404(self):
        with patch("app.routes.recordings.recordings_db.get_recording", return_value=None):
            assert client.get("/recordings/stream/999").status_code == 404

    def test_missing_file_404(self, mock_recording):
        with (
            patch("app.routes.recordings.recordings_db.get_recording", return_value=mock_recording),
            patch("app.routes.recordings.settings") as s,
        ):
            s.RECORDINGS_PATH = "/nonexistent"
            assert client.get("/recordings/stream/1").status_code == 404

    def test_end_before_start_400(self, patched_client):
        assert patched_client.get("/recordings/stream/1?start=8&end=3").status_code == 400

    def test_end_equal_start_400(self, patched_client):
        assert patched_client.get("/recordings/stream/1?start=5&end=5").status_code == 400

    def test_segment_content_type(self, patched_client):
        r = patched_client.get("/recordings/stream/1?start=1&end=4")
        assert r.status_code == 200
        assert r.headers["content-type"] == "audio/mpeg"

    def test_segment_content_disposition(self, patched_client):
        r = patched_client.get("/recordings/stream/1?start=2&end=5")
        assert "segment" in r.headers.get("content-disposition", "")

    def test_start_only_returns_audio(self, patched_client):
        r = patched_client.get("/recordings/stream/1?start=5")
        assert r.status_code == 200
        assert len(r.content) > 0

    def test_end_only_returns_audio(self, patched_client):
        r = patched_client.get("/recordings/stream/1?end=3")
        assert r.status_code == 200
        assert len(r.content) > 0


# ---------------------------------------------------------------------------
# Duration verification (ffprobe on actual response bytes)
# ---------------------------------------------------------------------------

class TestSegmentDuration:
    """Verify the returned audio is actually the requested duration."""

    def test_3s_segment_duration(self, patched_client):
        r = patched_client.get("/recordings/stream/1?start=1&end=4")
        assert r.status_code == 200
        duration = _ffprobe_duration(r.content)
        assert abs(duration - 3.0) < 0.5, f"Expected ~3s, got {duration:.2f}s"

    def test_5s_segment_duration(self, patched_client):
        r = patched_client.get("/recordings/stream/1?start=2&end=7")
        assert r.status_code == 200
        duration = _ffprobe_duration(r.content)
        assert abs(duration - 5.0) < 0.5, f"Expected ~5s, got {duration:.2f}s"

    def test_end_only_segment_duration(self, patched_client):
        r = patched_client.get("/recordings/stream/1?end=3")
        assert r.status_code == 200
        duration = _ffprobe_duration(r.content)
        assert abs(duration - 3.0) < 0.5, f"Expected ~3s, got {duration:.2f}s"

    def test_segment_shorter_than_full(self, patched_client):
        full = patched_client.get("/recordings/stream/1")
        segment = patched_client.get("/recordings/stream/1?start=0&end=3")
        assert len(segment.content) < len(full.content)


# ---------------------------------------------------------------------------
# Integration tests (real SQLite DB, full request path)
# ---------------------------------------------------------------------------

class TestStreamRecordingIntegration:
    def test_full_stream_via_real_db(self, integration_client, db_recording):
        r = integration_client.get(f"/recordings/stream/{db_recording}")
        assert r.status_code == 200
        assert len(r.content) > 0

    def test_segment_via_real_db(self, integration_client, db_recording):
        r = integration_client.get(f"/recordings/stream/{db_recording}?start=1&end=4")
        assert r.status_code == 200
        duration = _ffprobe_duration(r.content)
        assert abs(duration - 3.0) < 0.5, f"Expected ~3s, got {duration:.2f}s"

    def test_missing_id_via_real_db(self, integration_client):
        r = integration_client.get("/recordings/stream/99999")
        assert r.status_code == 404
