"""Admin API endpoints for complete system control.

Admin-only endpoints that can manage both user queue and radio playlist, create tokens, and control playback.
"""

import logging

from fastapi import APIRouter
from fastapi import Depends
from fastapi import Form
from fastapi import HTTPException
from fastapi import Query
from fastapi import UploadFile
from sqlmodel import Session
from sqlmodel import select

from app.db import get_session
from app.db.models import FileCachePublic
from app.db.models import Show
from app.dependencies import admin_auth
from app.dependencies import dep_redis_client
from app.exceptions import FileNotFoundInMPDError
from app.exceptions import SongNotFoundError
from app.models import ErrorResponse
from app.models import LivestreamTokenCreateRequest
from app.models import LivestreamTokenResponse
from app.models import SongAddedResponse
from app.models import SongItem
from app.models import SongMetadataEditRequest
from app.models import SuccessResponse
from app.models import TokenCreateRequest
from app.models import TokenCreateResponse
from app.services import cache_service
from app.services import metadata_editor
from app.services import playback_service
from app.services import queue_service
from app.services.jwt_service import generate_livestream_token
from app.services.jwt_service import generate_token
from app.services.playback_service import get_mpd_client
from app.services.redis_service import RedisService
from app.services.redis_service import parse_song_id
from app.services.youtube_dl import YoutubeDownloadException
from app.types import PlaylistType

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(admin_auth)],
    responses={401: {"model": ErrorResponse, "description": "Unauthorized"}},
)


# =============================================================================
# Token Management
# =============================================================================


@router.post(
    "/token",
    response_model=TokenCreateResponse,
    summary="Create JWT Token",
    description="Create a temporary JWT token with duration, queue limit, and total add request limit",
)
async def create_token(request: TokenCreateRequest) -> TokenCreateResponse:
    """Create a temporary JWT token with duration, queue limit, and add request limit."""
    token = generate_token(
        duration_seconds=request.duration_seconds,
        max_queue_songs=request.max_queue_songs,
        max_add_requests=request.max_add_requests,
    )
    return TokenCreateResponse(token=token, refresh_token=None)


@router.post(
    "/livestream/token",
    response_model=LivestreamTokenResponse,
    summary="Create Livestream Token",
    description="Create a livestream token. Auto-creates show if show_name provided and doesn't exist.",
)
async def create_livestream_token(
    request: LivestreamTokenCreateRequest, session=Depends(get_session)
) -> LivestreamTokenResponse:
    """Create a livestream token with specified time limit and recording settings.

    If show_name is provided and doesn't exist, auto-creates it without an owner. Admin tokens have no ownership
    validation.
    """
    show_name = request.show_name
    intro_filename = None

    if show_name:
        show = session.exec(select(Show).where(Show.show_name == show_name)).first()
        if not show:
            show = Show(show_name=show_name, owner_id=None, is_active=True)
            session.add(show)
            session.commit()
            session.refresh(show)
        intro_filename = show.intro_filename

    token, expires_at = generate_livestream_token(
        request.max_streaming_seconds, show_name, None, request.min_recording_duration, intro_filename
    )
    return LivestreamTokenResponse(
        token=token, expires_at=expires_at.isoformat(), max_streaming_seconds=request.max_streaming_seconds
    )


# =============================================================================
# Queue Operations
# =============================================================================


