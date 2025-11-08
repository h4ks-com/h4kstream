"""Liquidsoap telnet service for querying harbor listener count."""

import asyncio
import logging

from app.settings import settings

logger = logging.getLogger(__name__)


class LiquidsoapService:
    """Service for interacting with Liquidsoap telnet server."""

    def __init__(self) -> None:
        self.host = settings.LIQUIDSOAP_TELNET_HOST
        self.port = settings.LIQUIDSOAP_TELNET_PORT

    async def get_harbor_listeners(self) -> int:
        """Get current listener count from harbor output.

        Connects to Liquidsoap telnet server and queries the harbor output for the number of connected listeners.
        """
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=5.0
            )

            writer.write(b"radio.listeners\n")
            await writer.drain()

            data = await asyncio.wait_for(reader.readline(), timeout=5.0)

            writer.close()
            await writer.wait_closed()

            response = data.decode().strip()

            if response.isdigit():
                return int(response)

            logger.warning(f"Unexpected response from liquidsoap: {response}")
            return 0

        except (TimeoutError, ConnectionRefusedError, OSError) as e:
            logger.warning(f"Failed to connect to Liquidsoap telnet: {e}")
            return 0
        except ValueError as e:
            logger.error(f"Failed to parse listener count: {e}")
            return 0
