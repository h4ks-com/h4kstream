"""Tests for webhook event payload Pydantic schemas."""

import pytest

from app.models import LivestreamEndedEventData
from app.models import LivestreamStartedEventData
from app.models import QueueSwitchedEventData
from app.models import SongAddedEventData
from app.models import SongChangedEventData


class TestSongChangedEventData:
    """Test SongChangedEventData schema."""

    def test_valid_song_changed_data(self):
        """Test creating valid song_changed event data."""
        data = SongChangedEventData(
            playlist="fallback",
            title="Test Song",
            artist="Test Artist",
            genre="Rock",
        )
        assert data.playlist == "fallback"
        assert data.title == "Test Song"
        assert data.artist == "Test Artist"
        assert data.genre == "Rock"

    def test_song_changed_with_null_genre(self):
        """Test song_changed event data with null genre."""
        data = SongChangedEventData(
            playlist="user",
            title="Unknown Track",
            artist="Unknown Artist",
            genre=None,
        )
        assert data.genre is None

    def test_song_changed_serialization(self):
        """Test song_changed event data serialization."""
        data = SongChangedEventData(
            playlist="livestream",
            title="Live Stream",
            artist="DJ Name",
            genre="Electronic",
        )
        serialized = data.model_dump()
        assert serialized == {
            "playlist": "livestream",
            "title": "Live Stream",
            "artist": "DJ Name",
            "genre": "Electronic",
        }

    def test_song_changed_missing_required_field(self):
        """Test that missing required fields raise validation error."""
        with pytest.raises(Exception):  # Pydantic ValidationError
            SongChangedEventData(
                playlist="fallback",
                title="Test",
                # Missing artist
            )


class TestSongAddedEventData:
    """Test SongAddedEventData schema."""

    def test_valid_song_added_data(self):
        """Test creating valid song_added event data."""
        data = SongAddedEventData(
            song_id="u-123",
            playlist="user",
            title="New Song",
            artist="New Artist",
        )
        assert data.song_id == "u-123"
        assert data.playlist == "user"
        assert data.title == "New Song"
        assert data.artist == "New Artist"

    def test_song_added_with_null_metadata(self):
        """Test song_added event data with null metadata."""
        data = SongAddedEventData(
            song_id="f-456",
            playlist="fallback",
            title=None,
            artist=None,
        )
        assert data.title is None
        assert data.artist is None

    def test_song_added_serialization(self):
        """Test song_added event data serialization."""
        data = SongAddedEventData(
            song_id="f-789",
            playlist="fallback",
            title="Rick Roll",
            artist="Rick Astley",
        )
        serialized = data.model_dump()
        assert serialized == {
            "song_id": "f-789",
            "playlist": "fallback",
            "title": "Rick Roll",
            "artist": "Rick Astley",
        }


class TestLivestreamStartedEventData:
    """Test LivestreamStartedEventData schema."""

    def test_valid_livestream_started_data(self):
        """Test creating valid livestream_started event data."""
        data = LivestreamStartedEventData(
            user_id="abc123",
            show_name="My Show",
            min_recording_duration=60,
        )
        assert data.user_id == "abc123"
        assert data.show_name == "My Show"
        assert data.min_recording_duration == 60

    def test_livestream_started_serialization(self):
        """Test livestream_started event data serialization."""
        data = LivestreamStartedEventData(
            user_id="user123",
            show_name="Test Show",
            min_recording_duration=120,
        )
        serialized = data.model_dump()
        assert serialized == {
            "user_id": "user123",
            "show_name": "Test Show",
            "min_recording_duration": 120,
        }


class TestLivestreamEndedEventData:
    """Test LivestreamEndedEventData schema."""

    def test_valid_livestream_ended_data(self):
        """Test creating valid livestream_ended event data."""
        data = LivestreamEndedEventData(
            user_id="abc123",
            duration_seconds=3600,
            reason="disconnect",
        )
        assert data.user_id == "abc123"
        assert data.duration_seconds == 3600
        assert data.reason == "disconnect"

    def test_livestream_ended_time_limit_reason(self):
        """Test livestream_ended with time_limit reason."""
        data = LivestreamEndedEventData(
            user_id="user456",
            duration_seconds=7200,
            reason="time_limit",
        )
        assert data.reason == "time_limit"

    def test_livestream_ended_serialization(self):
        """Test livestream_ended event data serialization."""
        data = LivestreamEndedEventData(
            user_id="user789",
            duration_seconds=1800,
            reason="disconnect",
        )
        serialized = data.model_dump()
        assert serialized == {
            "user_id": "user789",
            "duration_seconds": 1800,
            "reason": "disconnect",
        }


class TestQueueSwitchedEventData:
    """Test QueueSwitchedEventData schema."""

    def test_valid_queue_switched_data(self):
        """Test creating valid queue_switched event data."""
        data = QueueSwitchedEventData(
            from_source="livestream",
            to_source="fallback",
        )
        assert data.from_source == "livestream"
        assert data.to_source == "fallback"

    def test_queue_switched_user_to_fallback(self):
        """Test queue switch from user to fallback."""
        data = QueueSwitchedEventData(
            from_source="user",
            to_source="fallback",
        )
        assert data.from_source == "user"
        assert data.to_source == "fallback"

    def test_queue_switched_serialization(self):
        """Test queue_switched event data serialization."""
        data = QueueSwitchedEventData(
            from_source="fallback",
            to_source="livestream",
        )
        serialized = data.model_dump()
        assert serialized == {
            "from_source": "fallback",
            "to_source": "livestream",
        }
