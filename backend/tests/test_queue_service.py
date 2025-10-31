"""Unit tests for queue service.

Tests the unified queue operations for both user queue and radio playlist.
"""

from unittest.mock import AsyncMock
from unittest.mock import MagicMock
from unittest.mock import mock_open
from unittest.mock import patch

import pytest

from app.models import SongItem
from app.services import queue_service


@pytest.fixture
def mock_mpd_client():
    """Mock MPD client."""
    client = AsyncMock()
    client.update_database = AsyncMock()
    client.add_local_song = AsyncMock(return_value=42)  # Mock song ID
    client.set_consume = AsyncMock()
    client.set_repeat = AsyncMock()
    client.set_random = AsyncMock()
    client.play = AsyncMock()
    client.remove_song = AsyncMock()
    client.get_queue = AsyncMock(return_value=[
        {"id": "1", "file": "song1.mp3", "title": "Song 1", "artist": None, "album": None, "time": "180", "pos": "0"},
        {"id": "2", "file": "song2.mp3", "title": "Song 2", "artist": None, "album": None, "time": "240", "pos": "1"},
    ])
    client.clear_queue = AsyncMock()
    return client


@pytest.fixture
def mock_redis_client():
    """Mock Redis client."""
    client = AsyncMock()
    client.add_user_song = AsyncMock()
    client.map_song_to_user = AsyncMock()
    client.increment_user_add_count = AsyncMock()
    client.remove_user_song = AsyncMock()
    return client


class TestAddSong:
    """Test add_song functionality."""

    async def test_add_song_user_queue_with_url(self, mock_mpd_client, mock_redis_client):
        """Test adding song to user queue via URL."""
        with patch("app.services.queue_service.download_song") as mock_download, \
             patch("app.services.queue_service.shutil.move"):
            mock_download.return_value = MagicMock(path="/tmp/downloaded.mp3")

            await queue_service.add_song(
                playlist="user",
                mpd_client=mock_mpd_client,
                url="https://youtube.com/watch?v=test",
                redis_client=mock_redis_client,
                user_id="test_user",
                skip_validation=True,
            )

            mock_download.assert_called_once_with("https://youtube.com/watch?v=test")
            mock_mpd_client.update_database.assert_called_once()
            mock_mpd_client.add_local_song.assert_called_once()
            mock_mpd_client.set_consume.assert_called_once_with(True)
            mock_mpd_client.play.assert_called_once()

            # Verify Redis tracking
            mock_redis_client.add_user_song.assert_called_once()
            mock_redis_client.map_song_to_user.assert_called_once()
            mock_redis_client.increment_user_add_count.assert_called_once()

    async def test_add_song_radio_playlist(self, mock_mpd_client):
        """Test adding song to radio playlist (no Redis tracking)."""
        with patch("app.services.queue_service.download_song") as mock_download, \
             patch("app.services.queue_service.shutil.move"):
            mock_download.return_value = MagicMock(path="/tmp/downloaded.mp3")

            await queue_service.add_song(
                playlist="radio",
                mpd_client=mock_mpd_client,
                url="https://youtube.com/watch?v=test",
                skip_validation=True,
            )

            mock_mpd_client.set_consume.assert_not_called()
            mock_mpd_client.set_repeat.assert_called_once_with(True)
            mock_mpd_client.set_random.assert_called_once_with(True)
            mock_mpd_client.play.assert_called_once()

    async def test_add_song_with_file(self, mock_mpd_client):
        """Test adding song via file upload."""
        mock_file = MagicMock()
        mock_file.filename = "test_song.mp3"
        mock_file.read = AsyncMock(return_value=b"fake audio data")

        with patch("builtins.open", mock_open()), \
             patch("app.services.queue_service.shutil.move"):
            await queue_service.add_song(
                playlist="user",
                mpd_client=mock_mpd_client,
                file=mock_file,
                skip_validation=True,
            )

            mock_mpd_client.add_local_song.assert_called_once()
            mock_mpd_client.play.assert_called_once()

    async def test_add_song_both_url_and_file_raises_error(self, mock_mpd_client):
        """Test that providing both URL and file raises ValueError."""
        with pytest.raises(ValueError, match="Cannot provide both URL and file"):
            await queue_service.add_song(
                playlist="user",
                mpd_client=mock_mpd_client,
                url="https://test.com",
                file=MagicMock(),
            )

    async def test_add_song_neither_url_nor_file_raises_error(self, mock_mpd_client):
        """Test that providing neither URL nor file raises ValueError."""
        with pytest.raises(ValueError, match="No valid URL or file provided"):
            await queue_service.add_song(
                playlist="user",
                mpd_client=mock_mpd_client,
            )


