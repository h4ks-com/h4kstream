import time

import httpx


def test_create_livestream_token(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test livestream token creation endpoint."""
    response = client.post("/admin/livestream/token", json={"max_streaming_seconds": 3600}, headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert "expires_at" in data
    assert "max_streaming_seconds" in data
    assert data["max_streaming_seconds"] == 3600
    assert len(data["token"]) > 0


def test_livestream_token_validation_enforcement(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test that livestream token validation enforces min/max limits."""
    too_short = client.post("/admin/livestream/token", json={"max_streaming_seconds": 30}, headers=admin_headers)
    assert too_short.status_code == 422

    too_long = client.post("/admin/livestream/token", json={"max_streaming_seconds": 100000}, headers=admin_headers)
    assert too_long.status_code == 422

    valid_min = client.post("/admin/livestream/token", json={"max_streaming_seconds": 60}, headers=admin_headers)
    assert valid_min.status_code == 200

    valid_max = client.post("/admin/livestream/token", json={"max_streaming_seconds": 86400}, headers=admin_headers)
    assert valid_max.status_code == 200


def test_livestream_auth_endpoint_requires_admin(client: httpx.Client) -> None:
    """Test that internal livestream endpoints require admin authentication."""
    response = client.post("/internal/livestream/auth", json={"token": "fake", "address": "127.0.0.1"})
    assert response.status_code == 403


def test_livestream_auth_with_valid_token(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test livestream authentication with valid token."""
    token_response = client.post("/admin/livestream/token", json={"max_streaming_seconds": 3600}, headers=admin_headers)
    assert token_response.status_code == 200
    livestream_token = token_response.json()["token"]

    auth_response = client.post(
        "/internal/livestream/auth",
        json={"token": livestream_token, "address": "192.168.1.1"},
        headers=admin_headers,
    )
    assert auth_response.status_code == 200
    auth_data = auth_response.json()
    assert auth_data["success"] is True
    assert auth_data["reason"] is None


def test_livestream_auth_with_invalid_token(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test livestream authentication with invalid token."""
    auth_response = client.post(
        "/internal/livestream/auth", json={"token": "invalid_token", "address": "192.168.1.1"}, headers=admin_headers
    )
    assert auth_response.status_code == 200
    auth_data = auth_response.json()
    assert auth_data["success"] is False
    assert "invalid" in auth_data["reason"].lower()


def test_livestream_slot_first_come_first_served(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test that only first user can reserve the streaming slot."""
    token1_response = client.post(
        "/admin/livestream/token", json={"max_streaming_seconds": 3600}, headers=admin_headers
    )
    token2_response = client.post(
        "/admin/livestream/token", json={"max_streaming_seconds": 3600}, headers=admin_headers
    )

    token1 = token1_response.json()["token"]
    token2 = token2_response.json()["token"]

    auth1 = client.post(
        "/internal/livestream/auth", json={"token": token1, "address": "192.168.1.1"}, headers=admin_headers
    )
    assert auth1.status_code == 200
    assert auth1.json()["success"] is True

    auth2 = client.post(
        "/internal/livestream/auth", json={"token": token2, "address": "192.168.1.2"}, headers=admin_headers
    )
    assert auth2.status_code == 200
    assert auth2.json()["success"] is False
    assert "occupied" in auth2.json()["reason"].lower()

    disconnect_response = client.post(
        "/internal/livestream/disconnect", json={"token": token1}, headers=admin_headers
    )
    assert disconnect_response.status_code == 200

    time.sleep(1)

    auth2_retry = client.post(
        "/internal/livestream/auth", json={"token": token2, "address": "192.168.1.2"}, headers=admin_headers
    )
    assert auth2_retry.status_code == 200
    assert auth2_retry.json()["success"] is True


def test_livestream_connect_and_disconnect_flow(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test full connect and disconnect flow."""
    token_response = client.post("/admin/livestream/token", json={"max_streaming_seconds": 3600}, headers=admin_headers)
    token = token_response.json()["token"]

    auth_response = client.post(
        "/internal/livestream/auth", json={"token": token, "address": "192.168.1.1"}, headers=admin_headers
    )
    assert auth_response.json()["success"] is True

    connect_response = client.post("/internal/livestream/connect", json={"token": token}, headers=admin_headers)
    assert connect_response.status_code == 200
    assert connect_response.json()["status"] == "success"

    time.sleep(2)

    disconnect_response = client.post("/internal/livestream/disconnect", json={"token": token}, headers=admin_headers)
    assert disconnect_response.status_code == 200
    assert disconnect_response.json()["status"] == "success"


def test_livestream_token_requires_admin_auth(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test that livestream token creation requires admin authentication."""
    response = client.post("/admin/livestream/token", json={"max_streaming_seconds": 3600})
    assert response.status_code == 403

    token_response = client.post("/admin/token", json={"duration_seconds": 3600}, headers=admin_headers)
    jwt_token = token_response.json()["token"]
    jwt_headers = {"Authorization": f"Bearer {jwt_token}"}

    jwt_response = client.post("/admin/livestream/token", json={"max_streaming_seconds": 3600}, headers=jwt_headers)
    assert jwt_response.status_code == 401
