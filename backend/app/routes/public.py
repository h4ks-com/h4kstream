"""Public API endpoints for user queue management.

User-facing endpoints that require JWT tokens. Users can only access their own user queue, not the radio playlist.
"""

import logging

from fastapi import APIRouter
from fastapi import Depends
from fastapi import Form
from fastapi import HTTPException
from fastapi import Query
from fastapi import UploadFile

from app.dependencies import dep_mpd_user
from app.dependencies import dep_redis_client
from app.dependencies import get_jwt_token
from app.exceptions import FileNotFoundInMPDError
from app.exceptions import SongNotFoundError
from app.models import ErrorResponse
from app.models import SongAddedResponse
from app.models import SongItem
from app.models import SuccessResponse
from app.services import playback_service
from app.services import queue_service
from app.services.jwt_service import get_max_add_requests
from app.services.jwt_service import get_max_queue_songs
from app.services.jwt_service import get_user_id
from app.services.mpd_service import MPDClient
from app.services.redis_service import RedisService
from app.services.redis_service import parse_song_id
from app.services.youtube_dl import YoutubeDownloadException

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/queue",
    tags=["queue"],
    responses={
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        403: {"model": ErrorResponse, "description": "Forbidden"},
    },
)


@router.post(
    "/add",
    response_model=SongAddedResponse,
    summary="Add Song to User Queue",
    description=(
        "Add a song to your queue. Requires JWT token. "
        "Subject to limits: (1) max_queue_songs - simultaneous songs in queue, "
        "(2) max_add_requests - total lifetime add requests, "
        "(3) max_song_duration - song duration limit (30 min default), "
        "(4) max_file_size - file size limit (50MB default), "
        "(5) duplicate prevention - cannot add songs already in next 5 songs"
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request or validation failed"},
        403: {"model": ErrorResponse, "description": "Queue limit or add request limit exceeded"},
    },
)
async def add_song(
    url: str | None = Form(None),
    song_name: str | None = Form(None),
    artist: str | None = Form(None),
    file: UploadFile | None = None,
    mpd_client: MPDClient = Depends(dep_mpd_user),
    redis_client: RedisService = Depends(dep_redis_client),
    token: str = Depends(get_jwt_token),
) -> SongAddedResponse:
    """Add a song to your user queue with validation checks."""
    user_id = get_user_id(token)
    max_songs = get_max_queue_songs(token)
    max_adds = get_max_add_requests(token)

    # Check limits
    current_queue_count = await redis_client.get_user_song_count(user_id)
    current_add_count = await redis_client.get_user_add_count(user_id)

    if current_queue_count >= max_songs:
        raise HTTPException(
            status_code=403, detail=f"Queue limit exceeded: {current_queue_count}/{max_songs} songs in queue"
        )

    if current_add_count >= max_adds:
        raise HTTPException(
            status_code=403, detail=f"Add request limit exceeded: {current_add_count}/{max_adds} total requests used"
        )

    # Get MPD clients for duplicate checking
    user_mpd = playback_service.get_mpd_client("user")
    fallback_mpd = playback_service.get_mpd_client("fallback")

    try:
        await user_mpd.connect()
        await fallback_mpd.connect()

        song_id = await queue_service.add_song(
            playlist="user",
            mpd_client=mpd_client,
            url=url,
            file=file,
            song_name=song_name,
            artist_name=artist,
            redis_client=redis_client,
            user_id=user_id,
            skip_validation=False,
            user_mpd_client=user_mpd,
            fallback_mpd_client=fallback_mpd,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except YoutubeDownloadException as e:
        raise HTTPException(status_code=400, detail=e.error_type.value)
    except FileNotFoundInMPDError as e:
        raise HTTPException(status_code=404, detail=str(e))
    finally:
        await user_mpd.disconnect()
        await fallback_mpd.disconnect()

    return SongAddedResponse(song_id=song_id)


@router.get(
    "/list",
    response_model=list[SongItem],
    summary="List Queue Songs",
    description=(
        "Get songs in the queue (shared by all users). "
        "Returns user queue songs first, then fallback playlist songs. "
        "No authentication required."
    ),
    responses={400: {"model": ErrorResponse, "description": "Invalid limit parameter"}},
)
async def list_songs(
    limit: int = Query(20, ge=1, le=20, description="Maximum number of songs to return (1-20)"),
) -> list[SongItem]:
    """Get songs from user queue and fallback playlist."""
    user_mpd = playback_service.get_mpd_client("user")
    fallback_mpd = playback_service.get_mpd_client("fallback")

    try:
        await user_mpd.connect()
        await fallback_mpd.connect()
        return await queue_service.get_next_songs(user_mpd, fallback_mpd, limit)
    finally:
        await user_mpd.disconnect()
        await fallback_mpd.disconnect()


@router.delete(
    "/{song_id}",
    response_model=SuccessResponse,
    summary="Delete Song from User Queue",
    description=(
        "Delete a song from your queue. Requires JWT token (you can only delete your own songs). "
        "Note: Deleting a song does NOT decrease the total add request count - "
        "the max_add_requests limit persists regardless of deletions."
    ),
    responses={404: {"model": ErrorResponse, "description": "Song not found"}},
)
async def delete_song(
    song_id: str,
    mpd_client: MPDClient = Depends(dep_mpd_user),
    redis_client: RedisService = Depends(dep_redis_client),
    token: str = Depends(get_jwt_token),
) -> SuccessResponse:
    """Delete one of your songs from the user queue."""
    user_id = get_user_id(token)

    try:
        mpd_id, playlist = parse_song_id(song_id)
        if playlist != "user":
            raise HTTPException(status_code=400, detail="Can only delete from user queue")

        await queue_service.delete_song(
            song_id=mpd_id, playlist=playlist, mpd_client=mpd_client, redis_client=redis_client, user_id=user_id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except SongNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return SuccessResponse()
