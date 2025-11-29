"""E2E tests for WebSocket real-time event streaming."""

import asyncio
import json
import os
from collections.abc import Generator

import httpx
import pytest
import redis
import websockets
from dotenv import load_dotenv

load_dotenv("../.env")

API_URL = os.getenv("API_URL", "http://localhost/api")
WS_URL = API_URL.replace("http://", "ws://").replace("https://", "wss://") + "/ws/events"


@pytest.fixture
def redis_client() -> Generator[redis.Redis, None, None]:
    """Create Redis client for triggering events."""
    client = redis.Redis(host="localhost", port=6379, decode_responses=True)
    yield client
    client.close()


@pytest.mark.websocket
def test_websocket_connection_and_initial_state(
    client: httpx.Client,
    admin_headers: dict[str, str],
) -> None:
    """Test WebSocket connection and receiving initial now_playing event."""

    async def run_test() -> None:
        async with websockets.connect(WS_URL) as ws:
            message = await asyncio.wait_for(ws.recv(), timeout=5.0)
            event = json.loads(message)

            assert event["event_type"] == "now_playing"
            assert "timestamp" in event
            assert "data" in event
            assert "source" in event["data"]
            assert event["data"]["source"] in ["user", "fallback", "livestream"]
            assert "metadata" in event["data"]

    asyncio.run(run_test())


@pytest.mark.websocket
def test_websocket_receives_song_changed_event(
    client: httpx.Client,
    admin_headers: dict[str, str],
    redis_client: redis.Redis,
) -> None:
    """Test WebSocket receives song_changed event when triggered via Redis Pub/Sub."""

    async def run_test() -> None:
        async with websockets.connect(WS_URL) as ws:
            initial = await asyncio.wait_for(ws.recv(), timeout=5.0)
            initial_event = json.loads(initial)
            assert initial_event["event_type"] == "now_playing"

            test_event = {
                "event_type": "song_changed",
                "timestamp": "2025-01-01T00:00:00Z",
                "data": {
                    "playlist": "user",
                    "title": "Test Song",
                    "artist": "Test Artist",
                    "genre": "Test Genre",
                },
                "description": "Test song changed event",
            }
            redis_client.publish("events:song_changed", json.dumps(test_event))

            message = await asyncio.wait_for(ws.recv(), timeout=5.0)
            event = json.loads(message)

            assert event["event_type"] == "song_changed"
            assert event["data"]["title"] == "Test Song"
            assert event["data"]["artist"] == "Test Artist"
            assert event["data"]["playlist"] == "user"

    asyncio.run(run_test())


@pytest.mark.websocket
def test_websocket_receives_livestream_events(
    client: httpx.Client,
    admin_headers: dict[str, str],
    redis_client: redis.Redis,
) -> None:
    """Test WebSocket receives livestream_started and livestream_ended events."""

    async def run_test() -> None:
        async with websockets.connect(WS_URL) as ws:
            initial = await asyncio.wait_for(ws.recv(), timeout=5.0)
            assert json.loads(initial)["event_type"] == "now_playing"

            started_event = {
                "event_type": "livestream_started",
                "timestamp": "2025-01-01T00:00:00Z",
                "data": {
                    "user_id": "test-user-123",
                    "show_name": "Test Show",
                    "min_recording_duration": 30,
                },
                "description": "Livestream started",
            }
            redis_client.publish("events:livestream_started", json.dumps(started_event))

            message = await asyncio.wait_for(ws.recv(), timeout=5.0)
            event = json.loads(message)
            assert event["event_type"] == "livestream_started"
            assert event["data"]["show_name"] == "Test Show"

            ended_event = {
                "event_type": "livestream_ended",
                "timestamp": "2025-01-01T00:01:00Z",
                "data": {
                    "user_id": "test-user-123",
                    "duration_seconds": 60,
                    "reason": "disconnect",
                },
                "description": "Livestream ended",
            }
            redis_client.publish("events:livestream_ended", json.dumps(ended_event))

            message = await asyncio.wait_for(ws.recv(), timeout=5.0)
            event = json.loads(message)
            assert event["event_type"] == "livestream_ended"
            assert event["data"]["duration_seconds"] == 60

    asyncio.run(run_test())


