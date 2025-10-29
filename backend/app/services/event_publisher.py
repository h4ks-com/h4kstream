"""Event publisher service for webhook notifications.

Publishes events to Redis Pub/Sub channels for consumption by webhook worker.
"""

import json
import logging
from datetime import UTC
from datetime import datetime

import redis.asyncio as redis

logger = logging.getLogger(__name__)


class EventPublisher:
    """Publishes events to Redis Pub/Sub for webhook notifications."""

    def __init__(self, redis_client: redis.Redis):
        """Initialize event publisher with Redis client.

        Args:
            redis_client: Async Redis client instance
        """
        self.redis = redis_client

    async def publish(self, event_type: str, data: dict, description: str | None = None) -> None:
        """Publish an event to Redis Pub/Sub channel.

        Args:
            event_type: Event type (song_changed, livestream_started, etc.)
            data: Event-specific data payload
            description: Human-readable description of the event

        Event payload format:
        {
            "event_type": "song_changed",
            "description": "Playing next: Song Name by Artist",
            "data": { ... event-specific data ... },
            "timestamp": "2025-10-29T12:34:56.789Z"
        }
        """
        event_payload = {
            "event_type": event_type,
            "description": description or f"{event_type} event occurred",
            "data": data,
            "timestamp": datetime.now(UTC).isoformat(),
        }

        channel = f"events:{event_type}"
        payload_json = json.dumps(event_payload)

        try:
            # Publish to Redis Pub/Sub channel
            subscribers = await self.redis.publish(channel, payload_json)
            logger.debug(f"Published {event_type} event to {subscribers} subscribers")
        except Exception as e:
            logger.error(f"Failed to publish {event_type} event: {e}", exc_info=True)
            # Don't raise - event publishing should not break main functionality
