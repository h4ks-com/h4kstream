import logging
import os

from mpd.asyncio import MPDClient as OriginalMPDClient

MPD_HOST = os.getenv("MPD_HOST", "localhost")
MPD_PORT = int(os.getenv("MPD_PORT", "6600"))
MLD_PATH_PREFIX = "/music"


class MPDClient:
    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self.client = OriginalMPDClient()
        self.disconnect()

    async def connect(self):
        await self.client.connect(MPD_HOST, MPD_PORT)

    def disconnect(self):
        self.client.disconnect()

    def get_queue(self):
        queue = self.client.playlistinfo()
        return queue

    async def add_local_song(self, filename: str, mainloop: bool = False):
        if mainloop:
            # TODO
            pass
        else:
            logging.debug(f"Adding {filename} to MPD queue.")
            # await self.client.add(f"file://{MLD_PATH_PREFIX}/{filename}")
            await self.client.add(f"{filename}")
        return filename

    def remove_song(self, song_id: int):
        self.client.deleteid(song_id)
