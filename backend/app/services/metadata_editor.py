"""Service for editing song metadata (ID3 tags and Redis cache)."""

import asyncio
import logging
from pathlib import Path

from mutagen.id3 import ID3  # type: ignore
from mutagen.id3 import TALB  # type: ignore
from mutagen.id3 import TCON  # type: ignore
from mutagen.id3 import TIT2  # type: ignore
from mutagen.id3 import TPE1  # type: ignore
from mutagen.id3 import TPE2  # type: ignore
from mutagen.mp3 import MP3  # type: ignore

from app.services.mpd_service import MPDClient
from app.services.redis_service import PlaylistType
from app.services.redis_service import RedisService
from app.settings import get_music_fallback_dir
from app.settings import get_music_user_dir

logger = logging.getLogger(__name__)


class MetadataEditException(Exception):
    """Raised when metadata editing fails."""


def _update_id3_tags_sync(
    file_path: Path,
    title: str | None = None,
    artist: str | None = None,
    album: str | None = None,
    genre: str | None = None,
) -> None:
    """Synchronous function to update ID3 tags in an MP3 file.

    Args:
        file_path: Path to the MP3 file
        title: Song title (optional)
        artist: Artist name (optional)
        album: Album name (optional)
        genre: Genre (optional)

    Raises:
        MetadataEditException: If file cannot be read/written or is not MP3
    """
    try:
        audio = MP3(str(file_path), ID3=ID3)

        if audio.tags is None:
            audio.add_tags()

        tags = audio.tags  # Cache tags reference to avoid repeated null checks

        # Update only provided fields (preserve existing if not specified)
        if title is not None:
            # Remove existing title tags
            tags.delall("TIT2")  # type: ignore
            if title:  # Only add if non-empty
                tags.add(TIT2(encoding=3, text=title))  # type: ignore

        if artist is not None:
            tags.delall("TPE1")  # type: ignore
            tags.delall("TPE2")  # type: ignore
            if artist:
                tags.add(TPE1(encoding=3, text=artist))  # type: ignore
                tags.add(TPE2(encoding=3, text=artist))  # type: ignore

        if album is not None:
            tags.delall("TALB")  # type: ignore
            if album:
                tags.add(TALB(encoding=3, text=album))  # type: ignore

        if genre is not None:
            tags.delall("TCON")  # type: ignore
            if genre:
                tags.add(TCON(encoding=3, text=genre))  # type: ignore

        audio.save()
        logger.info(f"Updated ID3 tags for {file_path}")

    except Exception as e:
        raise MetadataEditException(f"Failed to update ID3 tags: {str(e)}")


async def update_song_metadata(
    redis_client: RedisService,
    playlist: PlaylistType,
    mpd_song_id: str,
    file_path: str,
    title: str | None = None,
    artist: str | None = None,
    album: str | None = None,
    genre: str | None = None,
) -> None:
    """Update both ID3 tags and Redis cache for a song.

    Args:
        redis_client: Redis service instance
        playlist: Playlist type (user or fallback)
        mpd_song_id: MPD song ID
        file_path: Relative path to the song file from music root
        title: New title (None to keep existing)
        artist: New artist (None to keep existing)
        album: New album (None to keep existing)
        genre: New genre (None to keep existing)

    Raises:
        MetadataEditException: If update fails
    """
    # Determine full file path based on playlist type
    if playlist == "user":
        music_root = Path(get_music_user_dir())
    elif playlist == "fallback":
        music_root = Path(get_music_fallback_dir())
    else:
        raise MetadataEditException(f"Invalid playlist type: {playlist}")

    full_path = music_root / file_path

    if not full_path.exists():
        raise MetadataEditException(f"File not found: {full_path}")

    if not full_path.suffix.lower() == ".mp3":
        raise MetadataEditException("Only MP3 files are supported for metadata editing")

    # Update ID3 tags in file (blocking I/O in thread pool)
    await asyncio.to_thread(_update_id3_tags_sync, full_path, title, artist, album, genre)

    # Update Redis cache
    # Build metadata dict with only non-None values
    metadata_updates = {}
    if title is not None:
        metadata_updates["title"] = title
    if artist is not None:
        metadata_updates["artist"] = artist
    if genre is not None:
        metadata_updates["genre"] = genre

    if metadata_updates:
        await redis_client.set_song_metadata(
            playlist,
            mpd_song_id,
            metadata_updates.get("title"),
            metadata_updates.get("artist"),
            metadata_updates.get("genre"),
        )
        logger.info(f"Updated Redis metadata for {playlist}:{mpd_song_id}")


async def get_song_file_path(playlist: PlaylistType, mpd_song_id: str, mpd_client: "MPDClient") -> str | None:
    """Get the file path for a song from MPD.

    Args:
        playlist: Playlist type (user or fallback)
        mpd_song_id: MPD song ID
        mpd_client: MPD client instance

    Returns:
        Relative file path or None if not found
    """
    queue = await mpd_client.get_queue()

    for song in queue:
        if str(song.get("id")) == mpd_song_id:
            file_path = song.get("file")
            return str(file_path) if file_path else None

    return None
