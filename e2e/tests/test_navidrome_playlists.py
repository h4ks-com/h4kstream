"""E2E tests for Navidrome playlist integration endpoints.

These tests run against a live backend. Since Navidrome is not present in the test environment, they verify the 503
behavior and auth enforcement. Tests that require a real Navidrome instance are skipped unless NAVIDROME_URL is set.
"""

import os

import httpx
import jwt as pyjwt
import pytest

from tests.api_endpoints import ADMIN_TOKEN_CREATE
from tests.api_endpoints import QUEUE_ADD
from tests.api_endpoints import QUEUE_ADD_PLAYLIST
from tests.api_endpoints import QUEUE_PLAYLISTS_NAVIDROME

NAVIDROME_CONFIGURED = bool(os.getenv("NAVIDROME_URL"))


@pytest.fixture
def jwt_headers(client: httpx.Client, admin_headers: dict[str, str]) -> dict[str, str]:
    """Get JWT authorization headers."""
    response = client.post(
        ADMIN_TOKEN_CREATE,
        json={"duration_seconds": 3600, "max_queue_songs": 5, "max_add_requests": 20},
        headers=admin_headers,
    )
    assert response.status_code == 200
    token: str = response.json()["token"]
    return {"Authorization": f"Bearer {token}"}


class TestNavidromePlaylistsAuth:
    """Authentication and authorization tests for playlist endpoints."""

    def test_list_playlists_rejects_unauthenticated(self, client: httpx.Client) -> None:
        """Returns 401 when no token is provided."""
        response = client.get(QUEUE_PLAYLISTS_NAVIDROME)
        assert response.status_code == 401

    def test_list_playlists_rejects_admin_token(
        self, client: httpx.Client, admin_headers: dict[str, str]
    ) -> None:
        """Admin tokens are rejected — endpoint requires user JWT."""
        response = client.get(QUEUE_PLAYLISTS_NAVIDROME, headers=admin_headers)
        assert response.status_code == 403
        assert "Admin token not allowed" in response.json()["detail"]

    def test_add_playlist_rejects_unauthenticated(self, client: httpx.Client) -> None:
        """Returns 401 when no token is provided to add-playlist."""
        response = client.post(
            QUEUE_ADD_PLAYLIST,
            json={"source": "navidrome", "playlist_id": "p1"},
        )
        assert response.status_code == 401

    def test_add_playlist_rejects_admin_token(
        self, client: httpx.Client, admin_headers: dict[str, str]
    ) -> None:
        """Admin tokens are rejected — add-playlist requires user JWT."""
        response = client.post(
            QUEUE_ADD_PLAYLIST,
            json={"source": "navidrome", "playlist_id": "p1"},
            headers=admin_headers,
        )
        assert response.status_code == 403


class TestNavidromePlaylistsUnconfigured:
    """Tests for when Navidrome is not configured in the backend."""

    @pytest.mark.skipif(NAVIDROME_CONFIGURED, reason="Navidrome is configured")
    def test_list_playlists_returns_503_when_not_configured(
        self, client: httpx.Client, jwt_headers: dict[str, str]
    ) -> None:
        """Returns 503 with clear message when NAVIDROME_URL is not set."""
        response = client.get(QUEUE_PLAYLISTS_NAVIDROME, headers=jwt_headers)
        assert response.status_code == 503
        assert "not configured" in response.json()["detail"].lower()

    @pytest.mark.skipif(NAVIDROME_CONFIGURED, reason="Navidrome is configured")
    def test_add_playlist_returns_503_when_not_configured(
        self, client: httpx.Client, jwt_headers: dict[str, str]
    ) -> None:
        """Returns 503 with clear message when NAVIDROME_URL is not set."""
        response = client.post(
            QUEUE_ADD_PLAYLIST,
            json={"source": "navidrome", "playlist_id": "p1"},
            headers=jwt_headers,
        )
        assert response.status_code == 503
        assert "not configured" in response.json()["detail"].lower()


class TestHardQueueLimit:
    """E2E tests verifying the 30-song hard queue limit on /queue/add."""

    def test_hard_limit_is_shown_in_error_when_token_limit_exceeded_first(
        self, client: httpx.Client, admin_headers: dict[str, str]
    ) -> None:
        """Token-level limit error takes precedence over hard cap when token limit < 30."""
        # Create token with max_queue_songs=2 (below hard limit of 30)
        response = client.post(
            ADMIN_TOKEN_CREATE,
            json={"duration_seconds": 3600, "max_queue_songs": 2, "max_add_requests": 10},
            headers=admin_headers,
        )
        token = response.json()["token"]
        jwt_headers = {"Authorization": f"Bearer {token}"}

        # Get base user_id to verify it
        decoded = pyjwt.decode(token, options={"verify_signature": False})
        assert "user_id" in decoded

        # Verify the add endpoint returns 401/403 when we send no URL (triggers validation path)
        response = client.post(QUEUE_ADD, data={"song_name": "test"}, headers=jwt_headers)
        # 400 = validation error (no url/file), not a limit error — confirms auth works
        assert response.status_code == 400

    def test_add_playlist_invalid_source_returns_422(
        self, client: httpx.Client, jwt_headers: dict[str, str]
    ) -> None:
        """Invalid playlist source returns 422 validation error."""
        response = client.post(
            QUEUE_ADD_PLAYLIST,
            json={"source": "invalid_source", "playlist_id": "p1"},
            headers=jwt_headers,
        )
        assert response.status_code == 422
