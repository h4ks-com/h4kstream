"""Webhook worker service - standalone microservice for event processing.

Subscribes to Redis Pub/Sub channels, delivers webhooks, and monitors livestreams.
Run as: python -m app.services.webhook_worker
"""

import asyncio
import json
import logging
import signal
import sys

import redis.asyncio as redis
from redis.exceptions import ConnectionError as RedisConnectionError

from app.db import init_db
from app.services.event_publisher import EventPublisher
from app.services.livestream_service import LivestreamService
from app.services.mpd_service import MPDClient
from app.services.redis_service import RedisService
from app.services.webhook_delivery import deliver_webhook
from app.settings import settings
from app.types import PlaylistType

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Global shutdown flag
shutdown_event = asyncio.Event()


def signal_handler(signum: int, frame: object) -> None:
    """Handle shutdown signals gracefully."""
    logger.info(f"Received signal {signum}, initiating graceful shutdown...")
    shutdown_event.set()


class WebhookWorker:
    """Webhook worker service for event processing and delivery."""

    def __init__(self) -> None:
        """Initialize webhook worker with Redis connections."""
        self.redis_url = f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}"
        self.redis_client: redis.Redis | None = None
        self.redis_service: RedisService | None = None
        self.pubsub: redis.client.PubSub | None = None
        self.livestream_service: LivestreamService | None = None
        self.event_publisher: EventPublisher | None = None
        self.mpd_user: MPDClient | None = None
        self.mpd_fallback: MPDClient | None = None

    async def initialize(self) -> None:
        """Initialize Redis connections and services."""
        init_db()
        logger.info("Database initialized")

        self.redis_client = redis.from_url(self.redis_url)
        self.redis_service = RedisService(self.redis_client)
        self.livestream_service = LivestreamService(self.redis_client)
        self.event_publisher = EventPublisher(self.redis_client)

        # Initialize MPD clients for metadata polling
        self.mpd_user = MPDClient(settings.MPD_USER_HOST, settings.MPD_USER_PORT)
        self.mpd_fallback = MPDClient(settings.MPD_FALLBACK_HOST, settings.MPD_FALLBACK_PORT)

        logger.info("Webhook worker initialized")

    async def cleanup(self) -> None:
        """Clean up Redis connections."""
        if self.pubsub:
            await self.pubsub.unsubscribe()
            await self.pubsub.close()

        if self.redis_service:
            await self.redis_service.close()

        if self.redis_client:
            await self.redis_client.close()

        logger.info("Webhook worker cleanup complete")

    async def process_event(self, event_type: str, event_payload: dict) -> None:
        """Process an event and deliver to subscribed webhooks.

        Args:
            event_type: Type of event (song_changed, livestream_started, etc.)
            event_payload: Full event payload from publisher
        """
        assert self.redis_service is not None, "RedisService not initialized"

        try:
            # Get all webhooks subscribed to this event
            webhook_ids = await self.redis_service.get_webhooks_for_event(event_type)

            if not webhook_ids:
                logger.debug(f"No webhooks subscribed to {event_type}")
                return

            logger.info(f"Processing {event_type} event for {len(webhook_ids)} webhooks")

            # Deliver to all subscribed webhooks concurrently
            tasks = []
            for webhook_id in webhook_ids:
                config = await self.redis_service.get_webhook(webhook_id)
                if not config:
                    logger.warning(f"Webhook {webhook_id} config not found, skipping")
                    continue

                task = deliver_webhook(
                    webhook_id=webhook_id,
                    url=config["url"],
                    signing_key=config["signing_key"],
                    payload=event_payload,
                    redis=self.redis_service,
                )
                tasks.append(task)

            # Deliver all webhooks concurrently (fire and forget, log errors)
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Log any delivery failures
            success_count = sum(1 for r in results if not isinstance(r, Exception))
            failure_count = len(results) - success_count
            logger.info(f"{event_type}: {success_count} successful, {failure_count} failed")

        except Exception as e:
            logger.error(f"Error processing {event_type} event: {e}", exc_info=True)

    async def pubsub_listener(self) -> None:
        """Listen to Redis Pub/Sub channels for events."""
        assert self.redis_client is not None, "Redis client not initialized"
        self.pubsub = self.redis_client.pubsub()

        # Subscribe to all event channels
        event_channels = [
            "events:song_changed",
            "events:song_added",
            "events:livestream_started",
            "events:livestream_ended",
            "events:queue_switched",
        ]
        await self.pubsub.subscribe(*event_channels)
        logger.info(f"Subscribed to event channels: {event_channels}")

        try:
            while not shutdown_event.is_set():
                try:
                    # Use async for to avoid busy-waiting
                    async for message in self.pubsub.listen():
                        if shutdown_event.is_set():
                            break

                        if message["type"] == "subscribe":
                            continue

                        if message["type"] == "message":
                            channel = message["channel"].decode()
                            data = message["data"].decode()

                            try:
                                event_payload = json.loads(data)
                                event_type = event_payload.get("event_type")

                                logger.debug(f"Received {event_type} event from {channel}")

                                # Process event asynchronously
                                asyncio.create_task(self.process_event(event_type, event_payload))

                            except json.JSONDecodeError as e:
                                logger.error(f"Failed to decode event payload: {e}")

                except (RedisConnectionError, ConnectionError, OSError) as e:
                    logger.error(f"Redis connection error in pubsub listener: {e}")
                    await asyncio.sleep(5)  # Wait before reconnecting
                    try:
                        # Try to reconnect
                        self.pubsub = self.redis_client.pubsub()
                        await self.pubsub.subscribe(*event_channels)
                        logger.info("Reconnected to Redis pub/sub")
                    except Exception as reconnect_error:
                        logger.error(f"Failed to reconnect pubsub: {reconnect_error}")
                    continue

        except asyncio.CancelledError:
            logger.info("Pub/Sub listener cancelled")
        except Exception as e:
            logger.error(f"Error in pub/sub listener: {e}", exc_info=True)

    async def livestream_monitor_loop(self) -> None:
        """Monitor and enforce livestream time limits (moved from main.py)."""
        assert self.livestream_service is not None, "Livestream service not initialized"
        logger.info("Livestream monitor started")

        try:
            while not shutdown_event.is_set():
                try:
                    await self.livestream_service.check_and_enforce_time_limit()
                except (RedisConnectionError, ConnectionError, OSError, TimeoutError) as e:
                    logger.error(f"Connection error in livestream monitor: {e}", exc_info=True)
                    await asyncio.sleep(5)  # Wait before retry
                except Exception as e:
                    logger.error(f"Error in livestream monitor: {e}", exc_info=True)

                # Wait 10 seconds before next check (allow early exit on shutdown)
                try:
                    await asyncio.wait_for(shutdown_event.wait(), timeout=10.0)
                    break  # Shutdown requested
                except TimeoutError:
                    continue  # Continue monitoring

        except asyncio.CancelledError:
            logger.info("Livestream monitor cancelled")

    async def mpd_monitor_loop(self, source_name: PlaylistType, mpd_client: MPDClient) -> None:
        """Monitor MPD for song changes and publish events respecting source priority.

        Only publishes events when:
        1. This source is the highest priority active source
        2. The MPD player is actually in PLAYING state (not paused/stopped)
        3. The song ID has changed
        """
        assert self.redis_service is not None, "RedisService not initialized"
        assert self.event_publisher is not None, "EventPublisher not initialized"

        logger.info(f"MPD monitor started for {source_name} playlist")
        last_song_id: str | None = None

        # Create dedicated MPD client for priority checking (separate from main monitor client)
        check_client = MPDClient(settings.MPD_USER_HOST, settings.MPD_USER_PORT)

        try:
            while not shutdown_event.is_set():
                try:
                    # Use shared priority logic to determine active source
                    active_source = await self.redis_service.determine_active_source(
                        user_mpd_client=check_client,
                        check_user_playing=True,  # Check if user is actually PLAYING, not just has songs
                    )

                    # Only proceed if THIS source is the active one
                    if active_source != source_name:
                        await asyncio.sleep(2)
                        continue

                    # Get current song and playback status from THIS MPD
                    await mpd_client.connect()
                    status = await mpd_client.get_status()
                    current_song = await mpd_client.get_current_song()
                    await mpd_client.disconnect()

                    # Only publish if actually PLAYING (not paused/stopped)
                    if status.get("state") != "play":
                        await asyncio.sleep(2)
                        continue

                    if not current_song or not current_song.get("file"):
                        await asyncio.sleep(2)
                        continue

                    current_song_id = current_song.get("id")
                    if current_song_id and current_song_id != last_song_id:
                        last_song_id = current_song_id

                        # Extract metadata from MPD
                        title = current_song.get("title") or current_song.get("file", "Unknown")
                        artist = current_song.get("artist")
                        genre = current_song.get("genre")

                        # Check Redis for metadata overrides (from custom add endpoints)
                        overrides = await self.redis_service.get_song_metadata(source_name, str(current_song_id))
                        if overrides:
                            if "title" in overrides:
                                title = overrides["title"]
                            if "artist" in overrides:
                                artist = overrides["artist"]

                        # Store metadata in Redis
                        metadata = {
                            "title": title,
                            "artist": artist,
                            "genre": genre,
                            "description": None,
                        }
                        await self.redis_service.set_metadata(source_name, metadata)
                        await self.redis_service.set_active_source(source_name)

                        # Publish song_changed event
                        description = f"Playing next: {title}"
                        if artist:
                            description += f" by {artist}"

                        await self.event_publisher.publish(
                            event_type="song_changed",
                            data={
                                "playlist": source_name,
                                "title": title,
                                "artist": artist,
                                "genre": genre,
                            },
                            description=description,
                        )
                        logger.info(f"Published song_changed for {source_name}: {title} - {artist}")

                except (RedisConnectionError, ConnectionError, OSError, TimeoutError) as e:
                    logger.error(f"Connection error in {source_name} MPD monitor: {e}", exc_info=True)
                    await asyncio.sleep(5)
                except Exception as e:
                    logger.error(f"Error in {source_name} MPD monitor: {e}", exc_info=True)

                await asyncio.sleep(2)

        except asyncio.CancelledError:
            logger.info(f"MPD monitor cancelled for {source_name}")

    async def run(self) -> None:
        """Run webhook worker service (main entry point).

        Listens for Redis pub/sub events, delivers webhooks, and monitors MPD for song changes.
        """
        logger.info("Starting webhook worker service...")

        await self.initialize()

        # Start background tasks
        pubsub_task = asyncio.create_task(self.pubsub_listener())
        livestream_monitor_task = asyncio.create_task(self.livestream_monitor_loop())

        # Start MPD monitoring tasks with priority checking
        assert self.mpd_user is not None
        assert self.mpd_fallback is not None
        mpd_user_monitor_task = asyncio.create_task(self.mpd_monitor_loop("user", self.mpd_user))
        mpd_fallback_monitor_task = asyncio.create_task(self.mpd_monitor_loop("fallback", self.mpd_fallback))

        logger.info("Webhook worker running with MPD monitors (Ctrl+C to stop)")

        # Wait for shutdown signal
        await shutdown_event.wait()

        logger.info("Shutting down webhook worker...")

        pubsub_task.cancel()
        livestream_monitor_task.cancel()
        mpd_user_monitor_task.cancel()
        mpd_fallback_monitor_task.cancel()
        await asyncio.gather(
            pubsub_task,
            livestream_monitor_task,
            mpd_user_monitor_task,
            mpd_fallback_monitor_task,
            return_exceptions=True,
        )

        # Cleanup
        await self.cleanup()

        logger.info("Webhook worker stopped")


async def main() -> None:
    """Main entry point for webhook worker."""
    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    worker = WebhookWorker()

    try:
        await worker.run()
    except Exception as e:
        logger.error(f"Fatal error in webhook worker: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
