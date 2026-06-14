"""Stream recording audio through ffmpeg without ever buffering a whole file in memory.

Three jobs share this module so the limits live in one place:

* ``stream_segment`` — a single time-range slice (stream-copied), used by ``/recordings/stream``.
* ``stream_edit`` — a full multi-segment edit rendered from a filtergraph. This is the expensive,
  unauthenticated path, so it runs under a concurrency semaphore (acquired inside the generator so a
  never-iterated response cannot leak a slot) and a wall-clock timeout. Routes call ``slots_busy``
  for a best-effort 503 before the response starts.
* ``get_peaks`` — a downsampled waveform for the editor. The sample rate is chosen so the decoded
  stream is tiny regardless of recording length (a few thousand samples), keeping CPU and memory
  bounded; results are cached as a small JSON written only on authed requests.
"""

import asyncio
import logging
import math
import os
import struct
from collections.abc import AsyncIterator
from pathlib import Path

from app.models import RecordingPeaks
from app.services.edit_spec import EditSpec
from app.services.edit_spec import build_filtergraph
from app.settings import settings

logger = logging.getLogger(__name__)

_CHUNK = 65536
_PEAKS_OVERSAMPLE = 4  # target samples per output bin before max-folding

_render_semaphore = asyncio.Semaphore(settings.EDIT_MAX_CONCURRENT_RENDERS)


async def _spawn(args: list[str]) -> asyncio.subprocess.Process:
    return await asyncio.create_subprocess_exec(
        "ffmpeg",
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )


async def _stream_process(proc: asyncio.subprocess.Process, timeout: float) -> AsyncIterator[bytes]:
    """Yield stdout in bounded chunks, enforcing a wall-clock deadline; always reap the process."""
    assert proc.stdout is not None
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    try:
        while True:
            remaining = deadline - loop.time()
            if remaining <= 0:
                logger.warning("ffmpeg render exceeded %.0fs timeout; killing", timeout)
                break
            try:
                chunk = await asyncio.wait_for(proc.stdout.read(_CHUNK), timeout=remaining)
            except TimeoutError:
                logger.warning("ffmpeg render exceeded %.0fs timeout; killing", timeout)
                break
            if not chunk:
                break
            yield chunk
    finally:
        if proc.returncode is None:
            proc.kill()
        await proc.wait()
        if proc.returncode not in (0, None) and proc.stderr is not None:
            err = await proc.stderr.read()
            if err:
                logger.warning("ffmpeg exited %s: %s", proc.returncode, err.decode(errors="replace")[:300])


async def stream_segment(file_path: Path, start: float | None, end: float | None) -> AsyncIterator[bytes]:
    """Stream-copy a single time-range slice of a recording as MP3."""
    args = ["-hide_banner", "-loglevel", "error", "-nostdin"]
    if start:
        args += ["-ss", str(start)]
    args += ["-i", str(file_path)]
    if end is not None:
        args += ["-to", str(end - (start or 0.0))]  # -to is relative to -ss when -ss precedes -i
    args += ["-c:a", "copy", "-f", "mp3", "pipe:1"]
    proc = await _spawn(args)
    async for chunk in _stream_process(proc, settings.EDIT_RENDER_TIMEOUT_SECONDS):
        yield chunk


def slots_busy() -> bool:
    """True when all render slots are in use (best-effort 503 gate before a render starts)."""
    return _render_semaphore.locked()


async def stream_edit(file_path: Path, spec: EditSpec) -> AsyncIterator[bytes]:
    """Render a validated multi-segment edit to MP3.

    The render slot is acquired here, not in the route, so a response that is never iterated (the client disconnects
    before streaming starts) cannot leak a slot.
    """
    filter_complex, out_label = build_filtergraph(spec)
    args = [
        "-hide_banner", "-loglevel", "error", "-nostdin",
        "-i", str(file_path),
        "-filter_complex", filter_complex,
        "-map", out_label,
        "-f", "mp3", "-c:a", "libmp3lame", "-b:a", settings.EDIT_MP3_BITRATE, "pipe:1",
    ]
    async with _render_semaphore:
        proc = await _spawn(args)
        async for chunk in _stream_process(proc, settings.EDIT_RENDER_TIMEOUT_SECONDS):
            yield chunk


async def _decode_peaks(file_path: Path, duration: float, bins: int, rate: int) -> list[float]:
    """Decode a low-rate mono stream and fold it into ``bins`` max-amplitude values."""
    args = [
        "-hide_banner", "-loglevel", "error", "-nostdin",
        "-i", str(file_path),
        "-ac", "1", "-ar", str(rate), "-f", "s16le", "pipe:1",
    ]
    proc = await _spawn(args)
    assert proc.stdout is not None
    total_samples = max(int(duration * rate), bins)
    samples_per_bin = total_samples / bins
    peaks = [0.0] * bins
    index = 0
    leftover = b""
    try:
        while True:
            raw = await proc.stdout.read(_CHUNK)
            if not raw:
                break
            data = leftover + raw
            count = len(data) // 2
            for value in struct.unpack(f"<{count}h", data[: count * 2]):
                bucket = min(int(index / samples_per_bin), bins - 1)
                amp = abs(value) / 32768.0
                if amp > peaks[bucket]:
                    peaks[bucket] = amp
                index += 1
            leftover = data[count * 2 :]
    finally:
        if proc.returncode is None:
            proc.kill()
        await proc.wait()
    return [round(p, 4) for p in peaks]


async def get_peaks(file_path: Path, recording_id: int, duration: float, bins: int) -> RecordingPeaks:
    """Return downsampled waveform peaks for the editor, using a small atomic JSON cache."""
    cache_dir = Path(settings.PEAKS_CACHE_DIR)
    cache_file = cache_dir / f"{recording_id}_{bins}.json"
    if cache_file.exists():
        try:
            return RecordingPeaks.model_validate_json(cache_file.read_text())
        except (ValueError, OSError):
            pass  # corrupt or partially written cache: recompute and overwrite

    rate = max(1, min(settings.PEAKS_DOWNSAMPLE_RATE, math.ceil(bins * _PEAKS_OVERSAMPLE / max(duration, 0.001))))
    peaks = await _decode_peaks(file_path, duration, bins, rate)
    result = RecordingPeaks(version=1, duration=duration, peaks=peaks)

    cache_dir.mkdir(parents=True, exist_ok=True)
    tmp_file = cache_file.with_name(f"{cache_file.name}.{os.getpid()}.tmp")
    tmp_file.write_text(result.model_dump_json())
    os.replace(tmp_file, cache_file)  # atomic swap so concurrent readers never see a partial file
    return result
