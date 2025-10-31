"""Recording worker that captures livestreams from Icecast output."""

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path

from redis import asyncio as aioredis

from app.db import SessionLocal
from app.db import init_db
from app.db.models import LivestreamRecording
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


class RecordingWorker:
    def __init__(self) -> None:
        self.active_recordings: dict[str, RecordingSession] = {}
        self.redis: aioredis.Redis | None = None

    async def start(self) -> None:
        init_db()

        self.redis = await aioredis.from_url(settings.REDIS_URL, decode_responses=True)

        pubsub = self.redis.pubsub()
        await pubsub.subscribe("events:livestream_started", "events:livestream_ended")

        logger.info("Recording worker started, listening for livestream events")

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

        timestamp = int(time.time())
        filename = f"{show_name}_{timestamp}.mp3"
        filepath = Path(settings.RECORDINGS_PATH) / filename

        process = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-i",
            f"http://{settings.ICECAST_HOST}:{settings.ICECAST_PORT}/radio",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "128k",
            "-f",
            "mp3",
            str(filepath),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )

        self.active_recordings[user_id] = RecordingSession(
            user_id=user_id,
            show_name=show_name,
            min_duration=min_duration,
            filename=filename,
            filepath=filepath,
            process=process,
            started_at=time.time(),
        )

        logger.info(f"Started recording for {show_name} (user: {user_id}) -> {filename}")

    async def _stop_recording(self, data: dict) -> None:
        user_id = data["user_id"]

        session = self.active_recordings.pop(user_id, None)
        if not session:
            logger.warning(f"No active recording for user {user_id}")
            return

        # Check if process is still running before terminating
        if session.process.returncode is None:
            session.process.terminate()
            await session.process.wait()
        else:
            logger.info(f"Recording process already exited for user {user_id}")

        await self._process_recording(session)

    async def _process_recording(self, session: RecordingSession) -> None:
        if not session.filepath.exists():
            logger.error(f"Recording file not found: {session.filepath}")
            return

        duration = await ffmpeg.get_duration(session.filepath)

        if duration < session.min_duration:
            os.remove(session.filepath)
            logger.info(f"Deleted {session.filename}: too short ({duration:.1f}s < {session.min_duration}s)")
            return

        # Trim silence from livestream recording
        try:
            await ffmpeg.trim_silence(
                session.filepath,
                output_codec="libvorbis",
                codec_quality="5",
                output_format="ogg",
            )
            # Recalculate duration after trimming
            duration = await ffmpeg.get_duration(session.filepath)
        except (TimeoutError, RuntimeError, OSError) as e:
            logger.warning(f"Skipping silence trimming for {session.filename}: {e}")

        db = SessionLocal()
        try:
            recording = LivestreamRecording(
                show_name=session.show_name,
                duration_seconds=duration,
                file_path=session.filename,
            )
            db.add(recording)
            db.commit()
            logger.info(f"Saved recording {session.filename} ({duration:.1f}s) to database (ID: {recording.id})")
        finally:
            db.close()


async def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    Path(settings.RECORDINGS_PATH).mkdir(parents=True, exist_ok=True)
    logger.info(f"Recordings directory ensured at {settings.RECORDINGS_PATH}")

    worker = RecordingWorker()
    await worker.start()


if __name__ == "__main__":
    asyncio.run(main())
