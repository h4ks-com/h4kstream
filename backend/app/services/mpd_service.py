import asyncio
import logging

from mpd import MPDClient as OriginalMPDClient


class MPDClient:
    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self.client = OriginalMPDClient()

    async def connect(self):
        await asyncio.to_thread(self.client.connect, self.host, self.port)

    async def disconnect(self):
        await asyncio.to_thread(self.client.disconnect)

    async def get_queue(self):
        return await asyncio.to_thread(self.client.playlistinfo)

    async def add_local_song(self, filename: str, mainloop: bool = False):
        if mainloop:
            # TODO
            pass
        else:
            logging.debug(f"Adding {filename} to MPD queue.")
            print(f"Adding {filename}")
            try:
                await asyncio.to_thread(self.client.add, f"{filename}")
                print(f"Added {filename}")
            except Exception as e:
                print(f"Error: {e}, reconnecting")
                await self.connect()
                await asyncio.to_thread(self.client.add, f"{filename}")
                print(f"Added {filename} after reconnect")
        return filename

    async def remove_song(self, song_id: int):
        await asyncio.to_thread(self.client.deleteid, song_id)

    async def update_database(self, path: str = ""):
        print(f"Updating database with {path}")
        try:
            await asyncio.to_thread(self.client.update, path)
            await self._wait_for_update()
            print("Updated database")
        except Exception as e:
            print(f"Update failed: {e}")

    async def _wait_for_update(self):
        while True:
            status = await asyncio.to_thread(self.client.status)
            if 'updating_db' not in status:
                break
            await asyncio.sleep(0.1)
