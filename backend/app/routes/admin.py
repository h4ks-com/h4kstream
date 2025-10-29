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

from app.dependencies import admin_auth
from app.dependencies import dep_redis_client
from app.exceptions import FileNotFoundInMPDError
from app.exceptions import SongNotFoundError
from app.models import ErrorResponse
from app.models import LivestreamTokenCreateRequest
from app.models import LivestreamTokenResponse
from app.models import SongAddedResponse
from app.models import SongItem
from app.models import SuccessResponse
from app.models import TokenCreateRequest
from app.models import TokenCreateResponse
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
    token = generate_token(request.duration_seconds, request.max_queue_songs, request.max_add_requests)
    return TokenCreateResponse(token=token)


@router.post(
    "/livestream/token",
    response_model=LivestreamTokenResponse,
    summary="Create Livestream Token",
    description="Create a livestream token with time limit. User can stream until time limit is reached.",
)
async def create_livestream_token(request: LivestreamTokenCreateRequest) -> LivestreamTokenResponse:
    """Create a livestream token with specified time limit."""
    token, expires_at = generate_livestream_token(request.max_streaming_seconds)
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
        "Bypasses all queue limits and add request limits. "
        "Default: user queue"
    ),
    responses={400: {"model": ErrorResponse}},
)
async def admin_add_song(
    url: str | None = Form(None),
    song_name: str | None = Form(None),
    artist: str | None = Form(None),
    file: UploadFile | None = None,
    playlist: PlaylistType = Query("user", description="Target playlist (user or fallback)"),
    redis_client: RedisService = Depends(dep_redis_client),
) -> SongAddedResponse:
    """Add song to specified playlist without restrictions."""
    mpd_client = get_mpd_client(playlist)

    try:
        await mpd_client.connect()
        song_id = await queue_service.add_song(
            playlist=playlist,
            mpd_client=mpd_client,
            url=url,
            file=file,
            song_name=song_name,
            artist_name=artist,
            redis_client=redis_client,
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
) -> list[SongItem]:
    """List all songs in the specified playlist."""
    mpd_client = get_mpd_client(playlist)

    try:
        await mpd_client.connect()
        return await queue_service.list_songs(mpd_client, playlist)
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
