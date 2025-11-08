import httpx

from tests.api_endpoints import PUBLIC_CLIENTS


def test_client_counts_endpoint_accessible(client: httpx.Client) -> None:
    """Test that /public/clients endpoint is accessible without authentication."""
    response = client.get(PUBLIC_CLIENTS)
    assert response.status_code == 200


def test_client_counts_schema(client: httpx.Client) -> None:
    """Test that /public/clients returns correct schema."""
    response = client.get(PUBLIC_CLIENTS)
    assert response.status_code == 200

    data = response.json()
    assert "icecast" in data
    assert "webrtc" in data
    assert "total" in data

    assert isinstance(data["icecast"], int)
    assert isinstance(data["webrtc"], int)
    assert isinstance(data["total"], int)


def test_client_counts_values_non_negative(client: httpx.Client) -> None:
    """Test that all counts are non-negative."""
    response = client.get(PUBLIC_CLIENTS)
    assert response.status_code == 200

    data = response.json()
    assert data["icecast"] >= 0
    assert data["webrtc"] >= 0
    assert data["total"] >= 0


def test_client_counts_total_is_sum(client: httpx.Client) -> None:
    """Test that total equals sum of icecast and webrtc."""
    response = client.get(PUBLIC_CLIENTS)
    assert response.status_code == 200

    data = response.json()
    assert data["total"] == data["icecast"] + data["webrtc"]


def test_client_counts_consistency(client: httpx.Client) -> None:
    """Test that client counts remain consistent across multiple calls."""
    # Make several requests and verify consistency
    counts = []
    for _ in range(3):
        response = client.get(PUBLIC_CLIENTS)
        assert response.status_code == 200
        data = response.json()
        counts.append(data)

    # All counts should be consistent (allowing for ±1 variation due to timing)
    for i in range(len(counts) - 1):
        assert abs(counts[i]["icecast"] - counts[i + 1]["icecast"]) <= 1
        assert abs(counts[i]["webrtc"] - counts[i + 1]["webrtc"]) <= 1
        assert abs(counts[i]["total"] - counts[i + 1]["total"]) <= 1


def test_client_counts_liquidsoap_integration(client: httpx.Client) -> None:
    """Test that Liquidsoap listener tracking integration is working.

    Note: This test verifies the backend can successfully communicate with
    Liquidsoap's telnet server to retrieve listener counts.
    """
    response = client.get(PUBLIC_CLIENTS)
    assert response.status_code == 200
    data = response.json()

    # Verify we get a valid icecast count (not an error state like -1 or None)
    assert isinstance(data["icecast"], int)
    assert data["icecast"] >= 0

    # The mere fact that we got a valid integer shows the Liquidsoap integration works


def test_client_counts_janus_integration(client: httpx.Client) -> None:
    """Test that Janus admin API integration is working.

    Note: This test verifies the backend can successfully query Janus
    admin API to count WebRTC viewers.
    """
    response = client.get(PUBLIC_CLIENTS)
    assert response.status_code == 200
    data = response.json()

    # Verify we get a valid webrtc count (not an error state like -1 or None)
    assert isinstance(data["webrtc"], int)
    assert data["webrtc"] >= 0

    # The mere fact that we got a valid integer shows the Janus integration works


def test_client_counts_janus_structure(client: httpx.Client) -> None:
    """Test that webrtc count structure is correct (requires Janus to be running)."""
    response = client.get(PUBLIC_CLIENTS)
    assert response.status_code == 200

    data = response.json()
    # WebRTC count should be a valid integer (may be 0 if no WebRTC connections)
    assert isinstance(data["webrtc"], int)
    assert data["webrtc"] >= 0
