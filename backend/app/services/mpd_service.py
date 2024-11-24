import os

import mpd

MPD_HOST = os.getenv("MPD_HOST", "localhost")
MPD_PORT = int(os.getenv("MPD_PORT", "6600"))


def connect():
    client = mpd.MPDClient()
    client.connect(MPD_HOST, MPD_PORT)
    return client


def get_queue():
    client = connect()
    queue = client.playlistinfo()
    client.close()
    return queue


def add_local_song(file_path, mainloop=False):
    client = connect()
    if mainloop:
        client.add("mainloop/" + file_path)
    else:
        client.add("user/" + file_path)
    client.close()
    return file_path


async def download_and_add(url, mainloop=False):
    from .youtube_dl import download_song

    file_path = await download_song(url, mainloop)
    return add_local_song(file_path, mainloop)


def remove_song(song_id):
    client = connect()
    client.deleteid(song_id)
    client.close()
