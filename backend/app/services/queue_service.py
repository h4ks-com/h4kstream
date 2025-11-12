"""Centralized queue management service.

Provides unified operations for both user queue and radio playlist, eliminating code duplication across route handlers.
"""

import logging
import os
import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from sqlmodel import Session
from sqlmodel import select
from yt_dlp.utils import sanitize_filename

from app.db.models import FileCache
from app.models import SongAddedEventData
from app.models import SongItem
from app.services import cache_service
from app.services.event_publisher import EventPublisher
from app.services.ffmpeg import get_duration
from app.services.mpd_service import MPDClient
from app.services.redis_service import RedisService
from app.services.redis_service import format_song_id
from app.services.youtube_dl import download_song
from app.services.youtube_dl import get_video_info
from app.settings import get_music_fallback_dir
from app.settings import get_music_user_dir
from app.settings import get_songs_dir
from app.settings import settings
from app.types import PlaylistType

logger = logging.getLogger(__name__)


async def validate_file_size(file: UploadFile, max_size_mb: int) -> None:
    """Validate uploaded file size.

    :param file: Uploaded file
    :param max_size_mb: Maximum allowed file size in MB
    :raises ValueError: If file exceeds size limit
    """
    # Read file to check size
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)

    # Reset file pointer for later reading
    await file.seek(0)

    if size_mb > max_size_mb:
        raise ValueError(f"File size ({size_mb:.1f}MB) exceeds maximum allowed size ({max_size_mb}MB)")


async def validate_song_duration(file_path: Path, max_duration_seconds: int) -> None:
    """Validate song duration using ffprobe.

    :param file_path: Path to audio file
    :param max_duration_seconds: Maximum allowed duration in seconds
    :raises ValueError: If duration exceeds limit or cannot be determined
    """
    try:
        duration = await get_duration(file_path)
        if duration > max_duration_seconds:
            max_minutes = max_duration_seconds / 60
            actual_minutes = duration / 60
            raise ValueError(
                f"Song duration ({actual_minutes:.1f} min) exceeds maximum allowed duration ({max_minutes:.0f} min)"
            )
    except Exception as e:
        logger.error(f"Failed to get duration for {file_path}: {e}")
        raise ValueError(f"Failed to validate song duration: {e}")


async def check_duplicate_in_queue(
    song_name: str | None,
    artist_name: str | None,
    user_mpd: MPDClient,
    fallback_mpd: MPDClient,
    check_limit: int,
    redis_client: RedisService | None = None,
) -> bool:
    """Check if song already exists in the next N songs of combined queue.

    :param song_name: Song title
    :param artist_name: Artist name
    :param user_mpd: User queue MPD client (must be connected)
    :param fallback_mpd: Fallback queue MPD client (must be connected)
    :param check_limit: Number of songs to check in combined queue
    :param redis_client: Optional Redis client for fetching metadata overrides
    :return: True if duplicate found, False otherwise
    """
    if not song_name:
        # Can't detect duplicates without song name
        return False

    # Get next songs from combined queue (reuse existing logic)
    next_songs = await get_next_songs(user_mpd, fallback_mpd, check_limit, redis_client)

    # Normalize for comparison
    normalized_song = song_name.lower().strip()
    normalized_artist = artist_name.lower().strip() if artist_name else ""

    for song in next_songs:
        existing_title = (song.title or "").lower().strip()
        existing_artist = (song.artist or "").lower().strip()

        # Match if title matches and artist matches (or no artist info)
        if existing_title == normalized_song:
            if not normalized_artist or not existing_artist or existing_artist == normalized_artist:
                return True

    return False


