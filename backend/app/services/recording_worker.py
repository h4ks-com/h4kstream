"""Recording worker that captures livestreams from Icecast output."""

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path

from mutagen.oggvorbis import OggVorbis
from redis import asyncio as aioredis
from sqlmodel import Session
from sqlmodel import select

from app.db import engine
from app.db import init_db
from app.db.models import LivestreamRecording
from app.db.models import Show
from app.services import ffmpeg
from app.settings import settings

logger = logging.getLogger(__name__)


@dataclass
class RecordingSession:
    user_id: str
    show_name: str
    min_duration: int
    filename: str
    filepath: Path
    process: asyncio.subprocess.Process
    started_at: float
    metadata: dict[str, str | None]  # Capture metadata at recording start


class RecordingWorker:
    def __init__(self) -> None:
        self.active_recordings: dict[str, RecordingSession] = {}
        self.redis: aioredis.Redis | None = None

    async def start(self) -> None:
        init_db()

        self.redis = await aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        assert self.redis is not None, "Redis connection failed"

        pubsub = self.redis.pubsub()
        await pubsub.subscribe(
            "events:livestream_started",
            "events:livestream_ended",
            "events:metadata_updated"  # Subscribe to metadata updates
        )

        logger.info("Recording worker started, listening for livestream events and metadata updates")

        async for message in pubsub.listen():
            if message["type"] == "message":
                await self._handle_event(message["data"])

    async def _handle_event(self, data: str) -> None:
        try:
            event = json.loads(data)
            event_type = event.get("event_type")

            if event_type == "livestream_started":
                await self._start_recording(event["data"])
            elif event_type == "livestream_ended":
                await self._stop_recording(event["data"])
            elif event_type == "metadata_updated":
                await self._update_metadata(event["data"])

        except json.JSONDecodeError:
            logger.error(f"Invalid JSON in event: {data}")
        except Exception as e:
            logger.exception(f"Error handling event: {e}")

    async def _start_recording(self, data: dict) -> None:
        user_id = data["user_id"]
        show_name = data.get("show_name", "unknown")
        min_duration = data.get("min_recording_duration", 60)

        if user_id in self.active_recordings:
            logger.warning(f"Recording already active for user {user_id}")
            return

        assert self.redis is not None, "Redis not initialized"

        # Read metadata from Redis (Liquidsoap sends all fields immediately)
        metadata: dict[str, str | None] = {"title": None, "artist": None, "genre": None, "description": None}

        try:
            metadata_json = await self.redis.get("metadata:livestream")
            if metadata_json:
                stored_metadata = json.loads(metadata_json)
                metadata.update(stored_metadata)
                logger.info(
                    f"Captured metadata at recording start: "
                    f"title={metadata.get('title')}, artist={metadata.get('artist')}, "
                    f"genre={metadata.get('genre')}, description={metadata.get('description')}"
                )
            else:
                logger.warning(f"No metadata found in Redis for user {user_id}, recording will be 'Untitled'")
        except json.JSONDecodeError as e:
            logger.warning(f"Invalid JSON in metadata:livestream: {e}")

        timestamp = int(time.time())
        filename = f"{show_name}_{timestamp}.mp3"
        filepath = Path(settings.RECORDINGS_PATH) / filename

        # Retry logic for ffmpeg connection (harbor output may not be ready immediately)
        max_retries = 3
        retry_delay = 0.5  # Start with 0.5 seconds
        process = None

        for attempt in range(max_retries):
            # Wait for harbor output to become available (fallible source takes time to start)
            await asyncio.sleep(retry_delay)

            logger.info(
                f"Connecting to {settings.LIQUIDSOAP_RECORDING_URL} for recording "
                f"(attempt {attempt + 1}/{max_retries})"
            )

            process = await asyncio.create_subprocess_exec(
                "ffmpeg",
                "-loglevel",
                "warning",
                "-i",
                settings.LIQUIDSOAP_RECORDING_URL,
                "-c:a",
                "libmp3lame",
                "-b:a",
                "128k",
                "-f",
                "mp3",
                str(filepath),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            # Check if ffmpeg failed immediately (stream not available)
            try:
                await asyncio.wait_for(process.wait(), timeout=1.0)
                # Process exited within 1 second - likely connection error
                stderr_text = ""
                if process.stderr is not None:
                    stderr = await process.stderr.read()
                    stderr_text = stderr.decode() if stderr else ""

                if "End of file" in stderr_text or "Connection refused" in stderr_text:
                    logger.warning(
                        f"FFmpeg failed to connect (attempt {attempt + 1}/{max_retries}): "
                        f"{stderr_text[:200]}"
                    )

                    if attempt < max_retries - 1:
                        # Retry with exponential backoff
                        retry_delay *= 2
                        logger.info(f"Retrying in {retry_delay}s...")
                        continue
                    else:
                        logger.error(
                            f"Failed to start recording after {max_retries} attempts: "
                            f"stream not available"
                        )
                        return
                else:
                    # Different error - log and fail
                    logger.error(f"FFmpeg failed with unexpected error: {stderr_text}")
                    return

            except TimeoutError:
                # Process is still running after 1 second - connection successful
                logger.info(f"FFmpeg connected successfully on attempt {attempt + 1}")
                break

        if process is None or process.returncode is not None:
            logger.error(f"Failed to start recording for {user_id}: ffmpeg process failed")
            return

        self.active_recordings[user_id] = RecordingSession(
            user_id=user_id,
            show_name=show_name,
            min_duration=min_duration,
            filename=filename,
            filepath=filepath,
            process=process,
            started_at=time.time(),
            metadata=metadata,
        )

        logger.info(f"Started recording for {show_name} (user: {user_id}) -> {filename}")

    async def _stop_recording(self, data: dict) -> None:
        user_id = data["user_id"]

        session = self.active_recordings.pop(user_id, None)
        if not session:
            logger.warning(f"No active recording for user {user_id}")
            return

        if session.process.returncode is None:
            session.process.terminate()
            await session.process.wait()
        else:
            logger.info(f"Recording process already exited for user {user_id} with code {session.process.returncode}")
            # Log ffmpeg output to diagnose why it exited
            if session.process.stderr:
                stderr_output = await session.process.stderr.read()
                if stderr_output:
                    logger.error(f"FFmpeg stderr: {stderr_output.decode()}")
            if session.process.stdout:
                stdout_output = await session.process.stdout.read()
                if stdout_output:
                    logger.info(f"FFmpeg stdout: {stdout_output.decode()}")

        # Wait for file to exist and stabilize (ffmpeg buffer flush to disk may take a moment)
        max_wait = 10  # seconds
        wait_interval = 0.1  # seconds
        stability_checks = 3  # Number of consecutive size checks that must match
        elapsed = 0.0
        last_size = -1
        stable_count = 0

        while elapsed < max_wait:
            if session.filepath.exists():
                current_size = session.filepath.stat().st_size
                if current_size > 0:
                    if current_size == last_size:
                        stable_count += 1
                        if stable_count >= stability_checks:
                            logger.info(f"Recording file stable at {current_size} bytes after {elapsed:.1f}s")
                            break
                    else:
                        stable_count = 0
                        last_size = current_size
            await asyncio.sleep(wait_interval)
            elapsed += wait_interval

        if not session.filepath.exists():
            logger.error(f"Recording file never appeared after {max_wait}s: {session.filepath}")
            return

        await self._process_recording(session)

    async def _update_metadata(self, data: dict) -> None:
        """Update metadata for active recording sessions when metadata changes."""
        source = data.get("source")

        # Only update livestream metadata (user queue metadata shouldn't affect recordings)
        if source != "livestream":
            return

        new_metadata = data.get("metadata", {})

        # Update all active recording sessions with new metadata
        for user_id, session in self.active_recordings.items():
            # Update session metadata with new values (preserve existing if not provided)
            session.metadata.update({
                k: v for k, v in new_metadata.items()
                if v is not None  # Only update non-null values
            })

            logger.info(
                f"Updated metadata for active recording {session.filename}: "
                f"title={session.metadata.get('title')}, "
                f"artist={session.metadata.get('artist')}, "
                f"genre={session.metadata.get('genre')}, "
                f"description={session.metadata.get('description')}"
            )

    def _write_ogg_metadata(self, filepath: Path, metadata: dict[str, str | None]) -> None:
        """Write metadata to OGG Vorbis file using mutagen."""
        try:
            audio = OggVorbis(str(filepath))

            if metadata.get("title"):
                audio["TITLE"] = metadata["title"]
            if metadata.get("artist"):
                audio["ARTIST"] = metadata["artist"]
            if metadata.get("genre"):
                audio["GENRE"] = metadata["genre"]
            if metadata.get("description"):
                audio["DESCRIPTION"] = metadata["description"]

            audio.save()
            logger.info(f"Wrote OGG metadata tags to {filepath.name}")
        except Exception as e:
            logger.warning(f"Failed to write OGG metadata to {filepath.name}: {e}")

    async def _process_recording(self, session: RecordingSession) -> None:
        if not session.filepath.exists():
            logger.error(f"Recording file not found: {session.filepath}")
            return

        duration = await ffmpeg.get_duration(session.filepath)

        if duration < session.min_duration:
            os.remove(session.filepath)
            logger.info(f"Deleted {session.filename}: too short ({duration:.1f}s < {session.min_duration}s)")
            return

        try:
            await ffmpeg.trim_silence(
                session.filepath,
                output_codec="libvorbis",
                codec_quality="5",
                output_format="ogg",
            )
            duration = await ffmpeg.get_duration(session.filepath)

            # Check duration again after trimming - recording might be too short after silence removal
            if duration < session.min_duration:
                os.remove(session.filepath)
                logger.info(
                    f"Deleted {session.filename} after trimming: too short "
                    f"({duration:.1f}s < {session.min_duration}s)"
                )
                return
        except (TimeoutError, RuntimeError, OSError) as e:
            logger.warning(f"Skipping silence trimming for {session.filename}: {e}")

        metadata = session.metadata
        logger.info(
            f"Using captured metadata: title={metadata.get('title')}, "
            f"artist={metadata.get('artist')}, genre={metadata.get('genre')}, "
            f"description={metadata.get('description')}"
        )

        # Write metadata to OGG file tags
        await asyncio.to_thread(self._write_ogg_metadata, session.filepath, metadata)

        with Session(engine) as db:
            # Find or create show by show_name
            show = db.exec(select(Show).where(Show.show_name == session.show_name)).first()

            if not show:
                # Auto-create show if it doesn't exist
                show = Show(show_name=session.show_name)
                db.add(show)
                db.commit()
                db.refresh(show)
                logger.info(f"Auto-created show '{session.show_name}' for recording {session.filename}")

            recording = LivestreamRecording(
                show_id=show.id,
                title=metadata.get("title"),
                artist=metadata.get("artist"),
                genre=metadata.get("genre"),
                description=metadata.get("description"),
                duration_seconds=duration,
                file_path=session.filename,
            )
            db.add(recording)
            db.commit()
            db.refresh(recording)
            logger.info(
                f"Saved recording {session.filename} ({duration:.1f}s) to database "
                f"(ID: {recording.id}, show: {show.show_name}, title: {recording.title or 'Untitled'})"
            )


async def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # Create recordings directory
    Path(settings.RECORDINGS_PATH).mkdir(parents=True, exist_ok=True)
    logger.info(f"Recordings directory ensured at {settings.RECORDINGS_PATH}")

    # Create transitions directory (for jingles between MPD sources)
    transitions_dir = Path(settings.DATA_PATH) / "transitions"
    transitions_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Transitions directory ensured at {transitions_dir}")

    worker = RecordingWorker()
    await worker.start()


if __name__ == "__main__":
    asyncio.run(main())
