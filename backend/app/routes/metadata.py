"""Metadata endpoints for now playing tracking.

Public endpoint for current track info and internal endpoints for Liquidsoap integration.
"""

import logging

from fastapi import APIRouter
from fastapi import Depends

from app.dependencies import admin_auth
from app.dependencies import dep_event_publisher
from app.dependencies import dep_liquidsoap_token
from app.dependencies import dep_mpd_fallback
from app.dependencies import dep_mpd_user
from app.dependencies import dep_redis_client
from app.models import ErrorResponse
from app.models import MetadataSetRequest
from app.models import MetadataUpdateRequest
from app.models import NowPlayingMetadata
from app.models import NowPlayingResponse
from app.models import SuccessResponse
from app.services.event_publisher import EventPublisher
from app.services.mpd_service import MPDClient
from app.services.redis_service import RedisService

logger = logging.getLogger(__name__)

metadata_router = APIRouter(tags=["metadata"])
internal_router = APIRouter(prefix="/internal", tags=["internal"])


@metadata_router.get(
    "/metadata/now",
    response_model=NowPlayingResponse,
    summary="Get Now Playing",
    description="Get current playing track metadata (public endpoint)",
)
async def get_now_playing(
    redis_client: RedisService = Depends(dep_redis_client),
    user_mpd: MPDClient = Depends(dep_mpd_user),
    fallback_mpd: MPDClient = Depends(dep_mpd_fallback),
) -> NowPlayingResponse:
    """Get current playing track information with live MPD data."""
    livestream_active = await redis_client.is_livestream_active()

    if livestream_active:
        metadata = await redis_client.get_metadata("livestream") or {}
        if not metadata.get("title"):
            metadata["title"] = "Testing Stream"
        if not metadata.get("artist"):
            metadata["artist"] = "Testing"
        return NowPlayingResponse(source="livestream", metadata=NowPlayingMetadata(**metadata))

    try:
        await user_mpd.connect()
        user_song = await user_mpd.get_current_song()
        await user_mpd.disconnect()

        if user_song and user_song.get("file"):
            metadata = {
                "title": user_song.get("title") or user_song.get("file", "User Queue"),
                "artist": user_song.get("artist"),
                "genre": user_song.get("genre"),
                "description": None,
            }
            await redis_client.set_metadata("user", metadata)
            await redis_client.set_active_source("user")
            return NowPlayingResponse(source="user", metadata=NowPlayingMetadata(**metadata))
    except Exception as e:
        logger.warning(f"Failed to fetch user MPD metadata: {e}")

    try:
        await fallback_mpd.connect()
        fallback_song = await fallback_mpd.get_current_song()
        await fallback_mpd.disconnect()

        if fallback_song and fallback_song.get("file"):
            metadata = {
                "title": fallback_song.get("title") or fallback_song.get("file", "Fallback Playlist"),
                "artist": fallback_song.get("artist"),
                "genre": fallback_song.get("genre"),
                "description": None,
            }
            await redis_client.set_metadata("fallback", metadata)
            await redis_client.set_active_source("fallback")
            return NowPlayingResponse(source="fallback", metadata=NowPlayingMetadata(**metadata))
    except Exception as e:
        logger.warning(f"Failed to fetch fallback MPD metadata: {e}")

    metadata = {"title": "Fallback Playlist", "artist": None, "genre": None, "description": None}
    return NowPlayingResponse(source="fallback", metadata=NowPlayingMetadata(**metadata))


@internal_router.post(
    "/metadata/update",
    response_model=SuccessResponse,
    summary="Update Metadata",
    description="Update track metadata from Liquidsoap (internal only)",
    dependencies=[Depends(dep_liquidsoap_token)],
    responses={401: {"model": ErrorResponse}},
    include_in_schema=False,
)
async def update_metadata(
    request: MetadataUpdateRequest,
    redis_client: RedisService = Depends(dep_redis_client),
    event_publisher: EventPublisher = Depends(dep_event_publisher),
) -> SuccessResponse:
    """Liquidsoap reports current track metadata."""
    new_metadata = request.metadata.model_dump()

    # Get old active source to detect queue switches
    old_source = await redis_client.get_active_source()

    # Track livestream activity - keep flag alive with metadata updates
    if request.source == "livestream":
        # Check if livestream is currently active (set by connect endpoint)
        is_active = await redis_client.is_livestream_active()
        if is_active:
            # Refresh the TTL to keep stream alive (metadata updates every ~5-10s)
            await redis_client.set_livestream_active(ttl_seconds=60)

        existing = await redis_client.get_metadata(request.source) or {}
        merged = existing.copy()
        for key, value in new_metadata.items():
            if value:
                merged[key] = value
        # Provide fallback values if metadata is missing
        if not merged.get("title"):
            merged["title"] = "Live Stream"
        if not merged.get("artist"):
            merged["artist"] = "Unknown Artist"
    else:
        merged = new_metadata

    await redis_client.set_metadata(request.source, merged)
    await redis_client.set_active_source(request.source)

    logger.info(f"Updated metadata for source '{request.source}': {merged}")

    # Publish queue_switched event if source changed
    if old_source and old_source != request.source:
        description = f"Switched from {old_source} to {request.source}"
        await event_publisher.publish(
            event_type="queue_switched",
            data={"from_source": old_source, "to_source": request.source},
            description=description,
        )
        logger.info(f"Published queue_switched event: {description}")

    # Publish song_changed event
    title = merged.get("title", "Unknown")
    artist = merged.get("artist", "Unknown")
    description = f"Playing next: {title}"
    if artist and artist != "Unknown":
        description += f" by {artist}"

    await event_publisher.publish(
        event_type="song_changed",
        data={"source": request.source, "metadata": merged},
        description=description,
    )
    logger.debug(f"Published song_changed event for {request.source}")

    return SuccessResponse()


@internal_router.post(
    "/metadata/set",
    response_model=SuccessResponse,
    summary="Set Livestream Metadata",
    description="Set custom livestream metadata (admin only)",
    dependencies=[Depends(admin_auth)],
    responses={401: {"model": ErrorResponse}},
    include_in_schema=False,
)
async def set_livestream_metadata(
    request: MetadataSetRequest,
    redis_client: RedisService = Depends(dep_redis_client),
) -> SuccessResponse:
    """Admin sets livestream metadata."""
    metadata = {
        "title": request.title,
        "artist": request.artist,
        "genre": request.genre,
        "description": request.description,
    }
    await redis_client.set_metadata("livestream", metadata)

    logger.info(f"Set livestream metadata: {metadata}")
    return SuccessResponse()
