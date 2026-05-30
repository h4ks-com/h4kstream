"""In-memory rolling buffer of the live radio output for on-demand clip extraction.

Each backend instance keeps the most recent audio of the full radio mix in memory by continuously pulling a dedicated,
uncounted Liquidsoap mount. Clients can request a clip defined by offsets measured backwards from the live edge (e.g.
from 300s ago up to 10s ago), which is sliced from the buffer and cleaned through ffmpeg into a standalone MP3.
"""

import asyncio
import logging
import time
from collections import deque

import httpx

from app.settings import settings

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 8192
_RECONNECT_DELAY = 2.0
_MAX_CONCURRENT_CLIPS = 4


class ClipValidationError(Exception):
    """Raised when the requested clip window is invalid (client error)."""


class ClipUnavailableError(Exception):
    """Raised when the buffer cannot yet satisfy a valid clip request (retryable)."""


class StreamBufferService:
    """Maintains a rolling in-memory buffer of the live radio output."""

    def __init__(self) -> None:
        self._chunks: deque[tuple[float, bytes]] = deque()
        self._buffer_seconds = settings.STREAM_BUFFER_SECONDS
        self._task: asyncio.Task | None = None
        self._running = False
        self._clip_semaphore = asyncio.Semaphore(_MAX_CONCURRENT_CLIPS)

    @property
    def is_ready(self) -> bool:
        return len(self._chunks) > 0

    def start(self) -> None:
        if self._task is not None:
            return
        self._running = True
        self._task = asyncio.create_task(self._pull_loop())
        logger.info("Stream buffer service started (retain %ss)", self._buffer_seconds)

    async def stop(self) -> None:
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        self._chunks.clear()
        logger.info("Stream buffer service stopped")

    async def _pull_loop(self) -> None:
        url = settings.LIQUIDSOAP_BUFFER_URL
        while self._running:
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, read=None)) as client:
                    async with client.stream("GET", url) as resp:
                        resp.raise_for_status()
                        logger.info("Connected to clip buffer source: %s", url)
                        async for chunk in resp.aiter_bytes(_CHUNK_SIZE):
                            if not chunk:
                                continue
                            self._chunks.append((time.monotonic(), chunk))
                            self._evict()
            except asyncio.CancelledError:
                raise
            except (httpx.HTTPError, OSError) as e:
                logger.warning("Clip buffer source disconnected (%s); retrying in %ss", e, _RECONNECT_DELAY)
                await asyncio.sleep(_RECONNECT_DELAY)

    def _evict(self) -> None:
        cutoff = time.monotonic() - self._buffer_seconds
        chunks = self._chunks
        while chunks and chunks[0][0] < cutoff:
            chunks.popleft()

    async def get_clip(self, start_offset: float, end_offset: float) -> bytes:
        """Extract a clip from the buffer.

        Offsets are seconds measured backwards from the live edge: ``start_offset`` is the
        older bound (largest), ``end_offset`` the newer bound. ``start_offset=300, end_offset=10``
        yields audio from 5 minutes ago up to 10 seconds ago. ``start_offset`` is clamped to the
        oldest audio currently buffered.
        """
        if start_offset <= end_offset:
            raise ClipValidationError("start_offset must be greater than end_offset")
        if end_offset < 0:
            raise ClipValidationError("end_offset must be non-negative")

        snapshot = list(self._chunks)
        if not snapshot:
            raise ClipUnavailableError("buffer is empty")

        live_edge = snapshot[-1][0]
        oldest = snapshot[0][0]
        window_start = max(live_edge - start_offset, oldest)
        window_end = live_edge - end_offset

        raw = b"".join(data for ts, data in snapshot if window_start <= ts <= window_end)
        if not raw:
            raise ClipUnavailableError("requested window is not yet buffered")

        async with self._clip_semaphore:
            return await self._clean_mp3(raw)

    async def _clean_mp3(self, raw: bytes) -> bytes:
        """Resync MP3 frames so a byte-sliced fragment becomes a standalone file."""
        process = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-fflags",
            "+discardcorrupt",
            "-i",
            "pipe:0",
            "-c",
            "copy",
            "-f",
            "mp3",
            "pipe:1",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await process.communicate(input=raw)
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()
        if process.returncode != 0 or not stdout:
            raise ClipUnavailableError(f"ffmpeg failed to assemble clip: {stderr.decode()[:200]}")
        return stdout
