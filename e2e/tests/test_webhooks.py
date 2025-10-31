"""E2E tests for webhook subscription and event delivery system."""

import hashlib
import hmac
import json
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler
from http.server import HTTPServer
from typing import Any

import httpx
import pytest
import redis


class WebhookTestServer(BaseHTTPRequestHandler):
    """Simple HTTP server to receive webhook deliveries."""

    # Class-level storage for received webhooks
    received_webhooks: list[dict[str, Any]] = []

    def do_POST(self):
        """Handle POST requests (webhook deliveries)."""
        content_length = int(self.headers["Content-Length"])
        body = self.rfile.read(content_length)

        # Store received webhook with both original body and parsed version
        webhook_data = {
            "headers": dict(self.headers),
            "body": json.loads(body.decode()),
            "raw_body": body.decode(),  # Store original JSON string for signature verification
            "signature": self.headers.get("X-Webhook-Signature"),
            "timestamp": time.time(),
        }
        WebhookTestServer.received_webhooks.append(webhook_data)

        # Respond with 200 OK
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "received"}).encode())

    def log_message(self, format, *args):
        """Suppress server logs."""
        pass


@pytest.fixture
def webhook_server():
    """Start a test webhook server on port 9999."""
    WebhookTestServer.received_webhooks = []  # Clear previous data

    server = HTTPServer(("0.0.0.0", 9999), WebhookTestServer)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    yield "http://host.docker.internal:9999/webhook"

    server.shutdown()


@pytest.fixture
def redis_client():
    """Create Redis client for checking state."""
    client = redis.Redis(host="localhost", port=6379, decode_responses=True)
    yield client
    client.close()


@pytest.fixture(autouse=True)
def cleanup_webhooks(redis_client: redis.Redis):
    """Clean up all webhook subscriptions before each test."""
    # Clear all webhook subscriptions
    redis_client.delete("webhooks:subscriptions")

    # Clear all event indexes
    for event_type in ["song_changed", "livestream_started", "livestream_ended", "queue_switched"]:
        redis_client.delete(f"webhooks:events:{event_type}")

    yield

    # Cleanup after test as well
    redis_client.delete("webhooks:subscriptions")
    for event_type in ["song_changed", "livestream_started", "livestream_ended", "queue_switched"]:
        redis_client.delete(f"webhooks:events:{event_type}")


def _verify_webhook_signature(raw_body: str, signature: str, signing_key: str) -> bool:
    """Verify webhook HMAC signature.

    Args:
        raw_body: Original JSON string from webhook POST body
        signature: Signature from X-Webhook-Signature header
        signing_key: Secret key used for HMAC

    Returns:
        True if signature is valid
    """
    # Generate expected signature from raw body
    expected_sig = hmac.new(
        signing_key.encode(),
        raw_body.encode(),
        hashlib.sha256,
    ).hexdigest()

    # Handle signature with sha256= prefix
    if signature.startswith("sha256="):
        signature = signature[7:]

    return hmac.compare_digest(signature, expected_sig)


@pytest.mark.webhook
def test_webhook_subscription_lifecycle(
    client: httpx.Client,
    admin_headers: dict[str, str],
    webhook_server: str,
) -> None:
    """Test creating, listing, and deleting webhook subscriptions."""
    # Create webhook subscription
    signing_key = "test-secret-key-12345"
    response = client.post(
        "/admin/webhooks/subscribe",
        headers=admin_headers,
        json={
            "url": webhook_server,
            "events": ["song_changed", "livestream_started"],
            "signing_key": signing_key,
            "description": "E2E test webhook",
        },
    )
    assert response.status_code == 200
    webhook_data = response.json()
    webhook_id = webhook_data["webhook_id"]
    assert webhook_data["url"] == webhook_server
    assert webhook_data["events"] == ["song_changed", "livestream_started"]
    assert webhook_data["description"] == "E2E test webhook"
    assert "created_at" in webhook_data

    # List webhooks
    response = client.get("/admin/webhooks/list", headers=admin_headers)
    assert response.status_code == 200
    webhooks = response.json()
    assert len(webhooks) >= 1
    found_webhook = next((w for w in webhooks if w["webhook_id"] == webhook_id), None)
    assert found_webhook is not None
    assert found_webhook["url"] == webhook_server

    # Delete webhook
    response = client.delete(f"/admin/webhooks/{webhook_id}", headers=admin_headers)
    assert response.status_code == 200

    # Verify deletion
    response = client.get("/admin/webhooks/list", headers=admin_headers)
    assert response.status_code == 200
    webhooks = response.json()
    found_webhook = next((w for w in webhooks if w["webhook_id"] == webhook_id), None)
    assert found_webhook is None