class TestUploadValidation:
    """Test upload validation for duration, file size, and duplicates."""

    async def test_file_size_validation_rejects_large_file(self):
        """Test that files exceeding size limit are rejected."""
        mock_file = MagicMock()
        mock_file.read = AsyncMock(return_value=b"x" * (51 * 1024 * 1024))  # 51MB
        mock_file.seek = AsyncMock()

        with pytest.raises(ValueError, match="File size.*exceeds maximum"):
            await queue_service.validate_file_size(mock_file, max_size_mb=50)

    async def test_file_size_validation_accepts_valid_file(self):
        """Test that files within size limit are accepted."""
        mock_file = MagicMock()
        mock_file.read = AsyncMock(return_value=b"x" * (10 * 1024 * 1024))  # 10MB
        mock_file.seek = AsyncMock()

        await queue_service.validate_file_size(mock_file, max_size_mb=50)
        mock_file.seek.assert_called_once_with(0)

    async def test_duration_validation_rejects_long_song(self):
        """Test that songs exceeding duration limit are rejected."""
        with patch("app.services.queue_service.get_duration") as mock_duration:
            mock_duration.return_value = 2000  # 33 minutes

            with pytest.raises(ValueError, match="Song duration.*exceeds maximum"):
                await queue_service.validate_song_duration("/tmp/test.mp3", max_duration_seconds=1800)

    async def test_duration_validation_accepts_valid_song(self):
        """Test that songs within duration limit are accepted."""
        with patch("app.services.queue_service.get_duration") as mock_duration:
            mock_duration.return_value = 300  # 5 minutes

            await queue_service.validate_song_duration("/tmp/test.mp3", max_duration_seconds=1800)

    async def test_duplicate_detection_finds_duplicate(self):
        """Test that duplicate songs are detected in queue."""
        mock_user_mpd = AsyncMock()
        mock_fallback_mpd = AsyncMock()

        mock_user_mpd.get_queue = AsyncMock(return_value=[
            {"id": "1", "file": "song1.mp3", "title": "Test Song", "artist": "Test Artist", "album": None, "time": "180", "pos": "0"},
        ])
        mock_fallback_mpd.get_queue = AsyncMock(return_value=[])

        is_duplicate = await queue_service.check_duplicate_in_queue(
            "Test Song", "Test Artist", mock_user_mpd, mock_fallback_mpd, check_limit=5
        )

        assert is_duplicate is True

    async def test_duplicate_detection_case_insensitive(self):
        """Test that duplicate detection is case-insensitive."""
        mock_user_mpd = AsyncMock()
        mock_fallback_mpd = AsyncMock()

        mock_user_mpd.get_queue = AsyncMock(return_value=[
            {"id": "1", "file": "song1.mp3", "title": "Test Song", "artist": "Test Artist", "album": None, "time": "180", "pos": "0"},
        ])
        mock_fallback_mpd.get_queue = AsyncMock(return_value=[])

        is_duplicate = await queue_service.check_duplicate_in_queue(
            "TEST SONG", "TEST ARTIST", mock_user_mpd, mock_fallback_mpd, check_limit=5
        )

        assert is_duplicate is True

    async def test_duplicate_detection_no_duplicate(self):
        """Test that non-duplicate songs are allowed."""
        mock_user_mpd = AsyncMock()
        mock_fallback_mpd = AsyncMock()

        mock_user_mpd.get_queue = AsyncMock(return_value=[
            {"id": "1", "file": "song1.mp3", "title": "Different Song", "artist": "Different Artist", "album": None, "time": "180", "pos": "0"},
        ])
        mock_fallback_mpd.get_queue = AsyncMock(return_value=[])

        is_duplicate = await queue_service.check_duplicate_in_queue(
            "Test Song", "Test Artist", mock_user_mpd, mock_fallback_mpd, check_limit=5
        )

        assert is_duplicate is False

    async def test_add_song_with_validation_rejects_long_duration(self, mock_mpd_client, mock_redis_client):
        """Test that user upload with >30 min duration is rejected."""
        mock_file = MagicMock()
        mock_file.filename = "long_song.mp3"
        mock_file.read = AsyncMock(return_value=b"fake audio data")
        mock_file.seek = AsyncMock()

        mock_user_mpd = AsyncMock()
        mock_fallback_mpd = AsyncMock()

        with patch("builtins.open", mock_open()), \
             patch("app.services.queue_service.get_duration") as mock_duration, \
             patch("app.services.queue_service.shutil.move"):
            mock_duration.return_value = 2000  # 33 minutes

            with pytest.raises(ValueError, match="Song duration.*exceeds maximum"):
                await queue_service.add_song(
                    playlist="user",
                    mpd_client=mock_mpd_client,
                    file=mock_file,
                    redis_client=mock_redis_client,
                    user_id="test_user",
                    skip_validation=False,
                    user_mpd_client=mock_user_mpd,
                    fallback_mpd_client=mock_fallback_mpd,
                )

    async def test_add_song_admin_skips_validation(self, mock_mpd_client):
        """Test that admin upload with skip_validation=True bypasses all checks."""
        mock_file = MagicMock()
        mock_file.filename = "long_song.mp3"
        mock_file.read = AsyncMock(return_value=b"x" * (100 * 1024 * 1024))  # 100MB
        mock_file.seek = AsyncMock()

        with patch("builtins.open", mock_open()), \
             patch("app.services.queue_service.get_duration") as mock_duration, \
             patch("app.services.queue_service.shutil.move"):
            mock_duration.return_value = 5000  # Very long duration

            await queue_service.add_song(
                playlist="user",
                mpd_client=mock_mpd_client,
                file=mock_file,
                skip_validation=True,
            )

            mock_mpd_client.add_local_song.assert_called_once()


