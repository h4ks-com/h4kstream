"""E2E tests for refactored API endpoints.

Tests the new unified admin endpoints with playlist parameters.
"""

import os
from unittest.mock import AsyncMock
from unittest.mock import MagicMock
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.dependencies import dep_mpd_fallback
from app.dependencies import dep_mpd_user
from app.dependencies import dep_redis_client
from app.main import app
from app.services.jwt_service import generate_token
from app.services.navidrome_service import NavidromePlaylist
from app.services.navidrome_service import NavidromeSong

client = TestClient(app)


@pytest.fixture
def user_jwt_headers():
    """JWT auth headers for a regular user."""
    token = generate_token(duration_seconds=3600, max_queue_songs=5, max_add_requests=20)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def user_jwt_token():
    """JWT token for a regular user (raw string)."""
    return generate_token(duration_seconds=3600, max_queue_songs=5, max_add_requests=20)


@pytest.fixture
def admin_token():
    """Get admin token from environment."""
    return os.getenv("ADMIN_API_TOKEN", "test-admin-token-12345")


@pytest.fixture
def mock_mpd():
    """Mock MPD operations for isolated testing."""
    with patch("app.services.queue_service.download_song") as mock_dl, patch(
        "app.services.playback_service.MPDClient"
    ) as mock_client:
        # Mock download

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
            response = client.post("/admin/playback/play", headers={"Authorization": f"Bearer {admin_token}"})

        assert response.status_code == 200
        assert response.json() == {"status": "success"}
        mock_mpd.play.assert_called_once()

    def test_admin_play_fallback_playlist(self, admin_token, mock_mpd):
        """Test /admin/playback/play with playlist=fallback."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd):
            response = client.post(
                "/admin/playback/play?playlist=fallback", headers={"Authorization": f"Bearer {admin_token}"}
            )

        assert response.status_code == 200
        assert response.json() == {"status": "success"}
        mock_mpd.play.assert_called_once()

    def test_admin_pause(self, admin_token, mock_mpd):
        """Test /admin/playback/pause endpoint."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd):
            response = client.post("/admin/playback/pause", headers={"Authorization": f"Bearer {admin_token}"})

        assert response.status_code == 200
        mock_mpd.pause.assert_called_once()

    def test_admin_resume(self, admin_token, mock_mpd):
        """Test /admin/playback/resume endpoint."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd):
            response = client.post("/admin/playback/resume", headers={"Authorization": f"Bearer {admin_token}"})

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
            response = client.get("/admin/queue/list", headers={"Authorization": f"Bearer {admin_token}"})

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_admin_list_fallback_playlist(self, admin_token, mock_mpd):
        """Test /admin/queue/list with playlist=fallback."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd):
            response = client.get(
                "/admin/queue/list?playlist=fallback", headers={"Authorization": f"Bearer {admin_token}"}
            )

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_admin_clear_queue(self, admin_token, mock_mpd):
        """Test /admin/queue/clear endpoint."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd):
            response = client.post(
                "/admin/queue/clear?playlist=user", headers={"Authorization": f"Bearer {admin_token}"}
            )

        assert response.status_code == 200
        mock_mpd.clear_queue.assert_called_once()

    def test_admin_delete_song(self, admin_token, mock_mpd):
        """Test /admin/queue/{song_id} delete endpoint."""
        with patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd):
            response = client.delete(
                "/admin/queue/u-42?playlist=user", headers={"Authorization": f"Bearer {admin_token}"}
            )

        assert response.status_code == 200
        mock_mpd.remove_song.assert_called_once_with(42)


class TestPublicEndpoints:
    """Test public queue endpoints (backward compatibility)."""

    def test_public_list_songs(self, mock_mpd):
        """Test /queue/list endpoint (public, no auth)."""
        # Mock get_next_songs to return empty list
        with patch("app.services.queue_service.get_next_songs", return_value=[]), \
             patch("app.services.playback_service.get_mpd_client", return_value=mock_mpd):
            response = client.get("/queue/list")

            assert response.status_code == 200
            assert isinstance(response.json(), list)


class TestNavidromeEndpoints:
    """Tests for Navidrome playlist integration endpoints."""

    @pytest.fixture(autouse=True)
    def mock_mpd_dep(self):
        """Override dep_mpd_user and dep_mpd_fallback so tests don't require a real MPD connection."""
        mock_client = AsyncMock()
        mock_client.update_database = AsyncMock()
        mock_client.add_local_song = AsyncMock(return_value=42)
        mock_client.set_consume = AsyncMock()
        mock_client.set_repeat = AsyncMock()
        mock_client.set_random = AsyncMock()
        mock_client.play = AsyncMock()
        mock_client.get_queue = AsyncMock(return_value=[])
        mock_client.connect = AsyncMock()
        mock_client.disconnect = AsyncMock()

        mock_fallback = AsyncMock()
        mock_fallback.get_queue = AsyncMock(return_value=[])
        mock_fallback.connect = AsyncMock()
        mock_fallback.disconnect = AsyncMock()

        async def override_user():
            yield mock_client

        async def override_fallback():
            yield mock_fallback

        app.dependency_overrides[dep_mpd_user] = override_user
        app.dependency_overrides[dep_mpd_fallback] = override_fallback
        yield mock_client
        app.dependency_overrides.pop(dep_mpd_user, None)
        app.dependency_overrides.pop(dep_mpd_fallback, None)

    @pytest.fixture
    def mock_redis_dep(self):
        """Override dep_redis_client with a controllable mock."""
        mock_svc = AsyncMock()
        mock_svc.get_user_song_count = AsyncMock(return_value=0)
        mock_svc.get_user_add_count = AsyncMock(return_value=0)
        mock_svc.add_user_song = AsyncMock()
        mock_svc.map_song_to_user = AsyncMock()
        mock_svc.increment_user_add_count = AsyncMock()
        mock_svc.is_livestream_active = AsyncMock(return_value=False)
        mock_svc.set_song_cache_id = AsyncMock()
        mock_svc.set_song_metadata = AsyncMock()
        mock_svc.set_metadata = AsyncMock()

        app.dependency_overrides[dep_redis_client] = lambda: mock_svc
        yield mock_svc
        app.dependency_overrides.pop(dep_redis_client, None)

    def test_list_navidrome_playlists_503_when_not_configured(self, user_jwt_headers):
        """Returns 503 when NAVIDROME_URL is not set."""
        with patch("app.routes.public.settings") as mock_settings:
            mock_settings.navidrome_enabled = False
            response = client.get("/queue/playlists/navidrome", headers=user_jwt_headers)

        assert response.status_code == 503
        assert "not configured" in response.json()["detail"]

    def test_list_navidrome_playlists_admin_token_treated_as_anonymous(self, admin_token):
        """Admin token is treated as anonymous (returns only public playlists, not 403)."""
        mock_playlists = [
            NavidromePlaylist(id="1", name="Public Mix", song_count=5, comment="", public=True),
        ]
        with patch("app.routes.public.settings") as mock_settings, \
             patch("app.routes.public.NavidromeService") as mock_svc_cls:
            mock_settings.navidrome_enabled = True
            mock_svc = AsyncMock()
            mock_svc.get_playlists = AsyncMock(return_value=mock_playlists)
            mock_svc_cls.return_value = mock_svc
            response = client.get(
                "/queue/playlists/navidrome",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
        assert response.status_code == 200
        assert len(response.json()) == 1  # only public playlists visible

    def test_list_navidrome_playlists_returns_list(self, user_jwt_headers):
        """Returns list of playlists from Navidrome service."""
        mock_playlists = [
            NavidromePlaylist(id="1", name="Rock Classics", song_count=10, comment="", public=True),
            NavidromePlaylist(id="2", name="Jazz", song_count=5, comment="Smooth", public=True),
        ]

        with patch("app.routes.public.settings") as mock_settings, \
             patch("app.routes.public.NavidromeService") as mock_svc_cls:
            mock_settings.navidrome_enabled = True
            mock_svc = AsyncMock()
            mock_svc.get_playlists = AsyncMock(return_value=mock_playlists)
            mock_svc_cls.return_value = mock_svc

            response = client.get("/queue/playlists/navidrome", headers=user_jwt_headers)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["id"] == "1"
        assert data[0]["name"] == "Rock Classics"
        assert data[0]["song_count"] == 10
        assert data[1]["comment"] == "Smooth"

    def test_add_playlist_requires_jwt(self, admin_token):
        """Admin token is rejected for add-playlist endpoint."""
        response = client.post(
            "/queue/add-playlist",
            json={"source": "navidrome", "playlist_id": "p1"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 403

    def test_add_playlist_503_when_not_configured(self, user_jwt_headers, mock_redis_dep):
        """Returns 503 when Navidrome is not configured."""
        with patch("app.routes.public.settings") as mock_settings:
            mock_settings.navidrome_enabled = False
            response = client.post(
                "/queue/add-playlist",
                json={"source": "navidrome", "playlist_id": "p1"},
                headers=user_jwt_headers,
            )

        assert response.status_code == 503

    def test_add_playlist_rejects_when_limit_exceeded(self, mock_redis_dep):
        """Returns 403 when adding playlist would exceed the JWT max_queue_songs limit."""
        # Token allows 5 songs, user has 0, playlist has 10 — exceeds limit
        token = generate_token(duration_seconds=3600, max_queue_songs=5, max_add_requests=20)
        headers = {"Authorization": f"Bearer {token}"}
        mock_songs = [
            NavidromeSong(id=f"s{i}", title=f"Song {i}", artist="Art", album="Alb", duration=200, suffix="mp3")
            for i in range(10)
        ]
        mock_redis_dep.get_user_song_count = AsyncMock(return_value=0)  # 0 + 10 > 5

        with patch("app.routes.public.settings") as mock_settings, \
             patch("app.routes.public.NavidromeService") as mock_svc_cls:
            mock_settings.navidrome_enabled = True
            mock_svc = AsyncMock()
            mock_svc.get_playlists = AsyncMock(return_value=[
                NavidromePlaylist(id="p1", name="Test", song_count=10, public=True)
            ])
            mock_svc.get_playlist_songs = AsyncMock(return_value=mock_songs)
            mock_svc_cls.return_value = mock_svc

            response = client.post(
                "/queue/add-playlist",
                json={"source": "navidrome", "playlist_id": "p1"},
                headers=headers,
            )

        assert response.status_code == 403
        assert "exceed" in response.json()["detail"].lower()

    def test_add_playlist_success(self, user_jwt_headers, mock_redis_dep):
        """Successfully adds playlist songs to user queue."""
        mock_songs = [
            NavidromeSong(id="s1", title="Track One", artist="Artist A", album="Alb", duration=180, suffix="mp3"),
            NavidromeSong(id="s2", title="Track Two", artist="Artist B", album="Alb", duration=200, suffix="mp3"),
        ]

        with patch("app.routes.public.settings") as mock_settings, \
             patch("app.routes.public.NavidromeService") as mock_svc_cls, \
             patch("app.routes.public.queue_service.add_song", return_value="u-42") as mock_add:
            mock_settings.navidrome_enabled = True
            mock_settings.NAVIDROME_URL = "http://navidrome.test"
            mock_svc = AsyncMock()
            mock_svc.get_playlists = AsyncMock(return_value=[
                NavidromePlaylist(id="p1", name="Test", song_count=2, public=True)
            ])
            mock_svc.get_playlist_songs = AsyncMock(return_value=mock_songs)
            mock_svc.download_song = AsyncMock()
            mock_svc_cls.return_value = mock_svc

            response = client.post(
                "/queue/add-playlist",
                json={"source": "navidrome", "playlist_id": "p1"},
                headers=user_jwt_headers,
            )

        assert response.status_code == 200
        data = response.json()
        assert data["total_added"] == 2
        assert len(data["added"]) == 2
        assert data["errors"] == []
        assert mock_add.call_count == 2


class TestQueueLimit:
    """Tests for JWT max_queue_songs enforcement on /queue/add."""

    @pytest.fixture(autouse=True)
    def mock_mpd_dep(self):
        """Override dep_mpd_user so tests don't require a real MPD connection."""
        mock_client = AsyncMock()
        mock_client.update_database = AsyncMock()
        mock_client.add_local_song = AsyncMock(return_value=42)
        mock_client.set_consume = AsyncMock()
        mock_client.play = AsyncMock()
        mock_client.get_queue = AsyncMock(return_value=[])

        async def override():
            yield mock_client

        app.dependency_overrides[dep_mpd_user] = override
        yield mock_client
        app.dependency_overrides.pop(dep_mpd_user, None)

    @pytest.fixture
    def mock_redis_dep(self):
        """Override dep_redis_client with a mock at the JWT limit."""
        mock_svc = AsyncMock()
        mock_svc.get_user_song_count = AsyncMock(return_value=5)
        mock_svc.get_user_add_count = AsyncMock(return_value=0)

        app.dependency_overrides[dep_redis_client] = lambda: mock_svc
        yield mock_svc
        app.dependency_overrides.pop(dep_redis_client, None)

    def test_jwt_limit_blocks_add_when_at_cap(self, mock_redis_dep):
        """Returns 403 when user is at their JWT max_queue_songs limit."""
        token = generate_token(duration_seconds=3600, max_queue_songs=5, max_add_requests=200)
        headers = {"Authorization": f"Bearer {token}"}

        response = client.post(
            "/queue/add",
            data={"url": "https://youtube.com/watch?v=test"},
            headers=headers,
        )

        assert response.status_code == 403
        assert "queue limit exceeded" in response.json()["detail"].lower()
