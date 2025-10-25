import asyncio
import logging

from mpd import CommandError
from mpd import MPDClient as OriginalMPDClient

from app.exceptions import FileNotFoundInMPDError
from app.exceptions import SongNotFoundError


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
        """Add a song to the MPD queue.

        :raises FileNotFoundInMPDError: If the file is not found in MPD database
        """
        if mainloop:
            # TODO
            pass
        else:
            logging.debug(f"Adding {filename} to MPD queue.")
            print(f"Adding {filename}")
            try:
                await asyncio.to_thread(self.client.add, f"{filename}")
                print(f"Added {filename}")
            except CommandError as e:
                if "No such directory" in str(e) or "No such file" in str(e):
                    raise FileNotFoundInMPDError(f"File '{filename}' not found in MPD database")
                print(f"Error: {e}, reconnecting")
                try:
                    await self.disconnect()
                except Exception:
                    pass
                await self.connect()
                try:
                    await asyncio.to_thread(self.client.add, f"{filename}")
                    print(f"Added {filename} after reconnect")
                except CommandError as retry_error:
                    if "No such directory" in str(retry_error) or "No such file" in str(retry_error):
                        raise FileNotFoundInMPDError(f"File '{filename}' not found in MPD database")
                    raise
        return filename

    async def remove_song(self, song_id: int):
        """Remove a song from the queue by ID.

        :raises SongNotFoundError: If the song ID doesn't exist
        """
        try:
            await asyncio.to_thread(self.client.deleteid, song_id)
        except CommandError as e:
            if "No such song" in str(e):
                raise SongNotFoundError(f"Song with ID {song_id} not found")
            raise

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

    async def clear_queue(self):
        """Clear all songs from the MPD queue."""
        await asyncio.to_thread(self.client.clear)