class TestDeleteSong:
    """Test delete_song functionality."""

    async def test_delete_song_user_queue_with_redis(self, mock_mpd_client, mock_redis_client):
        """Test deleting song from user queue with Redis tracking."""
        await queue_service.delete_song(
            song_id=42,
            playlist="user",
            mpd_client=mock_mpd_client,
            redis_client=mock_redis_client,
            user_id="test_user",
        )

        mock_mpd_client.remove_song.assert_called_once_with(42)
        mock_redis_client.remove_user_song.assert_called_once_with("test_user", "42")

    async def test_delete_song_radio_playlist_no_redis(self, mock_mpd_client):
        """Test deleting song from radio playlist (no Redis tracking)."""
        await queue_service.delete_song(
            song_id=42,
            playlist="radio",
            mpd_client=mock_mpd_client,
        )

        mock_mpd_client.remove_song.assert_called_once_with(42)


class TestListSongs:
    """Test list_songs functionality."""

    async def test_list_songs(self, mock_mpd_client):
        """Test listing songs from queue."""
        songs = await queue_service.list_songs(mock_mpd_client)

        assert len(songs) == 2
        assert isinstance(songs[0], SongItem)
        assert songs[0].file == "song1.mp3"
        assert songs[1].file == "song2.mp3"


class TestClearQueue:
    """Test clear_queue functionality."""

    async def test_clear_queue(self, mock_mpd_client):
        """Test clearing queue."""
        await queue_service.clear_queue(mock_mpd_client, "user")

        mock_mpd_client.clear_queue.assert_called_once()
