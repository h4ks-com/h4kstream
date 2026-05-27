import asyncio
import logging
import pathlib
import urllib.parse
from enum import StrEnum
from enum import auto
from typing import NamedTuple

import yt_dlp
from mutagen.id3 import ID3
from mutagen.id3 import TALB
from mutagen.id3 import TIT2
from mutagen.id3 import TPE1
from mutagen.id3 import TPE2
from mutagen.mp3 import MP3

from app.services import ffmpeg
from app.services.cache_service import calculate_md5
from app.settings import settings

logger = logging.getLogger(__name__)

# Derive directories from configurable root path
USER_DIRECTORY = f"{settings.SONGS_ROOT_PATH}/user"
MAINLOOP_DIRECTORY = f"{settings.SONGS_ROOT_PATH}/mainloop"


class YoutubeErrorType(StrEnum):
    INVALID_URL = auto()
    DOWNLOAD_ERROR = auto()
    PLAYLIST_NOT_ALLOWED = auto()


class YoutubeDownloadException(Exception):
    def __init__(self, error_type: YoutubeErrorType):
        self.error_type = error_type
        super().__init__(error_type)


class YoutubeDownloadResult(NamedTuple):
    title: str
    artist: str | None
    path: pathlib.Path
    length: int
    md5_before_trim: str


def _extract_info_sync(url: str) -> dict:
    """Synchronous function to extract video info."""
    opts: dict = {"quiet": True, "no_warnings": True}
    if settings.YTDLP_COOKIES_FILE:
        opts["cookiefile"] = settings.YTDLP_COOKIES_FILE
    with yt_dlp.YoutubeDL(opts) as ydl:
        info_dict = ydl.extract_info(url, download=False)
        if info_dict is None:
            raise YoutubeDownloadException(YoutubeErrorType.INVALID_URL)

        if "entries" in info_dict:
            raise YoutubeDownloadException(YoutubeErrorType.PLAYLIST_NOT_ALLOWED)

        if info_dict.get("_type") == "playlist":
            raise YoutubeDownloadException(YoutubeErrorType.PLAYLIST_NOT_ALLOWED)

        return info_dict


def _download_video_sync(url: str, target_dir: str) -> dict:
    """Synchronous function to download video."""
    opts: dict = {
        "extract_audio": True,
        "format": "bestaudio",
        "outtmpl": f"{target_dir}/%(title)s",
        "writethumbnail": False,
        "embedthumbnail": False,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "320",
            },
            {
                "key": "FFmpegMetadata",
                "add_metadata": True,
            },
        ],
    }
    if settings.YTDLP_COOKIES_FILE:
        opts["cookiefile"] = settings.YTDLP_COOKIES_FILE
    with yt_dlp.YoutubeDL(opts) as video:
        info_dict = video.extract_info(url, download=True)
        if info_dict is None:
            raise YoutubeDownloadException(YoutubeErrorType.INVALID_URL)
        return info_dict


def _write_id3_tags_sync(
    video_path: pathlib.Path, video_title: str, video_artist: str | None, video_album: str | None
) -> None:
    """Synchronous function to write ID3 tags."""
    audio = MP3(str(video_path), ID3=ID3)

    if audio.tags is None:
        audio.add_tags()

    audio.tags.delete()

    if video_title:
        audio.tags.add(TIT2(encoding=3, text=video_title))

    if video_artist:
        audio.tags.add(TPE1(encoding=3, text=video_artist))
        audio.tags.add(TPE2(encoding=3, text=video_artist))  # Album artist

    if video_album:
        audio.tags.add(TALB(encoding=3, text=video_album))

    audio.save()


async def get_video_info(url: str) -> dict:
    """Extract video metadata without downloading.

    :param url: YouTube/video URL
    :return: Video info dict containing title, duration, artist, etc.
    :raises YoutubeDownloadException: If URL invalid or is a playlist
    """
    if urllib.parse.urlparse(url).scheme not in ("http", "https"):
        raise YoutubeDownloadException(YoutubeErrorType.INVALID_URL)

    return await asyncio.to_thread(_extract_info_sync, url)


async def download_song(url: str, mainloop: bool = False) -> YoutubeDownloadResult:
    """Download song from URL using async operations to avoid blocking."""
    if urllib.parse.urlparse(url).scheme not in ("http", "https"):
        raise YoutubeDownloadException(YoutubeErrorType.INVALID_URL)

    target_dir = MAINLOOP_DIRECTORY if mainloop else USER_DIRECTORY

    try:
        # Extract info in thread pool (non-blocking)
        await asyncio.to_thread(_extract_info_sync, url)

        # Download video in thread pool (non-blocking)
        info_dict = await asyncio.to_thread(_download_video_sync, url, target_dir)

        video_title = info_dict.get("title", "Unknown")
        video_artist = info_dict.get("artist") or info_dict.get("uploader") or info_dict.get("channel")
        video_album = info_dict.get("album")
        video_length = info_dict.get("duration", 0)

        # Use the actual filepath from yt-dlp (sanitized) rather than constructing from raw title
        requested = info_dict.get("requested_downloads", [{}])
        actual_filepath = requested[0].get("filepath") if requested else None
        if actual_filepath:
            video_path = pathlib.Path(actual_filepath)
        else:
            video_path = pathlib.Path(f"{target_dir}/{video_title}.mp3")

        if not video_path.exists():
            raise YoutubeDownloadException(YoutubeErrorType.DOWNLOAD_ERROR)

        # Calculate MD5 hash before trimming (for cache identification)
        md5_before_trim = await calculate_md5(video_path)

        # Trim silence from beginning and end
        try:
            await ffmpeg.trim_silence(
                video_path,
                output_codec="libmp3lame",
                codec_quality="2",
                output_format="mp3",
            )
        except (TimeoutError, RuntimeError, OSError) as e:
            logger.warning(f"Skipping silence trimming: {e}")

        # Manually write ID3 tags using mutagen in thread pool (non-blocking)
        try:
            await asyncio.to_thread(_write_id3_tags_sync, video_path, video_title, video_artist, video_album)
        except Exception as e:
            logger.warning(f"Failed to write ID3 tags: {e}")

    except yt_dlp.DownloadError:
        raise YoutubeDownloadException(YoutubeErrorType.DOWNLOAD_ERROR)

    # Set file permissions in thread pool (non-blocking)
    await asyncio.to_thread(video_path.chmod, 0o777)

    return YoutubeDownloadResult(
        title=video_title, artist=video_artist, path=video_path, length=video_length, md5_before_trim=md5_before_trim
    )
