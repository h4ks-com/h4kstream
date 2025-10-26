import httpx
import jwt
import pytest


@pytest.fixture
def jwt_token_with_limit(client: httpx.Client, admin_headers: dict[str, str]) -> str:
    """Create a JWT token with limit of 3 for testing."""
    response = client.post("/admin/token", json={"duration_seconds": 3600, "max_queue_songs": 3}, headers=admin_headers)
    assert response.status_code == 200
    return response.json()["token"]


@pytest.fixture
def jwt_headers(jwt_token_with_limit: str) -> dict[str, str]:
    """Get JWT authorization headers."""
    return {"Authorization": f"Bearer {jwt_token_with_limit}"}


@pytest.fixture(autouse=True)
def clean_queues(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Clean both queues before each test."""
    client.post("/admin/clear", headers=admin_headers)
    client.post("/admin/fallback/clear", headers=admin_headers)


def test_token_with_max_queue_songs(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test creating token with custom max_queue_songs."""
    response = client.post("/admin/token", json={"duration_seconds": 3600, "max_queue_songs": 5}, headers=admin_headers)
    assert response.status_code == 200
    assert "token" in response.json()


def test_token_with_default_max_queue_songs(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test creating token without max_queue_songs uses default (3)."""
    response = client.post("/admin/token", json={"duration_seconds": 3600}, headers=admin_headers)
    assert response.status_code == 200
    assert "token" in response.json()


def test_user_queue_endpoints_require_jwt(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test that user queue endpoints require JWT tokens, not admin tokens."""
    response_no_auth = client.post("/public/add", data={"song_name": "test"})
    assert response_no_auth.status_code == 403

    response_admin = client.post("/public/add", data={"song_name": "test"}, headers=admin_headers)
    assert response_admin.status_code == 403
    assert "Admin token not allowed" in response_admin.json()["detail"]


def test_fallback_endpoints_require_admin(client: httpx.Client, jwt_headers: dict[str, str]) -> None:
    """Test that fallback endpoints require admin token, not JWT."""
    response_no_auth = client.post("/admin/fallback/clear")
    assert response_no_auth.status_code == 403

    response_jwt = client.post("/admin/fallback/clear", headers=jwt_headers)
    assert response_jwt.status_code == 401


def test_fallback_list_endpoint_exists(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test that fallback list endpoint exists and returns empty list after clear."""
    client.post("/admin/fallback/clear", headers=admin_headers)
    response = client.get("/admin/fallback/list", headers=admin_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert len(response.json()) == 0


def test_user_list_endpoint_public(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test that user queue list endpoint is public."""
    client.post("/admin/clear", headers=admin_headers)
    response = client.get("/public/list")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert len(response.json()) == 0


def test_queue_clear_endpoints_work(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test that both clear endpoints work correctly."""
    user_clear = client.post("/admin/clear", headers=admin_headers)
    assert user_clear.status_code == 200

    fallback_clear = client.post("/admin/fallback/clear", headers=admin_headers)
    assert fallback_clear.status_code == 200


def test_different_tokens_have_different_user_ids(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test that different JWT tokens get different user IDs (for independent limits)."""
    token1 = client.post(
        "/admin/token", json={"duration_seconds": 3600, "max_queue_songs": 1}, headers=admin_headers
    ).json()["token"]

    token2 = client.post(
        "/admin/token", json={"duration_seconds": 3600, "max_queue_songs": 1}, headers=admin_headers
    ).json()["token"]

    assert token1 != token2


def test_jwt_token_has_expected_structure(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test that JWT tokens can be created with custom max_queue_songs."""

    response = client.post("/admin/token", json={"duration_seconds": 3600, "max_queue_songs": 5}, headers=admin_headers)
    token = response.json()["token"]

    decoded = jwt.decode(token, options={"verify_signature": False})
    assert "user_id" in decoded
    assert "max_queue_songs" in decoded
    assert decoded["max_queue_songs"] == 5
    assert decoded["type"] == "temporary"


def test_admin_endpoints_reject_jwt_tokens(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test that admin-only endpoints reject JWT tokens."""
    jwt_token = client.post("/admin/token", json={"duration_seconds": 3600}, headers=admin_headers).json()["token"]
    jwt_headers = {"Authorization": f"Bearer {jwt_token}"}

    clear_response = client.post("/admin/clear", headers=jwt_headers)
    assert clear_response.status_code == 401

    token_response = client.post("/admin/token", json={"duration_seconds": 1800}, headers=jwt_headers)
    assert token_response.status_code == 401


def test_delete_nonexistent_song_from_user_queue(client: httpx.Client, jwt_headers: dict[str, str]) -> None:
    """Test that deleting non-existent song from user queue returns 404."""
    response = client.delete("/public/delete/99999", headers=jwt_headers)
    assert response.status_code == 404


def test_delete_nonexistent_song_from_fallback(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test that deleting non-existent song from fallback returns 404."""
    response = client.delete("/admin/fallback/delete/99999", headers=admin_headers)
    assert response.status_code == 404


def test_max_add_requests_validation(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test that max_add_requests must be >= max_queue_songs."""
    response = client.post(
        "/admin/token",
        json={"duration_seconds": 3600, "max_queue_songs": 5, "max_add_requests": 3},
        headers=admin_headers,
    )
    assert response.status_code == 422


def test_max_add_requests_enforced_with_deletes(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test that max_add_requests limit persists even after deleting songs.

    This test verifies:
    1. Users can add songs up to max_add_requests limit
    2. Deleting songs does NOT decrease the add request counter
    3. After reaching the limit, users cannot add more songs even if queue is empty
    """
    # Create token with max_queue_songs=1, max_add_requests=3
    token_response = client.post(
        "/admin/token",
        json={"duration_seconds": 3600, "max_queue_songs": 1, "max_add_requests": 3},
        headers=admin_headers,
    )
    assert token_response.status_code == 200
    token = token_response.json()["token"]
    jwt_headers = {"Authorization": f"Bearer {token}"}

    # Verify token has correct limits
    decoded = jwt.decode(token, options={"verify_signature": False})
    assert decoded["max_queue_songs"] == 1
    assert decoded["max_add_requests"] == 3

    # Use a short YouTube video for testing
    test_url = "https://www.youtube.com/watch?v=TITaHLygjh8"

    # Add song 1 (should succeed)
    response1 = client.post("/public/add", data={"url": test_url}, headers=jwt_headers, timeout=60.0)
    assert response1.status_code == 200, f"First add failed: {response1.json()}"

    # Get song ID and delete it (to stay within queue limit of 1)
    queue = client.get("/public/list").json()
    assert len(queue) == 1
    song_id_1 = queue[0]["id"]
    delete_response1 = client.delete(f"/public/delete/{song_id_1}", headers=jwt_headers)
    assert delete_response1.status_code == 200

    # Verify queue is empty after delete
    queue_after_delete = client.get("/public/list").json()
    assert len(queue_after_delete) == 0, f"Queue should be empty but has {len(queue_after_delete)} songs"

    # Add song 2 (should succeed - add count is 2, but queue is empty)
    response2 = client.post("/public/add", data={"url": test_url}, headers=jwt_headers, timeout=60.0)
    assert response2.status_code == 200, f"Second add failed: {response2.json()}"

    # Delete song 2
    queue = client.get("/public/list").json()
    song_id_2 = queue[0]["id"]
    delete_response2 = client.delete(f"/public/delete/{song_id_2}", headers=jwt_headers)
    assert delete_response2.status_code == 200

    # Add song 3 (should succeed - add count is 3, hitting the limit)
    response3 = client.post("/public/add", data={"url": test_url}, headers=jwt_headers, timeout=60.0)
    assert response3.status_code == 200, f"Third add failed: {response3.json()}"

    # Delete song 3 (queue is now empty again)
    queue = client.get("/public/list").json()
    song_id_3 = queue[0]["id"]
    delete_response3 = client.delete(f"/public/delete/{song_id_3}", headers=jwt_headers)
    assert delete_response3.status_code == 200

    # Try to add song 4 (should FAIL - add count would be 4, exceeding limit of 3)
    response4 = client.post("/public/add", data={"url": test_url}, headers=jwt_headers, timeout=60.0)
    assert response4.status_code == 403, f"Fourth add should have failed but got: {response4.status_code}"
    error_detail = response4.json()["detail"]
    assert "Add request limit exceeded" in error_detail
    assert "3/3" in error_detail  # Should show current/max


def test_jwt_token_includes_max_add_requests(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test that JWT tokens include max_add_requests in payload."""
    response = client.post(
        "/admin/token",
        json={"duration_seconds": 3600, "max_queue_songs": 5, "max_add_requests": 10},
        headers=admin_headers,
    )
    token = response.json()["token"]

    decoded = jwt.decode(token, options={"verify_signature": False})
    assert "max_add_requests" in decoded
    assert decoded["max_add_requests"] == 10