@router.post(
    "/queue/add",
    response_model=SongAddedResponse,
    summary="Admin Add Song",
    description=(
        "Add a song to any playlist (user queue or fallback playlist). "
        "Bypasses all limits: queue limits, add request limits, duration limits, file size limits, and duplicate checks. "
        "Default: user queue"
    ),
    responses={400: {"model": ErrorResponse}},
)
async def admin_add_song(
    url: str | None = Form(None),
    song_name: str | None = Form(None),
    artist: str | None = Form(None),
    reference_url: str | None = Form(None),
    file: UploadFile | None = None,
    playlist: PlaylistType = Query("user", description="Target playlist (user or fallback)"),
    redis_client: RedisService = Depends(dep_redis_client),
    db_session: Session = Depends(get_session),
) -> SongAddedResponse:
    """Add song to specified playlist without any restrictions or validation."""
    mpd_client = get_mpd_client(playlist)

    try:
        await mpd_client.connect()
        song_id = await queue_service.add_song(
            playlist=playlist,
            mpd_client=mpd_client,
            db_session=db_session,
            url=url,
            file=file,
            song_name=song_name,
            artist_name=artist,
            reference_url=reference_url,
            redis_client=redis_client,
            skip_validation=True,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except YoutubeDownloadException as e:
        raise HTTPException(status_code=400, detail=e.error_type.value)
    except FileNotFoundInMPDError as e:
        raise HTTPException(status_code=404, detail=str(e))
    finally:
        await mpd_client.disconnect()

    return SongAddedResponse(song_id=song_id)


@router.get(
    "/queue/list",
    response_model=list[SongItem],
    summary="Admin List Songs",
    description="Get all songs in any playlist. Default: user queue",
)
async def admin_list_songs(
    playlist: PlaylistType = Query("user", description="Target playlist (user or fallback)"),
    redis_client: RedisService = Depends(dep_redis_client),
    db_session: Session = Depends(get_session),
) -> list[SongItem]:
    """List all songs in the specified playlist."""
    mpd_client = get_mpd_client(playlist)

    try:
        await mpd_client.connect()
        return await queue_service.list_songs(mpd_client, playlist, redis_client, db_session)
    finally:
        await mpd_client.disconnect()


@router.delete(
    "/queue/{song_id}",
    response_model=SuccessResponse,
    summary="Admin Delete Song",
    description="Delete a specific song from any playlist. Default: user queue",
    responses={404: {"model": ErrorResponse, "description": "Song not found"}},
)
async def admin_delete_song(
    song_id: str,
    playlist: PlaylistType = Query("user", description="Target playlist (user or fallback)"),
) -> SuccessResponse:
    """Delete song from specified playlist."""
    try:
        mpd_id, parsed_playlist = parse_song_id(song_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if parsed_playlist != playlist:
        raise HTTPException(
            status_code=400, detail=f"Song ID prefix '{parsed_playlist}' doesn't match playlist '{playlist}'"
        )

    mpd_client = get_mpd_client(playlist)

    try:
        await mpd_client.connect()
        await queue_service.delete_song(song_id=mpd_id, playlist=playlist, mpd_client=mpd_client)
    except SongNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    finally:
        await mpd_client.disconnect()

    return SuccessResponse()


@router.post(
    "/queue/clear",
    response_model=SuccessResponse,
    summary="Admin Clear Queue",
    description="Clear all songs from any playlist. Default: user queue",
)
async def admin_clear_queue(
    playlist: PlaylistType = Query("user", description="Target playlist (user or fallback)"),
) -> SuccessResponse:
    """Clear all songs from specified playlist."""
    mpd_client = get_mpd_client(playlist)

    try:
        await mpd_client.connect()
        await queue_service.clear_queue(mpd_client, playlist)
    finally:
        await mpd_client.disconnect()

    return SuccessResponse()


# =============================================================================
# Playback Control
# =============================================================================


@router.post(
    "/playback/play",
    response_model=SuccessResponse,
    summary="Admin Play",
    description="Start playback on any playlist. Default: user queue",
    responses={400: {"model": ErrorResponse, "description": "Invalid playlist"}},
)
async def admin_play(
    playlist: PlaylistType = Query("user", description="Target playlist (user or fallback)"),
) -> SuccessResponse:
    """Start playback on specified playlist."""
    await playback_service.control_playback("play", playlist)
    return SuccessResponse()


@router.post(
    "/playback/pause",
    response_model=SuccessResponse,
    summary="Admin Pause",
    description="Pause playback on any playlist. Default: user queue",
    responses={400: {"model": ErrorResponse, "description": "Invalid playlist"}},
)
async def admin_pause(
    playlist: PlaylistType = Query("user", description="Target playlist (user or fallback)"),
) -> SuccessResponse:
    """Pause playback on specified playlist."""
    await playback_service.control_playback("pause", playlist)
    return SuccessResponse()


@router.post(
    "/playback/resume",
    response_model=SuccessResponse,
    summary="Admin Resume",
    description="Resume playback on any playlist. Default: user queue",
    responses={400: {"model": ErrorResponse, "description": "Invalid playlist"}},
)
async def admin_resume(
    playlist: PlaylistType = Query("user", description="Target playlist (user or fallback)"),
) -> SuccessResponse:
    """Resume playback on specified playlist."""
    await playback_service.control_playback("resume", playlist)
    return SuccessResponse()


@router.get(
    "/cache",
    response_model=dict,
    summary="List Cached Files",
    description="List all cached files with pagination and search",
)
async def list_cache(
    playlist: PlaylistType | None = Query(None, description="Filter by playlist type"),
    search: str | None = Query(None, description="Search in filename or origin_url"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db_session: Session = Depends(get_session),
) -> dict:
    """List cached files with pagination and search."""
    entries, total = await cache_service.list_cache_entries(
        db_session, playlist_type=playlist, search=search, offset=offset, limit=limit
    )

    return {
        "entries": [FileCachePublic.model_validate(entry) for entry in entries],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.delete(
    "/cache/{cache_id}",
    response_model=SuccessResponse,
    summary="Delete Cache Entry",
    description="Delete a cache entry and optionally the file",
    responses={404: {"model": ErrorResponse, "description": "Cache entry not found"}},
)
async def delete_cache(
    cache_id: int,
    delete_file: bool = Query(False, description="Also delete the physical file"),
    db_session: Session = Depends(get_session),
) -> SuccessResponse:
    """Delete cache entry and optionally the file."""
    try:
        await cache_service.delete_cache_entry(db_session, cache_id, delete_file)
        return SuccessResponse()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch(
    "/queue/{playlist}/{song_id}/metadata",
    response_model=SuccessResponse,
    summary="Admin Edit Song Metadata",
    description=(
        "Edit metadata of any song in user queue or fallback playlist. "
        "Updates both ID3 tags in the audio file and Redis cache. "
        "Admins can edit any song. Only MP3 files supported."
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request or file format"},
        404: {"model": ErrorResponse, "description": "Song not found"},
    },
)
async def admin_edit_song_metadata(
    playlist: PlaylistType,
    song_id: str,
    request: SongMetadataEditRequest,
    redis_client: RedisService = Depends(dep_redis_client),
) -> SuccessResponse:
    """Edit metadata for any song (admin only)."""
    # Parse song ID to get MPD ID
    try:
        mpd_song_id, _ = parse_song_id(song_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid song ID format")

    # Get MPD client for the specified playlist
    mpd_client = get_mpd_client(playlist)

    try:
        await mpd_client.connect()

        # Get song file path from MPD
        file_path = await metadata_editor.get_song_file_path(playlist, str(mpd_song_id), mpd_client)

        if not file_path:
            raise HTTPException(status_code=404, detail="Song not found in queue")

        # Update metadata (ID3 + Redis)
        try:
            await metadata_editor.update_song_metadata(
                redis_client=redis_client,
                playlist=playlist,
                mpd_song_id=str(mpd_song_id),
                file_path=file_path,
                title=request.title,
                artist=request.artist,
                album=request.album,
                genre=request.genre,
            )
        except metadata_editor.MetadataEditException as e:
            raise HTTPException(status_code=400, detail=str(e))
    finally:
        await mpd_client.disconnect()

    return SuccessResponse()


@router.get(
    "/cache/stats",
    response_model=dict,
    summary="Cache Statistics",
    description="Get cache statistics",
)
async def cache_stats(
    db_session: Session = Depends(get_session),
) -> dict:
    """Get cache statistics."""
    return await cache_service.get_cache_stats(db_session)
