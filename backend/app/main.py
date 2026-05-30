import logging
from contextlib import asynccontextmanager

import redis.asyncio as redis
from fastapi import FastAPI

from app.db import init_db
from app.routes import admin
from app.routes import internal
from app.routes import public
from app.routes import songs
from app.routes import webhooks
from app.routes.metadata import internal_router as metadata_internal_router
from app.routes.metadata import metadata_router
from app.routes.oauth import router as oauth_router
from app.routes.recordings import admin_router as recordings_admin_router
from app.routes.recordings import router as recordings_router
from app.routes.shows import admin_router as shows_admin_router
from app.routes.shows import router as shows_router
from app.routes.transitions import router as transitions_router
from app.routes.users import admin_router as users_admin_router
from app.routes.users import router as users_router
from app.routes.websocket import router as websocket_router
from app.services.stream_buffer_service import StreamBufferService
from app.services.ws_manager import ws_manager
from app.settings import settings

# Configure global logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    logger.info("FastAPI application starting (MPD setup handled by webhook_worker)")
    init_db()
    logger.info("Database initialized")

    redis_url = f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}"
    app.state.redis_pool = redis.from_url(redis_url)
    logger.info("Redis connection pool created")

    await ws_manager.start(app.state.redis_pool)
    logger.info("WebSocket manager started")

    app.state.stream_buffer = None
    if settings.STREAM_BUFFER_ENABLED:
        app.state.stream_buffer = StreamBufferService()
        app.state.stream_buffer.start()
        logger.info("Stream clip buffer started")

    yield

    if app.state.stream_buffer is not None:
        await app.state.stream_buffer.stop()
        logger.info("Stream clip buffer stopped")

    await ws_manager.stop()
    logger.info("WebSocket manager stopped")

    await app.state.redis_pool.aclose()
    logger.info("Redis connection pool closed")
    logger.info("FastAPI application shutting down")


app = FastAPI(
    title="h4kstream REST API",
    description="HTTP API for self-hosted radio system",
    version="1.0.0",
    lifespan=lifespan,
    root_path=settings.ROOT_PATH,
    swagger_ui_parameters={"url": f"{settings.ROOT_PATH}/openapi.json"} if settings.ROOT_PATH else None,
)


# Health check endpoint for load balancer
@app.get("/health")
async def health_check():
    """Health check endpoint for load balancers and monitoring."""
    return {"status": "healthy", "service": "h4kstream-backend"}


# Include routes
app.include_router(public.router)
app.include_router(public.public_router)
app.include_router(admin.router)
app.include_router(internal.router)
app.include_router(webhooks.router)
app.include_router(metadata_router)
app.include_router(metadata_internal_router)
app.include_router(recordings_router)
app.include_router(recordings_admin_router)
app.include_router(users_router)
app.include_router(users_admin_router)
app.include_router(shows_router)
app.include_router(shows_admin_router)
app.include_router(transitions_router)
app.include_router(songs.router)
app.include_router(oauth_router)
app.include_router(websocket_router)
