"""FFmpeg utility functions for audio processing."""

import asyncio
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


async def trim_silence(
    input_path: Path,
    output_codec: str = "libmp3lame",
    codec_quality: str = "2",
    output_format: str = "mp3",
) -> None:
    """Remove silence from beginning and end of audio file.

    Args:
        input_path: Path to input audio file
        output_codec: FFmpeg audio codec (libmp3lame, libvorbis, etc.)
        codec_quality: Codec quality parameter (-q:a for VBR)
        output_format: Output file format extension

    Raises:
        Exception: If trimming fails (non-fatal, original file preserved)

    Note:
        Replaces original file with trimmed version on success.
        Original preserved if trimming fails.
    """
    temp_path = input_path.with_suffix(f".trimmed.{output_format}")

    try:
        process = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-i",
            str(input_path),
            "-af",
            "silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB:stop_periods=-1:stop_duration=0.5:stop_threshold=-50dB",
            "-c:a",
            output_codec,
            "-q:a",
            codec_quality,
            str(temp_path),
            "-y",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            logger.warning(f"Failed to trim silence from {input_path.name}: {stderr.decode()}")
            raise RuntimeError(f"FFmpeg failed with return code {process.returncode}")

        await asyncio.to_thread(temp_path.replace, input_path)
        logger.info(f"Trimmed silence from {input_path.name}")

    except Exception as e:
        logger.warning(f"Failed to trim silence from {input_path.name}: {e}")
        if temp_path.exists():
            await asyncio.to_thread(temp_path.unlink)
        raise


async def get_duration(filepath: Path) -> float:
    """Get audio file duration in seconds using ffprobe.

    Args:
        filepath: Path to audio file

    Returns:
        Duration in seconds

    Raises:
        RuntimeError: If ffprobe fails
    """
    process = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(filepath),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=10.0)

    if process.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {stderr.decode()}")

    return float(stdout.decode().strip())
