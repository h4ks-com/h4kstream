"""Metadata endpoints for now playing tracking.

Public endpoint for current track info and internal endpoints for Liquidsoap integration.
"""

import hashlib
import logging
from typing import cast

from fastapi import APIRouter
from fastapi import Depends
from sqlmodel import Session
from sqlmodel import select

from app.db import get_session
from app.db.models import FileCache
from app.dependencies import dep_event_publisher
from app.dependencies import dep_liquidsoap_token
from app.dependencies import dep_mpd_fallback
from app.dependencies import dep_mpd_user
from app.dependencies import dep_redis_client
from app.dependencies import require_admin_role
from app.models import ErrorResponse
from app.models import MetadataSetRequest
from app.models import MetadataUpdateRequest
from app.models import NowPlayingMetadata
from app.models import NowPlayingResponse
from app.models import QueueSwitchedEventData
from app.models import SongChangedEventData
from app.models import SuccessResponse
from app.services.event_publisher import EventPublisher
from app.services.mpd_service import MPDClient
from app.services.redis_service import RedisService
from app.types import PlaylistType

logger = logging.getLogger(__name__)

SONG_CHANGED_DEDUP_TTL = 3

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
    db_session: Session = Depends(get_session),
) -> NowPlayingResponse:
    """Get current playing track information using priority-based source detection."""
    # CRITICAL: Always check livestream flag first to prevent MPD metadata leaking during livestream
    livestream_active = await redis_client.is_livestream_active()
    if livestream_active:
        # Force livestream source when flag is active, regardless of MPD state
        # TTL is managed by connect/disconnect hooks, not by polling endpoints
        metadata = await redis_client.get_metadata("livestream") or {}
        # Provide fallback values if metadata fields are empty
        if not metadata.get("title"):
            metadata["title"] = "Live Stream"
        if not metadata.get("artist"):
            metadata["artist"] = "Unknown Artist"
        return NowPlayingResponse(source="livestream", metadata=NowPlayingMetadata(**metadata))

    # Use the priority system to determine which source should be active
    active_source = await redis_client.determine_active_source(
        user_mpd_client=user_mpd,
        check_user_playing=False  # For /metadata/now, just check if song exists
    )

    # Get metadata for the active source
    if active_source == "livestream":
        metadata = await redis_client.get_metadata("livestream") or {}
        # Provide fallback values if metadata fields are empty
        if not metadata.get("title"):
            metadata["title"] = "Live Stream"
        if not metadata.get("artist"):
            metadata["artist"] = "Unknown Artist"
        return NowPlayingResponse(source="livestream", metadata=NowPlayingMetadata(**metadata))

    # For user or fallback: fetch fresh MPD data with metadata overrides
    mpd_client = user_mpd if active_source == "user" else fallback_mpd
    default_title = "User Queue" if active_source == "user" else "Fallback Playlist"

    try:
        await mpd_client.connect()
        current_song = await mpd_client.get_current_song()
        await mpd_client.disconnect()

        if current_song and current_song.get("file"):
            # Start with MPD metadata
            metadata = {
                "title": current_song.get("title") or current_song.get("file", default_title),
                "artist": current_song.get("artist"),
                "genre": current_song.get("genre"),
                "description": None,
                "reference_url": None,
                "direct_url": None,
            }

            # Check for per-song metadata overrides (use filename as stable key)
            filename = current_song.get("file")
            if filename:
                overrides = await redis_client.get_song_metadata(active_source, filename)
                if overrides:
                    # Apply overrides - Redis takes precedence
                    if "title" in overrides:
                        metadata["title"] = overrides["title"]
                    if "artist" in overrides:
                        metadata["artist"] = overrides["artist"]

            # Look up cache_id from Redis and build URLs (use filename as stable key)
            if filename:
                cache_id = await redis_client.get_song_cache_id(active_source, filename)
                if cache_id:
                    # Look up reference_url from FileCache
                    statement = select(FileCache).where(FileCache.id == cache_id)
                    cache_entry = db_session.exec(statement).first()
                    if cache_entry:
                        if cache_entry.reference_url:
                            metadata["reference_url"] = cache_entry.reference_url
                        # Always provide direct stream URL as fallback
                        metadata["direct_url"] = f"/api/songs/stream/{cache_id}"

            return NowPlayingResponse(source=active_source, metadata=NowPlayingMetadata(**metadata))
    except Exception as e:
        logger.warning(f"Failed to fetch {active_source} MPD metadata: {e}")

    # Fallback if MPD connection fails
    metadata = {"title": default_title, "artist": None, "genre": None, "description": None}
    return NowPlayingResponse(source=active_source, metadata=NowPlayingMetadata(**metadata))


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
    user_mpd: MPDClient = Depends(dep_mpd_user),
    fallback_mpd: MPDClient = Depends(dep_mpd_fallback),
) -> SuccessResponse:
    """Liquidsoap reports current track metadata.

    Only publishes song_changed events if this source is actually playing (respecting priority).
    Priority: livestream > user > fallback

    CRITICAL: During active livestream, we reject all metadata updates from MPD sources
    to prevent metadata pollution when queues are paused.
    """
    new_metadata = request.metadata.model_dump()

    # Get old active source to detect queue switches
    old_source = await redis_client.get_active_source()

    # Use shared priority logic to determine active source FIRST
    active_source = await redis_client.determine_active_source(
        user_mpd_client=user_mpd,
        check_user_playing=True  # Only publish webhooks when actually PLAYING, not paused/stopped
    )

    # CRITICAL: Reject metadata updates from non-active sources when livestream is active
    # This prevents MPD metadata from overriding livestream metadata when queues are paused
    if active_source == "livestream" and request.source != "livestream":
        logger.debug(
            f"Rejected metadata from '{request.source}' (livestream is active, both queues should be paused)"
        )
        return SuccessResponse()

    # Merge metadata for livestream (preserve non-empty fields)
    # TTL is managed by connect/disconnect hooks, NOT by metadata updates
    if request.source == "livestream":
        existing = await redis_client.get_metadata(request.source) or {}
        merged = existing.copy()
        for key, value in new_metadata.items():
            if value:
                merged[key] = value
    else:
        merged = new_metadata

    # Provide fallback values if metadata is missing (for all sources)
    if not merged.get("title"):
        if request.source == "livestream":
            merged["title"] = "Live Stream"
        else:
            merged["title"] = "Unknown Track"
    if not merged.get("artist"):
        merged["artist"] = "Unknown Artist"

    # Only update active source and publish events if this source is actually playing
    should_publish = request.source == active_source

    # For user/fallback sources, enrich metadata from MPD BEFORE storing to Redis
    # This ensures get_now_playing() returns correct metadata for WebSocket initial state
    title = merged.get("title", "Unknown")
    artist = merged.get("artist", "Unknown")
    genre = merged.get("genre")

    if request.source in ("user", "fallback"):
        mpd_client = user_mpd if request.source == "user" else fallback_mpd
        try:
            await mpd_client.connect()
            current_song = await mpd_client.get_current_song()
            await mpd_client.disconnect()

            logger.debug(f"MPD enrichment for {request.source}: current_song={current_song}")

            if current_song and current_song.get("file"):
                mpd_title = current_song.get("title")
                mpd_artist = current_song.get("artist")
                mpd_genre = current_song.get("genre")

                filename = current_song.get("file")
                if filename:
                    playlist_type = cast(PlaylistType, request.source)
                    overrides = await redis_client.get_song_metadata(playlist_type, filename)
                    if overrides:
                        if "title" in overrides:
                            mpd_title = overrides["title"]
                        if "artist" in overrides:
                            mpd_artist = overrides["artist"]

                if mpd_title:
                    title = mpd_title
                    merged["title"] = title
                if mpd_artist:
                    artist = mpd_artist
                    merged["artist"] = artist
                if mpd_genre:
                    genre = mpd_genre
                    merged["genre"] = genre

                logger.debug(f"Enriched metadata from MPD: title={title}, artist={artist}")
        except Exception as e:
            logger.warning(f"Failed to fetch MPD metadata for enrichment: {e}")

    # Store the enriched metadata in Redis
    await redis_client.set_metadata(request.source, merged)

    if should_publish:
        await redis_client.set_active_source(request.source)
        logger.info(f"Active source '{request.source}' metadata updated: {merged}")

        # Publish queue_switched event if source changed
        if old_source and old_source != request.source:
            description = f"Switched from {old_source} to {request.source}"
            queue_switched_data = QueueSwitchedEventData(from_source=old_source, to_source=request.source)
            await event_publisher.publish(
                event_type="queue_switched",
                data=queue_switched_data.model_dump(),
                description=description,
            )
            logger.info(f"Published queue_switched event: {description}")

        description = f"Playing next: {title}"
        if artist and artist != "Unknown":
            description += f" by {artist}"

        event_data = SongChangedEventData(
            playlist=request.source,
            title=title,
            artist=artist,
            genre=genre,
        )

        event_hash = hashlib.md5(f"{title}:{artist}:{genre}".encode()).hexdigest()[:16]
        dedup_key = f"song_changed:dedup:{event_hash}"

        is_duplicate = await redis_client.redis.get(dedup_key)
        if is_duplicate:
            logger.debug(f"Skipping duplicate song_changed event for {request.source}: {title}")
        else:
            await redis_client.redis.setex(dedup_key, SONG_CHANGED_DEDUP_TTL, "1")
            await event_publisher.publish(
                event_type="song_changed",
                data=event_data.model_dump(),
                description=description,
            )
            logger.debug(f"Published song_changed event for {request.source}")

        # Publish metadata_updated event for recording worker (only for livestream)
        if request.source == "livestream":
            await event_publisher.publish(
                event_type="metadata_updated",
                data={"source": request.source, "metadata": merged},
                description=f"Metadata updated for {request.source}",
            )
            logger.debug(f"Published metadata_updated event for {request.source}")
    else:
        logger.debug(f"Ignored metadata from '{request.source}' (active source is '{active_source}')")

    return SuccessResponse()


@internal_router.post(
    "/metadata/set",
    response_model=SuccessResponse,
    summary="Set Livestream Metadata",
    description="Set custom livestream metadata (admin only)",
    dependencies=[Depends(require_admin_role)],
    responses={401: {"model": ErrorResponse}},
    include_in_schema=False,
)
async def set_livestream_metadata(
    request: MetadataSetRequest,
    redis_client: RedisService = Depends(dep_redis_client),
    event_publisher: EventPublisher = Depends(dep_event_publisher),
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

    # Publish metadata_updated event for recording worker
    await event_publisher.publish(
        event_type="metadata_updated",
        data={"source": "livestream", "metadata": metadata},
        description=f"Livestream metadata set: {metadata.get('title', 'N/A')}",
    )
    logger.debug("Published metadata_updated event for livestream metadata set")

    return SuccessResponse()
