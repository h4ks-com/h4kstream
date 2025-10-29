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


async def download_song(url: str, mainloop: bool = False) -> YoutubeDownloadResult:
    if urllib.parse.urlparse(url).scheme not in ("http", "https"):
        raise YoutubeDownloadException(YoutubeErrorType.INVALID_URL)

    target_suffix = MAINLOOP_DIRECTORY if mainloop else USER_DIRECTORY
    target_dir = settings.VOLUME_PATH + target_suffix

    try:
        with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True}) as ydl:
            info_dict = ydl.extract_info(url, download=False)
            if info_dict is None:
                raise YoutubeDownloadException(YoutubeErrorType.INVALID_URL)

            if "entries" in info_dict:
                raise YoutubeDownloadException(YoutubeErrorType.PLAYLIST_NOT_ALLOWED)

            if info_dict.get("_type") == "playlist":
                raise YoutubeDownloadException(YoutubeErrorType.PLAYLIST_NOT_ALLOWED)

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

            video_title = info_dict.get("title", "Unknown")
            video_artist = info_dict.get("artist") or info_dict.get("uploader") or info_dict.get("channel")
            video_album = info_dict.get("album")
            video_length = info_dict.get("duration", 0)
            video_path = pathlib.Path(f"{target_dir}/{video_title}.mp3")

            if not video_path.exists():
                raise YoutubeDownloadException(YoutubeErrorType.DOWNLOAD_ERROR)

            # Manually write ID3 tags using mutagen to ensure they're properly embedded
            try:
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
            except Exception as e:
                logger.warning(f"Failed to write ID3 tags: {e}")

    except yt_dlp.DownloadError:
        raise YoutubeDownloadException(YoutubeErrorType.DOWNLOAD_ERROR)

    video_path.chmod(0o777)
    return YoutubeDownloadResult(title=video_title, artist=video_artist, path=video_path, length=video_length)
