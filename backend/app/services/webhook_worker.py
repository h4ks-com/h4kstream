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

from app.services.event_publisher import EventPublisher
from app.services.livestream_service import LivestreamService
from app.services.mpd_service import MPDClient
from app.services.redis_service import RedisService
from app.services.redis_service import format_song_id
from app.services.webhook_delivery import deliver_webhook
from app.settings import settings

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


async def setup_mpd_instance(
    client: MPDClient, name: str, enable_repeat: bool = False, enable_random: bool = False
) -> None:
    """Setup and start MPD instance if it has songs in queue."""
    try:
        await client.connect()
        status = await client.get_status()
        queue_length = int(status.get("playlistlength", 0))

        if queue_length > 0:
            if enable_repeat:
                await client.set_repeat(True)
            if enable_random:
                await client.set_random(True)

            mode_info = []
            if enable_repeat:
                mode_info.append("looping")
            if enable_random:
                mode_info.append("random")
            mode_str = f", {' + '.join(mode_info)} enabled" if mode_info else ""

            logger.info(f"{name}: {queue_length} songs{mode_str}, starting playback")
            await client.play()
        else:
            logger.info(f"{name} empty")
    except (ConnectionError, TimeoutError, OSError) as e:
        logger.error(f"Failed to setup {name}: {e}", exc_info=True)
    finally:
        try:
            await client.disconnect()
        except (ConnectionError, OSError):
            logger.debug(f"Error disconnecting from {name} (likely already disconnected)")
        except Exception as e:
            logger.warning(f"Unexpected error disconnecting from {name}: {e}")


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
        self.user_mpd: MPDClient | None = None
        self.fallback_mpd: MPDClient | None = None

    async def initialize(self) -> None:
        """Initialize Redis connections and services."""
        self.redis_client = redis.from_url(self.redis_url)
        self.redis_service = RedisService(self.redis_url)
        self.livestream_service = LivestreamService(self.redis_client)
        self.event_publisher = EventPublisher(self.redis_client)

        # Initialize MPD clients
        self.user_mpd = MPDClient(host=settings.MPD_USER_HOST, port=settings.MPD_USER_PORT)
        self.fallback_mpd = MPDClient(host=settings.MPD_FALLBACK_HOST, port=settings.MPD_FALLBACK_PORT)

        # Resume playback for both MPD instances on startup
        await setup_mpd_instance(self.user_mpd, "User queue")
        await setup_mpd_instance(self.fallback_mpd, "Fallback playlist", enable_repeat=True, enable_random=True)

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
            "events:livestream_started",
            "events:livestream_ended",
            "events:queue_switched",
        ]
        await self.pubsub.subscribe(*event_channels)
        logger.info(f"Subscribed to event channels: {event_channels}")

        try:
            while not shutdown_event.is_set():
                # Check for messages with short timeout to allow shutdown
                try:
                    message = await asyncio.wait_for(
                        self.pubsub.get_message(ignore_subscribe_messages=True), timeout=1.0
                    )
                except TimeoutError:
                    continue
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

                if message and message["type"] == "message":
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

    async def mpd_monitor_loop(self, mpd_client: MPDClient, playlist: str) -> None:
        """Monitor MPD for song changes and publish events.

        Args:
            mpd_client: MPD client to monitor (user or fallback)
            playlist: Playlist type ("user" or "fallback")
        """
        logger.info(f"MPD monitor started for {playlist} playlist")
        current_song_id = None

        try:
            # Connect to MPD
            await mpd_client.connect()

            # Get initial current song
            try:
                current_song = await mpd_client.get_current_song()
                current_song_id = current_song.get("id") if current_song else None
                logger.info(f"Initial {playlist} song: {current_song_id}")
            except (ConnectionError, OSError, ValueError) as e:
                logger.error(f"Error getting initial {playlist} song: {e}")

            while not shutdown_event.is_set():
                try:
                    # Wait for player or playlist changes (with 30s timeout to allow shutdown)
                    try:
                        changes = await asyncio.wait_for(
                            mpd_client.idle(["player", "playlist"]), timeout=30.0
                        )
                        logger.debug(f"MPD {playlist} changes: {changes}")
                    except TimeoutError:
                        continue  # No changes, check shutdown and continue

                    # Get current song
                    current_song = await mpd_client.get_current_song()
                    new_song_id = current_song.get("id") if current_song else None

                    # Check if song changed
                    if new_song_id != current_song_id:
                        logger.info(
                            f"{playlist} song changed: {current_song_id} -> {new_song_id}"
                        )
                        current_song_id = new_song_id

                        if current_song and new_song_id is not None:
                            # Publish song_changed event
                            try:
                                prefixed_id = format_song_id(
                                    int(new_song_id), "user" if playlist == "user" else "fallback"
                                )
                                assert self.event_publisher is not None, "Event publisher not initialized"
                                await self.event_publisher.publish(
                                    event_type="song_changed",
                                    data={
                                        "song_id": prefixed_id,
                                        "playlist": playlist,
                                        "title": current_song.get("title", current_song.get("file")),
                                        "artist": current_song.get("artist"),
                                        "file": current_song.get("file"),
                                    },
                                    description=f"Song changed in {playlist} playlist",
                                )
                                logger.info(
                                    f"Published song_changed event for {playlist}: {prefixed_id}"
                                )
                            except (ConnectionError, OSError, ValueError, RuntimeError) as e:
                                logger.error(f"Error publishing song_changed event: {e}", exc_info=True)

                except asyncio.CancelledError:
                    break
                except (ConnectionError, OSError, ValueError, TimeoutError, MemoryError) as e:
                    logger.error(f"Connection error in {playlist} MPD monitor: {e}", exc_info=True)
                    # Try to reconnect
                    try:
                        await mpd_client.disconnect()
                    except (ConnectionError, OSError, ValueError):
                        pass
                    await asyncio.sleep(5)  # Wait before reconnect
                    try:
                        await mpd_client.connect()
                        logger.info(f"Reconnected to {playlist} MPD")
                    except (ConnectionError, OSError) as reconnect_error:
                        logger.error(f"Failed to reconnect to {playlist} MPD: {reconnect_error}")

        except asyncio.CancelledError:
            logger.info(f"MPD {playlist} monitor cancelled")
        finally:
            try:
                await mpd_client.disconnect()
            except (ConnectionError, OSError, ValueError):
                pass

    async def run(self) -> None:
        """Run webhook worker service (main entry point)."""
        logger.info("Starting webhook worker service...")

        await self.initialize()

        # Verify all services are initialized
        assert self.user_mpd is not None, "User MPD client not initialized"
        assert self.fallback_mpd is not None, "Fallback MPD client not initialized"

        # Start background tasks
        pubsub_task = asyncio.create_task(self.pubsub_listener())
        livestream_monitor_task = asyncio.create_task(self.livestream_monitor_loop())
        user_mpd_monitor_task = asyncio.create_task(self.mpd_monitor_loop(self.user_mpd, "user"))
        fallback_mpd_monitor_task = asyncio.create_task(
            self.mpd_monitor_loop(self.fallback_mpd, "fallback")
        )

        logger.info("Webhook worker running (Ctrl+C to stop)")

        # Wait for shutdown signal
        await shutdown_event.wait()

        logger.info("Shutting down webhook worker...")

        # Cancel tasks
        pubsub_task.cancel()
        livestream_monitor_task.cancel()
        user_mpd_monitor_task.cancel()
        fallback_mpd_monitor_task.cancel()

        # Wait for tasks to finish
        await asyncio.gather(
            pubsub_task,
            livestream_monitor_task,
            user_mpd_monitor_task,
            fallback_mpd_monitor_task,
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
