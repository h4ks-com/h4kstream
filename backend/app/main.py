import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.routes import admin
from app.routes import public
from app.services.mpd_service import MPDClient
from app.settings import settings

# Configure logging
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Resume playback on startup if queue has songs."""
    mpd_client = MPDClient(settings.MPD_HOST, settings.MPD_PORT)
    try:
        await mpd_client.connect()
        status = await mpd_client.get_status()
        queue_length = int(status.get("playlistlength", 0))

        if queue_length > 0:
            logger.info(f"Found {queue_length} songs in queue, starting playback")
            await mpd_client.play()
        else:
            logger.info("Queue is empty, not starting playback")
    except Exception as e:
        logger.error(f"Failed to resume playback: {e}", exc_info=True)
    finally:
        try:
            await mpd_client.disconnect()
        except Exception as ex:
            logger.warning(f"Failed to disconnect from MPD: {ex}")

    yield

    logger.info("Application shutting down")


app = FastAPI(
    title="Radio API",
    description="Backend for self-hosted radio system",
    version="1.0.0",
    lifespan=lifespan,
)

# Include routes
app.include_router(public.router)
app.include_router(admin.router)