async def add_song(
    playlist: PlaylistType,
    mpd_client: MPDClient,
    db_session: Session | None = None,
    url: str | None = None,
    file: UploadFile | None = None,
    song_name: str | None = None,
    artist_name: str | None = None,
    reference_url: str | None = None,
    redis_client: RedisService | None = None,
    user_id: str | None = None,
    skip_validation: bool = False,
    user_mpd_client: MPDClient | None = None,
    fallback_mpd_client: MPDClient | None = None,
) -> str:
    """Add a song to the specified playlist.

    Unified implementation for:
    - Public user queue additions (with redis tracking and validation)
    - Admin user queue additions (no redis tracking, no validation)
    - Admin radio playlist additions (no redis tracking, no validation)

    :param playlist: Target playlist ("user" or "radio")
    :param mpd_client: MPD client for the target playlist
    :param url: Optional YouTube/download URL
    :param file: Optional uploaded file
    :param song_name: Optional song name/title (used with file upload or to override metadata)
    :param artist_name: Optional artist name (used with file upload or to override metadata)
    :param reference_url: Optional user-facing reference URL for clickable links
    :param redis_client: Optional Redis client (required for user queue with tracking)
    :param user_id: Optional user ID (required for user queue with tracking)
    :param skip_validation: If True, skip duration, file size, and duplicate validation (admin uploads)
    :param user_mpd_client: User MPD client for duplicate checking (required if not skip_validation)
    :param fallback_mpd_client: Fallback MPD client for duplicate checking (required if not skip_validation)
    :return: Prefixed song ID (u-{id} or f-{id})
    :raises ValueError: If both url and file provided, or neither provided, or validation fails
    :raises FileNotFoundInMPDError: If MPD can't find the added file
    """
    if url and file:
        raise ValueError("Cannot provide both URL and file")

    if not url and not file:
        raise ValueError("No valid URL or file provided")

    music_path = Path(get_music_user_dir() if playlist == "user" else get_music_fallback_dir())
    filename = uuid4().hex + ".mp3"
    target_path = music_path / filename

    final_title = song_name
    final_artist = artist_name

    # Temporary path for validation
    temp_path: Path | None = None
    md5_hash: str | None = None
    cache_hit = False

    try:
        if url:
            # Check cache by URL first
            if db_session:
                cached_entry = await cache_service.lookup_by_url(db_session, url, playlist)
                if cached_entry:
                    logger.info(f"Using cached file for URL: {url}")
                    cached_path = Path(cached_entry.filepath)
                    shutil.copy2(str(cached_path), str(target_path))
                    cache_hit = True
                    temp_path = target_path

                    md5_hash = cached_entry.md5_hash

            if not cache_hit:
                # Check video info before downloading to fail early
                if not skip_validation:
                    video_info = await get_video_info(url)
                    video_duration = video_info.get("duration", 0)
                    if video_duration > settings.MAX_SONG_DURATION_SECONDS:
                        max_minutes = settings.MAX_SONG_DURATION_SECONDS / 60
                        actual_minutes = video_duration / 60
                        raise ValueError(
                            f"Song duration ({actual_minutes:.1f} min) exceeds maximum allowed duration ({max_minutes:.0f} min)"
                        )

                result = await download_song(url)
                temp_path = Path(result.path)
                md5_hash = result.md5_before_trim

                if not final_title:
                    final_title = result.title
                if not final_artist:
                    final_artist = result.artist
        elif file:
            # Validate file size first (before writing)
            if not skip_validation:
                await validate_file_size(file, settings.MAX_FILE_SIZE_MB)

            file_temp_path = Path(get_songs_dir()) / sanitize_filename(song_name or file.filename or filename)
            content = await file.read()
            with open(file_temp_path, "wb") as f:
                f.write(content)
            temp_path = file_temp_path

            # Calculate MD5 for file uploads
            md5_hash = await cache_service.calculate_md5(temp_path)

            # Check cache by MD5 hash
            if db_session:
                cached_entry = await cache_service.lookup_by_hash(db_session, md5_hash, playlist)
                if cached_entry:
                    logger.info(f"Using cached file for hash: {md5_hash}")
                    cached_path = Path(cached_entry.filepath)

                    if temp_path.exists():
                        os.unlink(temp_path)

                    shutil.copy2(str(cached_path), str(target_path))
                    cache_hit = True
                    temp_path = target_path

        # Validation checks (skip for admin uploads)
        if not skip_validation:
            if not temp_path:
                raise ValueError("No file to validate")

            if not user_mpd_client or not fallback_mpd_client:
                raise ValueError("MPD clients required for duplicate validation")

            # Validate duration (always validate actual file for defense in depth)
            await validate_song_duration(temp_path, settings.MAX_SONG_DURATION_SECONDS)

            # Check for duplicates in combined queue
            is_duplicate = await check_duplicate_in_queue(
                final_title,
                final_artist,
                user_mpd_client,
                fallback_mpd_client,
                settings.DUPLICATE_CHECK_LIMIT,
                redis_client,
            )
            if is_duplicate:
                raise ValueError(
                    f"Song '{final_title}' by '{final_artist or 'Unknown'}' is already in the next {settings.DUPLICATE_CHECK_LIMIT} songs"
                )

        # Move to final location (skip if cache hit already placed file there)
        if not cache_hit:
            if not temp_path:
                raise ValueError("No file to process")

            # Ensure target directory exists
            target_path.parent.mkdir(parents=True, exist_ok=True)

            shutil.move(str(temp_path), str(target_path))
            temp_path = None

            # Create cache entry for newly processed file
            if db_session and md5_hash:
                try:
                    await cache_service.create_cache_entry(
                        db_session,
                        target_path,
                        md5_hash,
                        playlist,
                        origin_url=url if url else None,
                        reference_url=reference_url,
                    )
                except Exception as e:
                    logger.warning(f"Failed to create cache entry: {e}")
    except Exception:
        # Clean up temp file on error
        if temp_path and temp_path.exists():
            try:
                os.unlink(temp_path)
            except Exception as cleanup_error:
                logger.error(f"Failed to clean up temp file {temp_path}: {cleanup_error}")
        raise

    await mpd_client.update_database()
    mpd_song_id = await mpd_client.add_local_song(target_path.name)

    if redis_client and user_id:
        await redis_client.add_user_song(user_id, str(mpd_song_id), target_path.name)
        await redis_client.map_song_to_user(str(mpd_song_id), user_id)
        await redis_client.increment_user_add_count(user_id)

    if redis_client:
        # Store per-song metadata overrides if provided
        if song_name or artist_name:
            await redis_client.set_song_metadata(playlist, str(mpd_song_id), final_title, final_artist)

        # Only set metadata if livestream is not active
        # Liquidsoap will handle all metadata updates via /internal/metadata/update
        livestream_active = await redis_client.is_livestream_active()
        if not livestream_active:
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

    # Only start playback if there's no active livestream
    # to avoid disrupting the live stream
    if redis_client:
        livestream_active = await redis_client.is_livestream_active()
        if not livestream_active:
            await mpd_client.play()
            logger.info(f"Started playback for {playlist} playlist (no livestream active)")
        else:
            logger.info(f"Skipped playback for {playlist} playlist (livestream active)")
    else:
        # Fallback: play if no redis_client available (shouldn't happen in practice)
        await mpd_client.play()

    prefixed_id = format_song_id(mpd_song_id, playlist)
    logger.info(f"Added song to {playlist} playlist: {target_path.name} (ID: {prefixed_id})")

    # Only publish song_added webhook if no active livestream
    # During livestream, queue additions are silent (no playback, no webhooks)
    if redis_client:
        livestream_active = await redis_client.is_livestream_active()
        if not livestream_active:
            try:
                event_publisher = EventPublisher(redis_client.redis)
                event_data = SongAddedEventData(
                    song_id=prefixed_id,
                    playlist=playlist,
                    title=final_title,
                    artist=final_artist,
                )
                await event_publisher.publish(
                    event_type="song_added",
                    data=event_data.model_dump(),
                    description=f"Song added to {playlist} queue: {final_title or target_path.name}",
                )
            except Exception as e:
                logger.error(f"Failed to publish song_added event: {e}")
        else:
            logger.info(f"Skipped song_added webhook for {playlist} (livestream active)")

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


