from __future__ import annotations

import json
import logging
from datetime import UTC
from datetime import datetime

import redis.asyncio as redis

from app.types import PlaylistType

logger = logging.getLogger(__name__)


def format_song_id(mpd_id: int, playlist: PlaylistType) -> str:
    """Format MPD song ID with playlist prefix."""
    prefix = "u" if playlist == "user" else "f"
    return f"{prefix}-{mpd_id}"


def parse_song_id(song_id: str) -> tuple[int, PlaylistType]:
    """Parse prefixed song ID to MPD ID and playlist type."""
    if not song_id or "-" not in song_id:
        raise ValueError(f"Invalid song ID format: {song_id}")

    prefix, mpd_id_str = song_id.split("-", 1)

    playlist: PlaylistType
    if prefix == "u":
        playlist = "user"
    elif prefix == "f":
        playlist = "fallback"
    else:
        raise ValueError(f"Invalid song ID prefix: {prefix}")

    try:
        mpd_id = int(mpd_id_str)
    except ValueError:
        raise ValueError(f"Invalid MPD ID in song_id: {mpd_id_str}")

    return mpd_id, playlist


class RedisService:
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.redis = redis.from_url(self.redis_url)

    async def close(self):
        """Close the Redis connection."""
        await self.redis.close()

    async def set_value(self, key: str, value: dict, ttl: int = 3600):
        """Set a key-value pair in Redis with optional TTL.

        :param key: Redis key
        :param value: Dictionary value to store in Redis
        :param ttl: Time to live in seconds (default 1 hour)
        """
        await self.redis.setex(key, ttl, json.dumps(value))

    async def get(self, key: str) -> dict | None:
        """Get the value from Redis and return it as a dictionary.

        :param key: Redis key
        :return: Parsed dictionary or None
        """
        value = await self.redis.get(key)
        if value:
            return json.loads(value)
        return None

    async def delete(self, key: str):
        """Delete a key from Redis."""
        await self.redis.delete(key)

    async def add_user_song(self, user_id: str, song_id: str, song_filename: str) -> None:
        """Track a song added by a user (for queue limits)."""
        key = f"user:{user_id}:songs"
        await self.redis.sadd(key, f"{song_id}:{song_filename}")
        await self.redis.expire(key, 86400)

    async def remove_user_song(self, user_id: str, song_id: str) -> None:
        """Remove a song from user's tracked songs."""
        key = f"user:{user_id}:songs"
        songs = await self.redis.smembers(key)
        for song in songs:
            if song.decode().startswith(f"{song_id}:"):
                await self.redis.srem(key, song)
                break

    async def get_user_song_count(self, user_id: str) -> int:
        """Get count of songs currently in queue for user."""
        key = f"user:{user_id}:songs"
        return await self.redis.scard(key)

    async def get_user_songs(self, user_id: str) -> list[dict[str, str]]:
        """Get all songs added by user with their song_ids and filenames."""
        key = f"user:{user_id}:songs"
        songs = await self.redis.smembers(key)
        result = []
        for song in songs:
            parts = song.decode().split(":", 1)
            if len(parts) == 2:
                result.append({"song_id": parts[0], "filename": parts[1]})
        return result

    async def map_song_to_user(self, song_id: str, user_id: str) -> None:
        """Map a song_id to user_id for cleanup tracking."""
        await self.redis.setex(f"song:{song_id}:user", 86400, user_id)

    async def increment_user_add_count(self, user_id: str) -> int:
        """Increment and return total add requests count for user (lifetime counter)."""
        key = f"user:{user_id}:add_count"
        count = await self.redis.incr(key)
        await self.redis.expire(key, 86400)
        return count

    async def get_user_add_count(self, user_id: str) -> int:
        """Get total add requests count for user."""
        key = f"user:{user_id}:add_count"
        count = await self.redis.get(key)
        return int(count) if count else 0

    async def set_metadata(self, source: str, metadata: dict) -> None:
        """Set metadata for a source (user, fallback, livestream)."""
        key = f"metadata:{source}"
        await self.redis.set(key, json.dumps(metadata))

    async def get_metadata(self, source: str) -> dict | None:
        """Get metadata for a source."""
        key = f"metadata:{source}"
        value = await self.redis.get(key)
        if value:
            return json.loads(value)
        return None

    async def set_active_source(self, source: str) -> None:
        """Set the currently active audio source."""
        await self.redis.set("metadata:active_source", source)

    async def get_active_source(self) -> str | None:
        """Get the currently active audio source."""
        value = await self.redis.get("metadata:active_source")
        return value.decode() if value else None

    async def set_livestream_active(self, ttl_seconds: int = 10) -> None:
        """Mark livestream as active with TTL."""
        result = await self.redis.setex("livestream:active_flag", ttl_seconds, "1")
        # Verify it was set
        check = await self.redis.get("livestream:active_flag")
        logger.info(f"Set livestream:active_flag with TTL {ttl_seconds}, result={result}, check={check}")

    async def is_livestream_active(self) -> bool:
        """Check if livestream is currently active."""
        value = await self.redis.get("livestream:active_flag")
        return value is not None

    async def clear_livestream_active(self) -> None:
        """Clear livestream active flag."""
        await self.redis.delete("livestream:active_flag")

    async def get_now_playing(self) -> dict:
        """Get current playing information (active source + its metadata)."""
        livestream_active = await self.is_livestream_active()
        if livestream_active:
            metadata = await self.get_metadata("livestream")
            return {"source": "livestream", "metadata": metadata or {}}

        active_source = await self.get_active_source()
        if not active_source or active_source == "livestream":
            active_source = "fallback"

        metadata = await self.get_metadata(active_source)
        return {"source": active_source, "metadata": metadata or {}}

    # =========================================================================
    # Webhook Methods
    # =========================================================================

    async def create_webhook(self, webhook_id: str, config: dict) -> None:
        """Store webhook configuration.

        Args:
            webhook_id: Unique webhook identifier
            config: Webhook configuration (url, events, signing_key, description, created_at)
        """
        await self.redis.hset("webhooks:subscriptions", webhook_id, json.dumps(config))

    async def get_webhook(self, webhook_id: str) -> dict | None:
        """Get webhook configuration by ID.

        Args:
            webhook_id: Webhook identifier

        Returns:
            Webhook configuration dict or None if not found
        """
        config_json = await self.redis.hget("webhooks:subscriptions", webhook_id)
        if config_json:
            return json.loads(config_json)
        return None

    async def delete_webhook(self, webhook_id: str) -> None:
        """Delete webhook subscription.

        Args:
            webhook_id: Webhook identifier
        """
        await self.redis.hdel("webhooks:subscriptions", webhook_id)

    async def list_webhooks(self) -> dict[str, dict]:
        """List all webhook subscriptions.

        Returns:
            Dict mapping webhook_id to config dict
        """
        all_webhooks = await self.redis.hgetall("webhooks:subscriptions")
        return {webhook_id.decode(): json.loads(config_json) for webhook_id, config_json in all_webhooks.items()}

    async def find_webhook_by_url_and_events(self, url: str, events: list[str]) -> tuple[str, dict] | None:
        """Find existing webhook with same URL and events.

        Args:
            url: Webhook URL
            events: List of event types

        Returns:
            Tuple of (webhook_id, config) if found, None otherwise
        """
        all_webhooks = await self.list_webhooks()
        sorted_events = sorted(events)

        logger.info(f"Finding webhook: url={url}, events={sorted_events}")
        logger.info(f"All webhooks: {all_webhooks}")

        for webhook_id, config in all_webhooks.items():
            logger.info(
                f"Checking webhook {webhook_id}: url_match={config['url'] == url}, "
                f"events={sorted(config['events'])}, events_match={sorted(config['events']) == sorted_events}"
            )
            if config["url"] == url and sorted(config["events"]) == sorted_events:
                return (webhook_id, config)

        return None

    async def add_webhook_to_event(self, event_type: str, webhook_id: str) -> None:
        """Add webhook to event subscription index.

        Args:
            event_type: Event type (song_changed, livestream_started, etc.)
            webhook_id: Webhook identifier
        """
        key = f"webhooks:events:{event_type}"
        await self.redis.sadd(key, webhook_id)

    async def remove_webhook_from_event(self, event_type: str, webhook_id: str) -> None:
        """Remove webhook from event subscription index.

        Args:
            event_type: Event type
            webhook_id: Webhook identifier
        """
        key = f"webhooks:events:{event_type}"
        await self.redis.srem(key, webhook_id)

    async def get_webhooks_for_event(self, event_type: str) -> set[str]:
        """Get all webhook IDs subscribed to an event.

        Args:
            event_type: Event type

        Returns:
            Set of webhook IDs
        """
        key = f"webhooks:events:{event_type}"
        webhook_ids = await self.redis.smembers(key)
        return {wid.decode() for wid in webhook_ids}

    async def log_webhook_delivery(
        self,
        webhook_id: str,
        event_type: str,
        url: str,
        status: str,
        status_code: int | None = None,
        error: str | None = None,
        payload: dict | None = None,
    ) -> None:
        """Log webhook delivery attempt.

        Args:
            webhook_id: Webhook identifier
            event_type: Event type delivered
            url: Destination URL
            status: Delivery status (success or failed)
            status_code: HTTP status code (if applicable)
            error: Error message (if failed)
            payload: Event payload sent (optional, for debugging)
        """
        timestamp = datetime.now(UTC).isoformat()
        log_entry = {
            "webhook_id": webhook_id,
            "event_type": event_type,
            "url": url,
            "status": status,
            "status_code": status_code,
            "error": error,
            "timestamp": timestamp,
        }

        key = f"webhooks:delivery:{webhook_id}:{timestamp}"
        await self.redis.setex(key, 604800, json.dumps(log_entry))  # 7-day TTL

    async def get_webhook_deliveries(self, webhook_id: str, limit: int = 100) -> list[dict]:
        """Get recent delivery logs for a webhook.

        Args:
            webhook_id: Webhook identifier
            limit: Maximum number of logs to return

        Returns:
            List of delivery log dicts, sorted by timestamp (newest first)
        """
        pattern = f"webhooks:delivery:{webhook_id}:*"
        keys = []
        async for key in self.redis.scan_iter(match=pattern, count=1000):
            keys.append(key)

        # Sort keys by timestamp (newest first)
        keys = sorted(keys, reverse=True)[:limit]

        deliveries = []
        for key in keys:
            log_json = await self.redis.get(key)
            if log_json:
                deliveries.append(json.loads(log_json))

        return deliveries
