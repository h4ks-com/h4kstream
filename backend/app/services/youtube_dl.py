import subprocess

DOWNLOAD_DIR = "/app/volumes/songs/user"


async def download_song(url, mainloop=False):
    target_dir = "/app/volumes/songs/mainloop" if mainloop else DOWNLOAD_DIR
    result = subprocess.run(
        [
            "yt-dlp",
            "--extract-audio",
            "--audio-format",
            "mp3",
            "-o",
            f"{target_dir}/%(title)s.%(ext)s",
            url,
        ],
        capture_output=True,
    )
    if result.returncode != 0:
        raise Exception(f"Error downloading song: {result.stderr.decode()}")
    return target_dir
