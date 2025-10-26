import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.routes import admin
from app.routes import public
from app.services.mpd_service import MPDClient
from app.settings import settings

# Configure global logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger(__name__)


async def setup_mpd_instance(
    client: MPDClient, name: str, enable_repeat: bool = False, enable_random: bool = False
) -> None:
    """Setup and start MPD instance if it has songs in queue."""
    try:
        await client.connect()
        status = await client.get_status()
        queue_length = int(status.get("playlistlength", 0))

        if queue_length > 0:
            if enable_repeat:
                await client.set_repeat(True)
            if enable_random:
                await client.set_random(True)

            mode_info = []
            if enable_repeat:
                mode_info.append("looping")
            if enable_random:
                mode_info.append("random")
            mode_str = f", {' + '.join(mode_info)} enabled" if mode_info else ""

            logger.info(f"{name}: {queue_length} songs{mode_str}, starting playback")
            await client.play()
        else:
            logger.info(f"{name} empty")
    except Exception as e:
        logger.error(f"Failed to setup {name}: {e}", exc_info=True)
    finally:
        try:
            await client.disconnect()
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Resume playback on startup for both MPD instances."""
    mpd_user = MPDClient(settings.MPD_USER_HOST, settings.MPD_USER_PORT)
    mpd_fallback = MPDClient(settings.MPD_FALLBACK_HOST, settings.MPD_FALLBACK_PORT)

    await setup_mpd_instance(mpd_user, "User queue")
    await setup_mpd_instance(mpd_fallback, "Fallback playlist", enable_repeat=True, enable_random=True)

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