@pytest.mark.websocket
def test_websocket_receives_queue_switched_event(
    client: httpx.Client,
    admin_headers: dict[str, str],
    redis_client: redis.Redis,
) -> None:
    """Test WebSocket receives queue_switched event."""

    async def run_test() -> None:
        async with websockets.connect(WS_URL) as ws:
            initial = await asyncio.wait_for(ws.recv(), timeout=5.0)
            assert json.loads(initial)["event_type"] == "now_playing"

            switch_event = {
                "event_type": "queue_switched",
                "timestamp": "2025-01-01T00:00:00Z",
                "data": {
                    "from_source": "user",
                    "to_source": "livestream",
                },
                "description": "Queue switched from user to livestream",
            }
            redis_client.publish("events:queue_switched", json.dumps(switch_event))

            message = await asyncio.wait_for(ws.recv(), timeout=5.0)
            event = json.loads(message)
            assert event["event_type"] == "queue_switched"
            assert event["data"]["from_source"] == "user"
            assert event["data"]["to_source"] == "livestream"

    asyncio.run(run_test())


@pytest.mark.websocket
def test_websocket_multiple_clients_receive_same_event(
    client: httpx.Client,
    admin_headers: dict[str, str],
    redis_client: redis.Redis,
) -> None:
    """Test that multiple WebSocket clients receive the same broadcast event."""

    async def run_test() -> None:
        async with websockets.connect(WS_URL) as ws1, websockets.connect(WS_URL) as ws2:
            for ws in [ws1, ws2]:
                initial = await asyncio.wait_for(ws.recv(), timeout=5.0)
                assert json.loads(initial)["event_type"] == "now_playing"

            test_event = {
                "event_type": "song_added",
                "timestamp": "2025-01-01T00:00:00Z",
                "data": {
                    "song_id": "u-123",
                    "playlist": "user",
                    "title": "Broadcast Test",
                    "artist": "Test Artist",
                },
                "description": "Song added",
            }
            redis_client.publish("events:song_added", json.dumps(test_event))

            msg1 = await asyncio.wait_for(ws1.recv(), timeout=5.0)
            msg2 = await asyncio.wait_for(ws2.recv(), timeout=5.0)

            event1 = json.loads(msg1)
            event2 = json.loads(msg2)

            assert event1["event_type"] == "song_added"
            assert event2["event_type"] == "song_added"
            assert event1["data"]["title"] == "Broadcast Test"
            assert event2["data"]["title"] == "Broadcast Test"

    asyncio.run(run_test())


@pytest.mark.websocket
def test_websocket_disconnect_and_reconnect(
    client: httpx.Client,
    admin_headers: dict[str, str],
    redis_client: redis.Redis,
) -> None:
    """Test WebSocket can disconnect and reconnect, receiving initial state each time."""

    async def run_test() -> None:
        async with websockets.connect(WS_URL) as ws:
            initial = await asyncio.wait_for(ws.recv(), timeout=5.0)
            event1 = json.loads(initial)
            assert event1["event_type"] == "now_playing"

        async with websockets.connect(WS_URL) as ws:
            initial = await asyncio.wait_for(ws.recv(), timeout=5.0)
            event2 = json.loads(initial)
            assert event2["event_type"] == "now_playing"

    asyncio.run(run_test())


@pytest.mark.websocket
def test_websocket_with_real_song_add(
    client: httpx.Client,
    admin_headers: dict[str, str],
) -> None:
    """Test WebSocket receives event when a real song is added via API."""

    async def run_test() -> None:
        async with websockets.connect(WS_URL) as ws:
            initial = await asyncio.wait_for(ws.recv(), timeout=5.0)
            assert json.loads(initial)["event_type"] == "now_playing"

            add_response = client.post(
                "/admin/queue/add",
                headers=admin_headers,
                params={"playlist": "user"},
                data={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
                timeout=120.0,
            )
            assert add_response.status_code == 200

            events_received = []
            try:
                while True:
                    message = await asyncio.wait_for(ws.recv(), timeout=15.0)
                    event = json.loads(message)
                    events_received.append(event)

                    if event["event_type"] in ["song_added", "song_changed"]:
                        break
            except TimeoutError:
                pass

            event_types = [e["event_type"] for e in events_received]
            assert any(
                t in event_types for t in ["song_added", "song_changed"]
            ), f"Expected song_added or song_changed, got: {event_types}"

    asyncio.run(run_test())
