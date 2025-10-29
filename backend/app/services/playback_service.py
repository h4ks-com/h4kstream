"""Centralized playback control service.

Provides unified play/pause/resume operations for both user queue and radio playlist.
"""

import logging

from app.services.mpd_service import MPDClient
from app.settings import settings
from app.types import PlaybackAction
from app.types import PlaylistType

logger = logging.getLogger(__name__)


def get_mpd_client(playlist: PlaylistType) -> MPDClient:
    """Factory function to get the appropriate MPD client.

    :param playlist: Target playlist ("user" or "radio")
    :return: MPDClient instance for the specified playlist
    """
    if playlist == "user":
        return MPDClient(settings.MPD_USER_HOST, settings.MPD_USER_PORT)
    else:
        return MPDClient(settings.MPD_FALLBACK_HOST, settings.MPD_FALLBACK_PORT)


async def control_playback(action: PlaybackAction, playlist: PlaylistType) -> None:
    """Control playback for the specified playlist.

    Single entry point for all playback operations (play, pause, resume).

    :param action: Playback action ("play", "pause", or "resume")
    :param playlist: Target playlist ("user" or "radio")
    """
    client = get_mpd_client(playlist)

    try:
        await client.connect()

        if action == "play":
            # Enable repeat and random for radio playlist
            if playlist == "radio":
                await client.set_repeat(True)
                await client.set_random(True)
            await client.play()
            logger.info(f"Started playback on {playlist} playlist")

        elif action == "pause":
            await client.pause()
            logger.info(f"Paused playback on {playlist} playlist")

        elif action == "resume":
            await client.resume()
            logger.info(f"Resumed playback on {playlist} playlist")

    finally:
        await client.disconnect()
