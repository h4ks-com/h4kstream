"""Centralized queue management service.

Provides unified operations for both user queue and radio playlist, eliminating code duplication across route handlers.
"""

import logging
import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from yt_dlp.utils import sanitize_filename

from app.models import SongItem
from app.services.event_publisher import EventPublisher
from app.services.mpd_service import MPDClient
from app.services.redis_service import RedisService
from app.services.redis_service import format_song_id
from app.services.youtube_dl import download_song
from app.settings import MUSIC_FALLBACK_DIR
from app.settings import MUSIC_USER_DIR
from app.settings import SONGS_DIR
from app.types import PlaylistType

logger = logging.getLogger(__name__)


async def add_song(
    playlist: PlaylistType,
    mpd_client: MPDClient,
    url: str | None = None,
    file: UploadFile | None = None,
    song_name: str | None = None,
    artist_name: str | None = None,
    redis_client: RedisService | None = None,
    user_id: str | None = None,
) -> str:
    """Add a song to the specified playlist.

    Unified implementation for:
    - Public user queue additions (with redis tracking)
    - Admin user queue additions (no redis tracking)
    - Admin radio playlist additions (no redis tracking)

    :param playlist: Target playlist ("user" or "radio")
    :param mpd_client: MPD client for the target playlist
    :param url: Optional YouTube/download URL
    :param file: Optional uploaded file
    :param song_name: Optional song name/title (used with file upload or to override metadata)
    :param artist_name: Optional artist name (used with file upload or to override metadata)
    :param redis_client: Optional Redis client (required for user queue with tracking)
    :param user_id: Optional user ID (required for user queue with tracking)
    :return: Prefixed song ID (u-{id} or f-{id})
    :raises ValueError: If both url and file provided, or neither provided
    :raises FileNotFoundInMPDError: If MPD can't find the added file
    """
    if url and file:
        raise ValueError("Cannot provide both URL and file")

    if not url and not file:
        raise ValueError("No valid URL or file provided")

    music_path = Path(MUSIC_USER_DIR if playlist == "user" else MUSIC_FALLBACK_DIR)
    filename = uuid4().hex + ".mp3"
    target_path = music_path / filename

    final_title = song_name
    final_artist = artist_name

    if url:
        result = await download_song(url)
        shutil.move(str(result.path), str(target_path))

        if not final_title:
            final_title = result.title
        if not final_artist:
            final_artist = result.artist
    elif file:
        song_path = Path(SONGS_DIR) / sanitize_filename(song_name or file.filename or filename)
        with open(song_path, "wb") as f:
            f.write(await file.read())
        shutil.move(str(song_path), str(target_path))

    await mpd_client.update_database()
    mpd_song_id = await mpd_client.add_local_song(target_path.name)

    if redis_client and user_id:
        await redis_client.add_user_song(user_id, str(mpd_song_id), target_path.name)
        await redis_client.map_song_to_user(str(mpd_song_id), user_id)
        await redis_client.increment_user_add_count(user_id)

    if redis_client:
        metadata = {
            "title": final_title,
            "artist": final_artist,
            "genre": None,
            "description": None,
        }
        await redis_client.set_metadata(playlist, metadata)

    if playlist == "user":
        await mpd_client.set_consume(True)
    else:
        await mpd_client.set_repeat(True)
        await mpd_client.set_random(True)

    await mpd_client.play()

    prefixed_id = format_song_id(mpd_song_id, playlist)
    logger.info(f"Added song to {playlist} playlist: {target_path.name} (ID: {prefixed_id})")

    # Publish song_changed event
    if redis_client:
        try:
            event_publisher = EventPublisher(redis_client.redis)
            await event_publisher.publish(
                event_type="song_changed",
                data={
                    "song_id": prefixed_id,
                    "playlist": playlist,
                    "title": final_title,
                    "artist": final_artist,
                },
                description=f"Song added to {playlist} queue: {final_title or target_path.name}",
            )
        except Exception as e:
            logger.error(f"Failed to publish song_changed event: {e}")

    return prefixed_id


async def delete_song(
    song_id: int,
    playlist: PlaylistType,
    mpd_client: MPDClient,
    redis_client: RedisService | None = None,
    user_id: str | None = None,
) -> None:
    """Delete a song from the specified playlist.

    :param song_id: MPD song ID to delete
    :param playlist: Target playlist ("user" or "radio")
    :param mpd_client: MPD client for the target playlist
    :param redis_client: Optional Redis client (for user queue tracking)
    :param user_id: Optional user ID (for user queue tracking)
    :raises SongNotFoundError: If song doesn't exist in MPD
    """
    await mpd_client.remove_song(song_id)

    # Remove from Redis tracking if user queue
    if redis_client and user_id:
        await redis_client.remove_user_song(user_id, str(song_id))

    logger.info(f"Deleted song {song_id} from {playlist} playlist")


async def list_songs(mpd_client: MPDClient, playlist: PlaylistType | None = None) -> list[SongItem]:
    """List all songs in the queue.

    :param mpd_client: MPD client for the target playlist
    :param playlist: Playlist type for ID prefixing (optional, defaults to no prefix)
    :return: List of songs in the queue
    """
    queue = await mpd_client.get_queue()
    songs = []
    for song in queue:
        if playlist:
            song["id"] = format_song_id(int(song["id"]), playlist)
        songs.append(SongItem(**song))
    return songs


async def clear_queue(mpd_client: MPDClient, playlist: PlaylistType) -> None:
    """Clear all songs from the queue.

    :param mpd_client: MPD client for the target playlist
    :param playlist: Target playlist type (for logging)
    """
    await mpd_client.clear_queue()
    logger.info(f"Cleared {playlist} playlist queue")


async def get_next_songs(user_mpd_client: MPDClient, radio_mpd_client: MPDClient, limit: int) -> list[SongItem]:
    """Get the next N songs from queues, prioritizing user queue and falling back to radio.

    :param user_mpd_client: MPD client for user queue
    :param radio_mpd_client: MPD client for radio playlist
    :param limit: Maximum number of songs to return (1-20)
    :return: List of upcoming songs (user queue first, then radio if needed)
    """
    user_songs = await list_songs(user_mpd_client, "user")

    if len(user_songs) >= limit:
        return user_songs[:limit]

    remaining = limit - len(user_songs)
    radio_songs = await list_songs(radio_mpd_client, "fallback")

    combined = user_songs + radio_songs[:remaining]

    logger.info(
        f"Returning {len(combined)} songs: {len(user_songs)} from user, {len(combined) - len(user_songs)} from radio"
    )
    return combined
