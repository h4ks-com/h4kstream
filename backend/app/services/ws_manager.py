"""WebSocket connection manager for real-time event streaming.

Subscribes to the same Redis Pub/Sub channels as the webhook worker and broadcasts events to connected WebSocket
clients.
"""

import asyncio
import json
import logging
from datetime import UTC
from datetime import datetime

import redis.asyncio as redis
from fastapi import WebSocket
from redis.exceptions import ConnectionError as RedisConnectionError

from app.services.redis_service import RedisService

logger = logging.getLogger(__name__)

EVENT_CHANNELS = [
    "events:song_changed",
    "events:song_added",
    "events:song_deleted",
    "events:livestream_started",
    "events:livestream_ended",
    "events:queue_switched",
    "events:livestream_recording_done",
]


class WebSocketManager:
    """Manages WebSocket connections and broadcasts events from Redis Pub/Sub."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []
        self._pubsub_task: asyncio.Task | None = None
        self._redis_client: redis.Redis | None = None
        self._pubsub: redis.client.PubSub | None = None
        self._running = False

    async def start(self, redis_client: redis.Redis) -> None:
        """Start the WebSocket manager and Redis Pub/Sub listener."""
        if self._running:
            return

        self._redis_client = redis_client
        self._running = True
        self._pubsub_task = asyncio.create_task(self._pubsub_listener())
        logger.info("WebSocket manager started")

    async def stop(self) -> None:
        """Stop the WebSocket manager."""
        self._running = False

        if self._pubsub_task:
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except asyncio.CancelledError:
                pass

        if self._pubsub:
            await self._pubsub.unsubscribe()
            await self._pubsub.close()

        for connection in self.active_connections[:]:
            try:
                await connection.close()
            except RuntimeError:
                pass

        self.active_connections.clear()
        logger.info("WebSocket manager stopped")

    async def connect(self, websocket: WebSocket, redis_service: RedisService) -> None:
        """Accept a new WebSocket connection and send initial state."""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

        try:
            await self._send_initial_state(websocket, redis_service)
        except RuntimeError as e:
            logger.warning(f"Failed to send initial state: {e}")
            self.disconnect(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def _send_initial_state(self, websocket: WebSocket, redis_service: RedisService) -> None:
        """Send current now_playing state to newly connected client."""
        now_playing = await redis_service.get_now_playing()

        event = {
            "event_type": "now_playing",
            "timestamp": datetime.now(UTC).isoformat(),
            "data": {
                "source": now_playing["source"],
                "metadata": now_playing["metadata"],
            },
            "description": f"Current source: {now_playing['source']}",
        }

        await websocket.send_json(event)

    async def broadcast(self, message: dict) -> None:
        """Broadcast a message to all connected clients."""
        if not self.active_connections:
            return

        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except RuntimeError:
                disconnected.append(connection)

        for connection in disconnected:
            self.disconnect(connection)

    async def _pubsub_listener(self) -> None:
        """Listen to Redis Pub/Sub channels and broadcast events to WebSocket clients."""
        while self._running:
            try:
                if not self._redis_client:
                    await asyncio.sleep(1)
                    continue

                self._pubsub = self._redis_client.pubsub()
                await self._pubsub.subscribe(*EVENT_CHANNELS)
                logger.info(f"WebSocket manager subscribed to: {EVENT_CHANNELS}")

                async for message in self._pubsub.listen():
                    if not self._running:
                        break

                    if message["type"] == "subscribe":
                        continue

                    if message["type"] == "message":
                        try:
                            data = message["data"].decode()
                            event_payload = json.loads(data)
                            await self.broadcast(event_payload)
                        except json.JSONDecodeError as e:
                            logger.error(f"Failed to decode event: {e}")

            except (RedisConnectionError, ConnectionError, OSError) as e:
                logger.error(f"Redis connection error in WebSocket manager: {e}")
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                break


ws_manager = WebSocketManager()
