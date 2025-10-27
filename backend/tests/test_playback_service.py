"""Unit tests for playback service.

Tests unified playback control for both user queue and radio playlist.
"""

from unittest.mock import AsyncMock
from unittest.mock import patch

import pytest

from app.services import playback_service


@pytest.fixture
def mock_mpd_client():
    """Mock MPD client."""
    client = AsyncMock()
    client.connect = AsyncMock()
    client.disconnect = AsyncMock()
    client.play = AsyncMock()
    client.pause = AsyncMock()
    client.resume = AsyncMock()
    client.set_repeat = AsyncMock()
    client.set_random = AsyncMock()
    return client


class TestPlaybackControl:
    """Test playback control operations."""

    async def test_play_user_queue(self, mock_mpd_client):
        """Test playing user queue (no repeat/random)."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd_client):
            await playback_service.control_playback("play", "user")

            mock_mpd_client.connect.assert_called_once()
            mock_mpd_client.play.assert_called_once()
            mock_mpd_client.set_repeat.assert_not_called()
            mock_mpd_client.set_random.assert_not_called()
            mock_mpd_client.disconnect.assert_called_once()

    async def test_play_radio_playlist(self, mock_mpd_client):
        """Test playing radio playlist (enables repeat/random)."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd_client):
            await playback_service.control_playback("play", "radio")

            mock_mpd_client.connect.assert_called_once()
            mock_mpd_client.set_repeat.assert_called_once_with(True)
            mock_mpd_client.set_random.assert_called_once_with(True)
            mock_mpd_client.play.assert_called_once()
            mock_mpd_client.disconnect.assert_called_once()

    async def test_pause_playlist(self, mock_mpd_client):
        """Test pausing playlist."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd_client):
            await playback_service.control_playback("pause", "user")

            mock_mpd_client.connect.assert_called_once()
            mock_mpd_client.pause.assert_called_once()
            mock_mpd_client.disconnect.assert_called_once()

    async def test_resume_playlist(self, mock_mpd_client):
        """Test resuming playlist."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd_client):
            await playback_service.control_playback("resume", "user")

            mock_mpd_client.connect.assert_called_once()
            mock_mpd_client.resume.assert_called_once()
            mock_mpd_client.disconnect.assert_called_once()

    async def test_disconnect_called_on_exception(self, mock_mpd_client):
        """Test that disconnect is always called even on exception."""
        mock_mpd_client.play.side_effect = Exception("MPD error")

        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd_client):
            with pytest.raises(Exception, match="MPD error"):
                await playback_service.control_playback("play", "user")

            # Disconnect should still be called
            mock_mpd_client.disconnect.assert_called_once()


class TestGetMPDClient:
    """Test MPD client factory."""

    def test_get_user_client(self):
        """Test getting user queue MPD client."""
        from app.settings import settings
        client = playback_service.get_mpd_client("user")
        assert client.host == settings.MPD_USER_HOST
        assert client.port == settings.MPD_USER_PORT

    def test_get_radio_client(self):
        """Test getting radio playlist MPD client."""
        from app.settings import settings
        client = playback_service.get_mpd_client("radio")
        # Should use fallback host/port
        assert client.host == settings.MPD_FALLBACK_HOST
        assert client.port == settings.MPD_FALLBACK_PORT