async def list_songs(
    mpd_client: MPDClient,
    playlist: PlaylistType | None = None,
    redis_client: RedisService | None = None,
    db_session: Session | None = None,
) -> list[SongItem]:
    """List all songs in the queue.

    :param mpd_client: MPD client for the target playlist
    :param playlist: Playlist type for ID prefixing (optional, defaults to no prefix)
    :param redis_client: Optional Redis client for fetching metadata overrides
    :param db_session: Optional database session for fetching cache metadata (reference_url)
    :return: List of songs in the queue
    """
    queue = await mpd_client.get_queue()
    songs = []
    for song in queue:
        mpd_song_id = int(song["id"])

        # Check for Redis metadata overrides if available
        if redis_client and playlist:
            overrides = await redis_client.get_song_metadata(playlist, str(mpd_song_id))
            if overrides:
                # Apply overrides - Redis data takes precedence over MPD data
                if "title" in overrides:
                    song["title"] = overrides["title"]
                if "artist" in overrides:
                    song["artist"] = overrides["artist"]

        # Look up reference_url from FileCache if available
        song["reference_url"] = None
        if db_session and playlist:
            music_root = Path(get_music_user_dir() if playlist == "user" else get_music_fallback_dir())
            file_path = song.get("file", "")
            if file_path:
                full_path = str(music_root / file_path)
                statement = select(FileCache).where(FileCache.filepath == full_path)
                cache_entry = db_session.exec(statement).first()
                if cache_entry and cache_entry.reference_url:
                    song["reference_url"] = cache_entry.reference_url

        if playlist:
            song["id"] = format_song_id(mpd_song_id, playlist)
            song["playlist"] = playlist
        else:
            song["playlist"] = "user"  # Default fallback
        songs.append(SongItem(**song))
    return songs


async def clear_queue(mpd_client: MPDClient, playlist: PlaylistType) -> None:
    """Clear all songs from the queue.

    :param mpd_client: MPD client for the target playlist
    :param playlist: Target playlist type (for logging)
    """
    await mpd_client.clear_queue()
    logger.info(f"Cleared {playlist} playlist queue")


async def get_next_songs(
    user_mpd_client: MPDClient,
    radio_mpd_client: MPDClient,
    limit: int,
    redis_client: RedisService | None = None,
    db_session: Session | None = None,
) -> list[SongItem]:
    """Get the next N songs from queues, prioritizing user queue and falling back to radio.

    :param user_mpd_client: MPD client for user queue
    :param radio_mpd_client: MPD client for radio playlist
    :param limit: Maximum number of songs to return (1-20)
    :param redis_client: Optional Redis client for fetching metadata overrides
    :param db_session: Optional database session for fetching cache metadata (reference_url)
    :return: List of upcoming songs (user queue first, then radio if needed)
    """
    user_songs = await list_songs(user_mpd_client, "user", redis_client, db_session)

    if len(user_songs) >= limit:
        return user_songs[:limit]

    remaining = limit - len(user_songs)
    radio_songs = await list_songs(radio_mpd_client, "fallback", redis_client, db_session)

    combined = user_songs + radio_songs[:remaining]

    logger.info(
        f"Returning {len(combined)} songs: {len(user_songs)} from user, {len(combined) - len(user_songs)} from radio"
    )
    return combined
