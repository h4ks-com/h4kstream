"""E2E tests for refactored API endpoints.

Tests the new unified admin endpoints with playlist parameters.
"""

from unittest.mock import AsyncMock
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture
def admin_token():
    """Get admin token from environment."""
    import os
    return os.getenv("ADMIN_API_TOKEN", "test-admin-token-12345")


@pytest.fixture
def mock_mpd():
    """Mock MPD operations for isolated testing."""
    with patch("app.services.queue_service.download_song") as mock_dl, \
         patch("app.services.playback_service.MPDClient") as mock_client:
        # Mock download
        from unittest.mock import MagicMock
        mock_dl.return_value = MagicMock(path="/tmp/test.mp3")

        # Mock MPD client
        instance = AsyncMock()
        instance.connect = AsyncMock()
        instance.disconnect = AsyncMock()
        instance.add_local_song = AsyncMock(return_value=42)
        instance.update_database = AsyncMock()
        instance.set_consume = AsyncMock()
        instance.set_repeat = AsyncMock()
        instance.set_random = AsyncMock()
        instance.play = AsyncMock()
        instance.pause = AsyncMock()
        instance.resume = AsyncMock()
        instance.get_queue = AsyncMock(return_value=[])
        instance.remove_song = AsyncMock()
        instance.clear_queue = AsyncMock()
        mock_client.return_value = instance

        yield instance


class TestAdminPlaybackEndpoints:
    """Test admin playback control endpoints."""

    def test_admin_play_default_user_queue(self, admin_token, mock_mpd):
        """Test /admin/playback/play defaults to user queue."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd):
            response = client.post(
                "/admin/playback/play",
                headers={"Authorization": f"Bearer {admin_token}"}
            )

        assert response.status_code == 200
        assert response.json() == {"status": "success"}
        mock_mpd.play.assert_called_once()

    def test_admin_play_radio_playlist(self, admin_token, mock_mpd):
        """Test /admin/playback/play with playlist=radio."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd):
            response = client.post(
                "/admin/playback/play?playlist=radio",
                headers={"Authorization": f"Bearer {admin_token}"}
            )

        assert response.status_code == 200
        mock_mpd.set_repeat.assert_called_once_with(True)
        mock_mpd.set_random.assert_called_once_with(True)
        mock_mpd.play.assert_called_once()

    def test_admin_pause(self, admin_token, mock_mpd):
        """Test /admin/playback/pause endpoint."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd):
            response = client.post(
                "/admin/playback/pause",
                headers={"Authorization": f"Bearer {admin_token}"}
            )

        assert response.status_code == 200
        mock_mpd.pause.assert_called_once()

    def test_admin_resume(self, admin_token, mock_mpd):
        """Test /admin/playback/resume endpoint."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd):
            response = client.post(
                "/admin/playback/resume",
                headers={"Authorization": f"Bearer {admin_token}"}
            )

        assert response.status_code == 200
        mock_mpd.resume.assert_called_once()

    def test_playback_unauthorized_without_token(self):
        """Test playback endpoints require authorization."""
        response = client.post("/admin/playback/play")
        # 401 Unauthorized or 403 Forbidden both indicate missing/invalid auth
        assert response.status_code in [401, 403]


class TestAdminQueueEndpoints:
    """Test admin queue management endpoints."""

    def test_admin_list_default_user_queue(self, admin_token, mock_mpd):
        """Test /admin/queue/list defaults to user queue."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd):
            response = client.get(
                "/admin/queue/list",
                headers={"Authorization": f"Bearer {admin_token}"}
            )

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_admin_list_radio_playlist(self, admin_token, mock_mpd):
        """Test /admin/queue/list with playlist=radio."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd):
            response = client.get(
                "/admin/queue/list?playlist=radio",
                headers={"Authorization": f"Bearer {admin_token}"}
            )

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_admin_clear_queue(self, admin_token, mock_mpd):
        """Test /admin/queue/clear endpoint."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd):
            response = client.post(
                "/admin/queue/clear?playlist=user",
                headers={"Authorization": f"Bearer {admin_token}"}
            )

        assert response.status_code == 200
        mock_mpd.clear_queue.assert_called_once()

    def test_admin_delete_song(self, admin_token, mock_mpd):
        """Test /admin/queue/{song_id} delete endpoint."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd):
            response = client.delete(
                "/admin/queue/42?playlist=user",
                headers={"Authorization": f"Bearer {admin_token}"}
            )

        assert response.status_code == 200
        mock_mpd.remove_song.assert_called_once_with(42)


class TestPublicEndpoints:
    """Test public queue endpoints (backward compatibility)."""

    def test_public_list_songs(self):
        """Test /queue/list endpoint (public, no auth)."""
        with patch("app.dependencies.dep_mpd_user") as mock_dep:
            mock_client = AsyncMock()
            mock_client.get_queue = AsyncMock(return_value=[])
            mock_dep.return_value = mock_client

            response = client.get("/queue/list")

        assert response.status_code == 200
        assert isinstance(response.json(), list)
