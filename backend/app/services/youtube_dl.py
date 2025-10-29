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

from app.settings import settings

logger = logging.getLogger(__name__)

USER_DIRECTORY = "/songs/user"
MAINLOOP_DIRECTORY = "/songs/mainloop"


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


def _extract_info_sync(url: str) -> dict:
    """Synchronous function to extract video info."""
    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True}) as ydl:
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
    with yt_dlp.YoutubeDL(
        {
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
    ) as video:
        info_dict = video.extract_info(url, download=True)
        if info_dict is None:
            raise YoutubeDownloadException(YoutubeErrorType.INVALID_URL)
        return info_dict


def _write_id3_tags_sync(video_path: pathlib.Path, video_title: str, video_artist: str | None, video_album: str | None) -> None:
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


async def download_song(url: str, mainloop: bool = False) -> YoutubeDownloadResult:
    """Download song from URL using async operations to avoid blocking."""
    if urllib.parse.urlparse(url).scheme not in ("http", "https"):
        raise YoutubeDownloadException(YoutubeErrorType.INVALID_URL)

    target_suffix = MAINLOOP_DIRECTORY if mainloop else USER_DIRECTORY
    target_dir = settings.VOLUME_PATH + target_suffix

    try:
        # Extract info in thread pool (non-blocking)
        await asyncio.to_thread(_extract_info_sync, url)

        # Download video in thread pool (non-blocking)
        info_dict = await asyncio.to_thread(_download_video_sync, url, target_dir)

        video_title = info_dict.get("title", "Unknown")
        video_artist = info_dict.get("artist") or info_dict.get("uploader") or info_dict.get("channel")
        video_album = info_dict.get("album")
        video_length = info_dict.get("duration", 0)
        video_path = pathlib.Path(f"{target_dir}/{video_title}.mp3")

        if not video_path.exists():
            raise YoutubeDownloadException(YoutubeErrorType.DOWNLOAD_ERROR)

        # Remove silence from beginning and end using async FFmpeg subprocess
        try:
            temp_path = video_path.with_suffix(".trimmed.mp3")
            process = await asyncio.create_subprocess_exec(
                "ffmpeg",
                "-i",
                str(video_path),
                "-af",
                "silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB:stop_periods=-1:stop_duration=0.5:stop_threshold=-50dB",
                "-c:a",
                "libmp3lame",
                "-q:a",
                "2",  # VBR quality 2 (roughly 190 kbps)
                str(temp_path),
                "-y",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                logger.warning(f"Failed to remove silence: {stderr.decode()}")
            else:
                # Replace original with trimmed version
                await asyncio.to_thread(temp_path.replace, video_path)
                logger.info(f"Removed silence from {video_path.name}")
        except Exception as e:
            logger.warning(f"Failed to remove silence: {e}")
            # Continue anyway - silence removal is optional

        # Manually write ID3 tags using mutagen in thread pool (non-blocking)
        try:
            await asyncio.to_thread(_write_id3_tags_sync, video_path, video_title, video_artist, video_album)
        except Exception as e:
            logger.warning(f"Failed to write ID3 tags: {e}")

    except yt_dlp.DownloadError:
        raise YoutubeDownloadException(YoutubeErrorType.DOWNLOAD_ERROR)

    # Set file permissions in thread pool (non-blocking)
    await asyncio.to_thread(video_path.chmod, 0o777)

    return YoutubeDownloadResult(title=video_title, artist=video_artist, path=video_path, length=video_length)