@pytest.mark.webhook
def test_webhook_song_changed_event(
    client: httpx.Client,
    admin_headers: dict[str, str],
    webhook_server: str,
    redis_client: redis.Redis,
) -> None:
    """Test webhook delivery for song_changed event."""
    # Clear previous webhook data
    WebhookTestServer.received_webhooks = []

    # Create webhook subscription
    signing_key = "test-secret-key-song-changed"
    response = client.post(
        "/admin/webhooks/subscribe",
        headers=admin_headers,
        json={
            "url": webhook_server,
            "events": ["song_changed"],
            "signing_key": signing_key,
            "description": "Song changed webhook",
        },
    )
    assert response.status_code == 200
    webhook_id = response.json()["webhook_id"]

    # Wait for webhook worker to pick up subscription
    time.sleep(2)

    # Add a song to trigger song_changed event
    add_response = client.post(
        "/admin/queue/add",
        headers=admin_headers,
        params={"playlist": "user"},
        data={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
        timeout=120.0,
    )
    assert add_response.status_code == 200

    # Wait for webhook delivery
    max_retries = 10
    webhook_received = False
    for _ in range(max_retries):
        time.sleep(1)
        if WebhookTestServer.received_webhooks:
            webhook_received = True
            break

    assert webhook_received, "Webhook was not delivered"

    # Verify webhook payload
    webhook_data = WebhookTestServer.received_webhooks[0]
    assert webhook_data["body"]["event_type"] == "song_changed"
    assert "data" in webhook_data["body"]
    assert "timestamp" in webhook_data["body"]

    # Verify signature
    assert webhook_data["signature"] is not None
    assert _verify_webhook_signature(
        webhook_data["raw_body"],
        webhook_data["signature"],
        signing_key,
    )

    # Cleanup
    client.delete(f"/admin/webhooks/{webhook_id}", headers=admin_headers)


@pytest.mark.webhook
def test_webhook_livestream_started_event(
    client: httpx.Client,
    admin_headers: dict[str, str],
    webhook_server: str,
) -> None:
    """Test webhook delivery for livestream_started event."""
    # Clear previous webhook data
    WebhookTestServer.received_webhooks = []

    # Create webhook subscription
    signing_key = "test-secret-key-livestream"
    response = client.post(
        "/admin/webhooks/subscribe",
        headers=admin_headers,
        json={
            "url": webhook_server,
            "events": ["livestream_started", "livestream_ended"],
            "signing_key": signing_key,
            "description": "Livestream webhook",
        },
    )
    assert response.status_code == 200
    webhook_id = response.json()["webhook_id"]

    # Wait for webhook worker to pick up subscription
    time.sleep(2)

    # Get livestream token
    token_response = client.post(
        "/admin/livestream/token",
        headers=admin_headers,
        json={"max_streaming_seconds": 60},
    )
    assert token_response.status_code == 200
    token = token_response.json()["token"]

    # Start livestream
    ffmpeg_process = subprocess.Popen(
        [
            "ffmpeg",
            "-f", "lavfi",
            "-i", "anullsrc=r=48000:cl=stereo",
            "-t", "10",
            "-c:a", "libvorbis",
            "-b:a", "128k",
            "-f", "ogg",
            "-method",
            "PUT",
            "-auth_type",
            "basic",
            "-chunked_post",
            "1",
            "-send_expect_100",
            "0",
            "-content_type",
            "audio/mpeg",
            f"http://source:{token}@localhost/stream/live",
            "-loglevel", "error",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # Wait for livestream_started webhook
    max_retries = 15
    started_webhook_received = False
    for _ in range(max_retries):
        time.sleep(1)
        for webhook in WebhookTestServer.received_webhooks:
            if webhook["body"]["event_type"] == "livestream_started":
                started_webhook_received = True
                break
        if started_webhook_received:
            break

    assert started_webhook_received, "livestream_started webhook was not delivered"

    # Verify started webhook
    started_webhook = next(
        w for w in WebhookTestServer.received_webhooks
        if w["body"]["event_type"] == "livestream_started"
    )
    assert started_webhook["body"]["event_type"] == "livestream_started"
    assert _verify_webhook_signature(
        started_webhook["raw_body"],
        started_webhook["signature"],
        signing_key,
    )

    # Kill stream to trigger livestream_ended
    ffmpeg_process.kill()
    ffmpeg_process.wait()

    # Wait for livestream_ended webhook
    ended_webhook_received = False
    for _ in range(max_retries):
        time.sleep(1)
        for webhook in WebhookTestServer.received_webhooks:
            if webhook["body"]["event_type"] == "livestream_ended":
                ended_webhook_received = True
                break
        if ended_webhook_received:
            break

    assert ended_webhook_received, "livestream_ended webhook was not delivered"

    # Verify ended webhook
    ended_webhook = next(
        w for w in WebhookTestServer.received_webhooks
        if w["body"]["event_type"] == "livestream_ended"
    )
    assert ended_webhook["body"]["event_type"] == "livestream_ended"
    assert _verify_webhook_signature(
        ended_webhook["raw_body"],
        ended_webhook["signature"],
        signing_key,
    )

    # Cleanup
    client.delete(f"/admin/webhooks/{webhook_id}", headers=admin_headers)


@pytest.mark.webhook
def test_webhook_registry_persistence(
    client: httpx.Client,
    admin_headers: dict[str, str],
    webhook_server: str,
    redis_client: redis.Redis,
) -> None:
    """Test that webhook subscriptions persist in Redis."""
    # Create webhook subscription
    signing_key = "test-secret-key-persistence"
    response = client.post(
        "/admin/webhooks/subscribe",
        headers=admin_headers,
        json={
            "url": webhook_server,
            "events": ["song_changed"],
            "signing_key": signing_key,
            "description": "Persistence test webhook",
        },
    )
    assert response.status_code == 200
    webhook_id = response.json()["webhook_id"]

    # Check Redis for webhook subscription
    webhook_config = redis_client.hget("webhooks:subscriptions", webhook_id)
    assert webhook_config is not None

    config_data = json.loads(webhook_config)
    assert config_data["url"] == webhook_server
    assert config_data["events"] == ["song_changed"]
    assert config_data["signing_key"] == signing_key

    # Check event index
    song_changed_webhooks = redis_client.smembers("webhooks:events:song_changed")
    assert webhook_id in song_changed_webhooks

    # Delete webhook
    response = client.delete(f"/admin/webhooks/{webhook_id}", headers=admin_headers)
    assert response.status_code == 200

    # Verify removal from Redis
    webhook_config = redis_client.hget("webhooks:subscriptions", webhook_id)
    assert webhook_config is None

    song_changed_webhooks = redis_client.smembers("webhooks:events:song_changed")
    assert webhook_id not in song_changed_webhooks


@pytest.mark.webhook
def test_webhook_delivery_logs(
    client: httpx.Client,
    admin_headers: dict[str, str],
    webhook_server: str,
) -> None:
    """Test webhook delivery logging and statistics."""
    # Clear previous webhook data
    WebhookTestServer.received_webhooks = []

    # Create webhook subscription
    signing_key = "test-secret-key-logs"
    response = client.post(
        "/admin/webhooks/subscribe",
        headers=admin_headers,
        json={
            "url": webhook_server,
            "events": ["song_changed"],
            "signing_key": signing_key,
            "description": "Logging test webhook",
        },
    )
    assert response.status_code == 200
    webhook_id = response.json()["webhook_id"]

    # Wait for webhook worker
    time.sleep(2)

    # Trigger event by adding a song
    add_response = client.post(
        "/admin/queue/add",
        headers=admin_headers,
        params={"playlist": "user"},
        data={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
        timeout=120.0,
    )
    assert add_response.status_code == 200

    # Wait for webhook delivery
    time.sleep(5)

    # Check delivery logs
    response = client.get(
        f"/admin/webhooks/{webhook_id}/deliveries",
        headers=admin_headers,
    )
    assert response.status_code == 200
    deliveries = response.json()
    assert len(deliveries) >= 1

    # Verify delivery log structure
    delivery = deliveries[0]
    assert delivery["webhook_id"] == webhook_id
    assert delivery["event_type"] == "song_changed"
    assert delivery["url"] == webhook_server
    assert delivery["status"] in ["success", "failed"]
    assert "timestamp" in delivery

    # Check webhook statistics
    response = client.get(
        f"/admin/webhooks/{webhook_id}/stats",
        headers=admin_headers,
    )
    assert response.status_code == 200
    stats = response.json()
    assert stats["webhook_id"] == webhook_id
    assert stats["total_deliveries"] >= 1
    assert stats["success_count"] >= 0
    assert stats["failure_count"] >= 0
    assert 0.0 <= stats["success_rate"] <= 1.0

    # Cleanup
    client.delete(f"/admin/webhooks/{webhook_id}", headers=admin_headers)


@pytest.mark.webhook
def test_webhook_test_endpoint(
    client: httpx.Client,
    admin_headers: dict[str, str],
    webhook_server: str,
) -> None:
    """Test the webhook test endpoint."""
    # Clear previous webhook data
    WebhookTestServer.received_webhooks = []

    # Create webhook subscription
    signing_key = "test-secret-key-test-endpoint"
    response = client.post(
        "/admin/webhooks/subscribe",
        headers=admin_headers,
        json={
            "url": webhook_server,
            "events": ["song_changed"],
            "signing_key": signing_key,
            "description": "Test endpoint webhook",
        },
    )
    assert response.status_code == 200
    webhook_id = response.json()["webhook_id"]

    # Test webhook delivery
    response = client.post(
        f"/admin/webhooks/{webhook_id}/test",
        headers=admin_headers,
    )
    assert response.status_code == 200

    # Wait for delivery
    time.sleep(2)

    # Verify test webhook was received
    assert len(WebhookTestServer.received_webhooks) >= 1
    test_webhook = WebhookTestServer.received_webhooks[0]
    assert test_webhook["body"]["event_type"] == "test_event"
    assert test_webhook["body"]["data"]["test"] is True

    # Verify signature
    assert _verify_webhook_signature(
        test_webhook["raw_body"],
        test_webhook["signature"],
        signing_key,
    )

    # Cleanup
    client.delete(f"/admin/webhooks/{webhook_id}", headers=admin_headers)


@pytest.mark.webhook
def test_webhook_duplicate_prevention(
    client: httpx.Client,
    admin_headers: dict[str, str],
    webhook_server: str,
) -> None:
    """Test that webhooks with same URL and events are not duplicated."""
    test_url = webhook_server
    test_events = ["song_changed", "livestream_started"]
    signing_key = "test-secret-key-duplicate"

    # Create first webhook
    response1 = client.post(
        "/admin/webhooks/subscribe",
        headers=admin_headers,
        json={
            "url": test_url,
            "events": test_events,
            "signing_key": signing_key,
            "description": "First description",
        },
    )
    assert response1.status_code == 200
    webhook1_data = response1.json()
    webhook1_id = webhook1_data["webhook_id"]
    created_at1 = webhook1_data["created_at"]

    # Create second webhook with same URL and events, different description
    response2 = client.post(
        "/admin/webhooks/subscribe",
        headers=admin_headers,
        json={
            "url": test_url,
            "events": test_events,
            "signing_key": signing_key,
            "description": "Updated description",
        },
    )
    assert response2.status_code == 200
    webhook2_data = response2.json()
    webhook2_id = webhook2_data["webhook_id"]
    created_at2 = webhook2_data["created_at"]

    # Should return the same webhook_id (not duplicate)
    assert webhook1_id == webhook2_id

    # Should preserve original created_at
    assert created_at1 == created_at2

    # List all webhooks and verify only one exists
    list_response = client.get("/admin/webhooks/list", headers=admin_headers)
    assert list_response.status_code == 200
    webhooks = list_response.json()

    # Filter to our test webhooks
    matching_webhooks = [w for w in webhooks if w["url"] == test_url and set(w["events"]) == set(test_events)]

    # Should only have one webhook, not two
    assert len(matching_webhooks) == 1
    assert matching_webhooks[0]["webhook_id"] == webhook1_id
    assert matching_webhooks[0]["description"] == "Updated description"
    assert matching_webhooks[0]["created_at"] == created_at1

    # Create webhook with different events (should create new one)
    response3 = client.post(
        "/admin/webhooks/subscribe",
        headers=admin_headers,
        json={
            "url": test_url,
            "events": ["queue_switched"],
            "signing_key": signing_key,
            "description": "Different events",
        },
    )
    assert response3.status_code == 200
    webhook3_data = response3.json()
    webhook3_id = webhook3_data["webhook_id"]

    # Should be a different webhook_id
    assert webhook3_id != webhook1_id

    # List again and verify we have two webhooks now
    list_response = client.get("/admin/webhooks/list", headers=admin_headers)
    webhooks = list_response.json()
    test_webhooks = [w for w in webhooks if w["url"] == test_url]
    assert len(test_webhooks) == 2

    # Cleanup
    client.delete(f"/admin/webhooks/{webhook1_id}", headers=admin_headers)
    client.delete(f"/admin/webhooks/{webhook3_id}", headers=admin_headers)
