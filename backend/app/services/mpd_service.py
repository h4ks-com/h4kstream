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

    async def list_all(self):
        """List all songs in the MPD database."""
        return await asyncio.to_thread(self.client.listall)

    async def set_repeat(self, enabled: bool):
        """Enable or disable repeat mode."""
        await asyncio.to_thread(self.client.repeat, 1 if enabled else 0)

    async def set_random(self, enabled: bool):
        """Enable or disable random mode."""
        await asyncio.to_thread(self.client.random, 1 if enabled else 0)

    async def play(self, position: int | None = None):
        """Start playback at the given position (or resume if None)."""
        if position is not None:
            await asyncio.to_thread(self.client.play, position)
        else:
            await asyncio.to_thread(self.client.play)

    async def get_status(self):
        """Get current MPD status."""
        return await asyncio.to_thread(self.client.status)

    async def setup_autoplay(self):
        """Set up MPD for auto-play: clear queue, add all songs, enable repeat/random, and start playing."""
        logging.info("Setting up MPD auto-play...")

        # Clear existing queue
        logging.info("Clearing MPD queue...")
        await self.clear_queue()
        logging.info("Cleared MPD queue")

        # Get all songs and add them
        logging.info("Listing all songs in library...")
        all_songs = await self.list_all()
        song_count = 0
        for item in all_songs:
            if "file" in item:
                try:
                    await asyncio.to_thread(self.client.add, item["file"])
                    song_count += 1
                except CommandError as e:
                    logging.warning(f"Failed to add {item['file']}: {e}")

        logging.info(f"Added {song_count} songs to queue")

        # Enable repeat and random
        logging.info("Enabling repeat and random modes...")
        await self.set_repeat(True)
        await self.set_random(True)
        logging.info("Enabled repeat and random modes")

        # Start playing
        if song_count > 0:
            logging.info("Starting playback...")
            await self.play(0)
            logging.info("Started playback - MPD auto-play configured!")
        else:
            logging.warning("No songs found in library, playback not started")
