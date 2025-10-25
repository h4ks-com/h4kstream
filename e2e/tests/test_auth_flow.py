import os

import httpx
import pytest
from dotenv import load_dotenv

load_dotenv("../.env")

API_URL = os.getenv("API_URL", "http://localhost:8383")
ADMIN_TOKEN = os.getenv("ADMIN_API_TOKEN", "changeme")


@pytest.fixture
def client() -> httpx.Client:
    """Create HTTP client for testing."""
    return httpx.Client(base_url=API_URL, timeout=30.0)


def test_admin_token_auth(client: httpx.Client) -> None:
    """Test that admin token authentication works."""
    headers = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
    response = client.post("/admin/clear", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"status": "success"}


def test_admin_token_auth_fails_with_invalid_token(client: httpx.Client) -> None:
    """Test that invalid admin token is rejected."""
    headers = {"Authorization": "Bearer invalid-token"}
    response = client.post("/admin/clear", headers=headers)
    assert response.status_code == 401


def test_create_jwt_token(client: httpx.Client) -> None:
    """Test JWT token creation endpoint."""
    headers = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
    response = client.post("/admin/token", json={"duration_seconds": 3600}, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert len(data["token"]) > 0


def test_jwt_token_validation(client: httpx.Client) -> None:
    """Test that valid JWT tokens are accepted for authenticated endpoints."""
    admin_headers = {"Authorization": f"Bearer {ADMIN_TOKEN}"}

    token_response = client.post("/admin/token", json={"duration_seconds": 3600}, headers=admin_headers)
    assert token_response.status_code == 200
    jwt_token = token_response.json()["token"]

    jwt_headers = {"Authorization": f"Bearer {jwt_token}"}

    delete_response = client.delete("/public/delete/999", headers=jwt_headers)
    assert delete_response.status_code in [200, 404, 500]


def test_full_auth_flow(client: httpx.Client) -> None:
    """Test complete auth flow: admin clears, creates token, verifies token works."""
    admin_headers = {"Authorization": f"Bearer {ADMIN_TOKEN}"}

    clear_response = client.post("/admin/clear", headers=admin_headers)
    assert clear_response.status_code == 200

    list_response = client.get("/public/list")
    assert list_response.status_code == 200
    assert isinstance(list_response.json(), list)

    token_response = client.post("/admin/token", json={"duration_seconds": 3600}, headers=admin_headers)
    assert token_response.status_code == 200
    jwt_token = token_response.json()["token"]
    assert len(jwt_token) > 0


def test_jwt_max_duration_enforcement(client: httpx.Client) -> None:
    """Test that JWT token duration validation rejects values over 1 day."""
    headers = {"Authorization": f"Bearer {ADMIN_TOKEN}"}

    response = client.post("/admin/token", json={"duration_seconds": 100000}, headers=headers)
    assert response.status_code == 422

    valid_response = client.post("/admin/token", json={"duration_seconds": 86400}, headers=headers)
    assert valid_response.status_code == 200


def test_jwt_token_fails_without_auth(client: httpx.Client) -> None:
    """Test that JWT token creation requires admin auth."""
    response = client.post("/admin/token", json={"duration_seconds": 3600})
    assert response.status_code == 403


def test_public_add_requires_auth(client: httpx.Client) -> None:
    """Test that public add endpoint requires authentication."""
    response = client.post("/public/add", data={"url": "https://youtube.com/watch?v=test"})
    assert response.status_code == 403


def test_public_delete_requires_auth(client: httpx.Client) -> None:
    """Test that public delete endpoint requires authentication."""
    response = client.delete("/public/delete/1")
    assert response.status_code == 403


def test_public_list_works_without_auth(client: httpx.Client) -> None:
    """Test that public list endpoint works without authentication."""
    response = client.get("/public/list")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_admin_can_access_admin_endpoints(client: httpx.Client) -> None:
    """Test that admin token can access all admin endpoints."""
    headers = {"Authorization": f"Bearer {ADMIN_TOKEN}"}

    clear_response = client.post("/admin/clear", headers=headers)
    assert clear_response.status_code == 200

    token_response = client.post("/admin/token", json={"duration_seconds": 1800}, headers=headers)
    assert token_response.status_code == 200


def test_jwt_token_cannot_access_admin_endpoints(client: httpx.Client) -> None:
    """Test that JWT tokens cannot access admin-only endpoints."""
    admin_headers = {"Authorization": f"Bearer {ADMIN_TOKEN}"}

    token_response = client.post("/admin/token", json={"duration_seconds": 3600}, headers=admin_headers)
    assert token_response.status_code == 200
    jwt_token = token_response.json()["token"]

    jwt_headers = {"Authorization": f"Bearer {jwt_token}"}

    clear_response = client.post("/admin/clear", headers=jwt_headers)
    assert clear_response.status_code == 401

    create_token_response = client.post("/admin/token", json={"duration_seconds": 1800}, headers=jwt_headers)
    assert create_token_response.status_code == 401


def test_admin_token_works_on_public_endpoints(client: httpx.Client) -> None:
    """Test that admin token can be used on public authenticated endpoints."""
    admin_headers = {"Authorization": f"Bearer {ADMIN_TOKEN}"}

    delete_response = client.delete("/public/delete/999", headers=admin_headers)
    assert delete_response.status_code == 404


def test_delete_non_existent_song_returns_404(client: httpx.Client) -> None:
    """Test that deleting a non-existent song returns 404, not 500."""
    admin_headers = {"Authorization": f"Bearer {ADMIN_TOKEN}"}

    response = client.delete("/public/delete/99999", headers=admin_headers)
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()

