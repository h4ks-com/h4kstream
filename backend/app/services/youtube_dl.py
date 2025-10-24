import pathlib
import urllib.parse
from enum import StrEnum
from enum import auto
from typing import NamedTuple

import yt_dlp

from app.settings import settings

USER_DIRECTORY = "/songs/user"
MAINLOOP_DIRECTORY = "/songs/mainloop"


class YoutubeErrorType(StrEnum):
    INVALID_URL = auto()
    DOWNLOAD_ERROR = auto()


class YoutubeDownloadException(Exception):
    def __init__(self, error_type: YoutubeErrorType):
        self.error_type = error_type
        super().__init__(error_type)


class YoutubeDownloadResult(NamedTuple):
    title: str
    path: pathlib.Path
    length: int


async def download_song(url: str, mainloop: bool = False) -> YoutubeDownloadResult:
    # Check if url is valid
    if urllib.parse.urlparse(url).scheme not in ("http", "https"):
        raise YoutubeDownloadException(YoutubeErrorType.INVALID_URL)

    target_suffix = MAINLOOP_DIRECTORY if mainloop else USER_DIRECTORY
    target_dir = settings.VOLUME_PATH + target_suffix
    try:
        with yt_dlp.YoutubeDL(
            {
                "extract_audio": True,
                "format": "bestaudio",
                "outtmpl": f"{target_dir}/%(title)s",
                "postprocessors": [
                    {
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": "320",
                    }
                ],
            }
        ) as video:
            info_dict = video.extract_info(url, download=True)
            if info_dict is None:
                raise YoutubeDownloadException(YoutubeErrorType.INVALID_URL)

            video_title = info_dict["title"]
            video_length = info_dict["duration"]
            video_path = pathlib.Path(f"{target_dir}/{video_title}.mp3")

            if not video_path.exists():
                raise YoutubeDownloadException(YoutubeErrorType.DOWNLOAD_ERROR)

    except yt_dlp.DownloadError:
        raise YoutubeDownloadException(YoutubeErrorType.DOWNLOAD_ERROR)

    # Make chmod 777
    video_path.chmod(0o777)
    return YoutubeDownloadResult(title=video_title, path=video_path, length=video_length)
