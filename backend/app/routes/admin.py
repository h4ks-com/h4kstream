import logging
import shutil
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter
from fastapi import Depends
from fastapi import Form
from fastapi import HTTPException
from fastapi import UploadFile
from yt_dlp.utils import sanitize_filename

from app.dependencies import admin_auth
from app.dependencies import dep_mpd_client
from app.dependencies import dep_mpd_fallback
from app.dependencies import dep_mpd_user
from app.exceptions import FileNotFoundInMPDError
from app.exceptions import SongNotFoundError
from app.models import ErrorResponse
from app.models import LivestreamTokenCreateRequest
from app.models import LivestreamTokenResponse
from app.models import SongItem
from app.models import SuccessResponse
from app.models import TokenCreateRequest
from app.models import TokenCreateResponse
from app.services.jwt_service import generate_livestream_token
from app.services.jwt_service import generate_token
from app.services.mpd_service import MPDClient
from app.services.youtube_dl import YoutubeDownloadException
from app.services.youtube_dl import download_song
from app.settings import MUSIC_FALLBACK_DIR
from app.settings import MUSIC_USER_DIR
from app.settings import SONGS_DIR
from app.settings import settings

logger = logging.getLogger(__name__)

PlaylistType = Literal["user", "fallback"]

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(admin_auth)],
    responses={401: {"model": ErrorResponse, "description": "Unauthorized"}},
)


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


@router.post(
    "/add",
    response_model=SuccessResponse,
    summary="Admin Add Song to User Queue",
    description=(
        "Admin endpoint to add songs to user queue without restrictions. "
        "Bypasses both queue limits and add request limits. Requires admin token."
    ),
    responses={400: {"model": ErrorResponse}},
)
async def admin_add_song(
    url: str | None = Form(None),
    song_name: str | None = Form(None),
    file: UploadFile | None = None,
    mpd_client: MPDClient = Depends(dep_mpd_client),
) -> SuccessResponse:
    """Admin endpoint to add songs without restrictions."""
    filename = uuid4().hex + ".mp3"
    music_path = Path(MUSIC_USER_DIR)
    target_path = music_path / Path(filename)

    if url and file:
        raise HTTPException(status_code=400, detail="Cannot provide both URL and file.")

    if url:
        try:
            result = await download_song(url)
        except YoutubeDownloadException as e:
            raise HTTPException(status_code=400, detail=e.error_type.value)
        song_path = result.path
        shutil.move(str(song_path), str(target_path))
        song_path = target_path
        await mpd_client.update_database()
    elif file:
        song_path = Path(SONGS_DIR) / Path(sanitize_filename(song_name or file.filename or filename))
        with open(song_path, "wb") as f:
            f.write(await file.read())
        shutil.move(str(song_path), str(target_path))
        song_path = target_path
        await mpd_client.update_database()
    else:
        raise HTTPException(status_code=400, detail="No valid URL or file provided.")

    try:
        await mpd_client.add_local_song(song_path.name)
    except FileNotFoundInMPDError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Enable consume mode to auto-remove songs after playback
    await mpd_client.set_consume(True)
    # Always start user queue playback
    await mpd_client.play()
    return SuccessResponse()


@router.delete(
    "/delete/{song_id}",
    response_model=SuccessResponse,
    summary="Admin Delete Song from User Queue",
    description=(
        "Admin endpoint to delete any song from user queue (not restricted to own songs). " "Requires admin token."
    ),
    responses={404: {"model": ErrorResponse, "description": "Song not found"}},
)
async def admin_delete_song(song_id: int, mpd_client: MPDClient = Depends(dep_mpd_client)) -> SuccessResponse:
    """Admin endpoint to delete any song."""
    try:
        await mpd_client.remove_song(song_id)
    except SongNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return SuccessResponse()


@router.post(
    "/clear",
    response_model=SuccessResponse,
    summary="Admin Clear User Queue",
    description="Admin endpoint to clear all songs from user queue. Requires admin token.",
)
async def admin_clear_queue(mpd_client: MPDClient = Depends(dep_mpd_user)) -> SuccessResponse:
    """Admin endpoint to clear all songs from user queue."""
    await mpd_client.clear_queue()
    return SuccessResponse()


@router.post(
    "/fallback/add",
    response_model=SuccessResponse,
    summary="Admin Add Song to Fallback Playlist",
    description=(
        "Add songs to the fallback playlist. This playlist plays continuously with repeat and random enabled. "
        "Only accessible by admin. Never auto-cleans up - songs remain until explicitly deleted."
    ),
    responses={400: {"model": ErrorResponse}},
)
async def admin_add_fallback_song(
    url: str | None = Form(None),
    song_name: str | None = Form(None),
    file: UploadFile | None = None,
    mpd_client: MPDClient = Depends(dep_mpd_fallback),
) -> SuccessResponse:
    """Add song to fallback playlist."""
    filename = uuid4().hex + ".mp3"
    music_path = Path(MUSIC_FALLBACK_DIR)
    target_path = music_path / Path(filename)

    if url and file:
        raise HTTPException(status_code=400, detail="Cannot provide both URL and file.")

    if url:
        try:
            result = await download_song(url)
        except YoutubeDownloadException as e:
            raise HTTPException(status_code=400, detail=e.error_type.value)
        song_path = result.path
        shutil.move(str(song_path), str(target_path))
        await mpd_client.update_database()
    elif file:
        song_path = Path(SONGS_DIR) / Path(sanitize_filename(song_name or file.filename or filename))
        with open(song_path, "wb") as f:
            f.write(await file.read())
        shutil.move(str(song_path), str(target_path))
        await mpd_client.update_database()
    else:
        raise HTTPException(status_code=400, detail="No valid URL or file provided.")

    try:
        await mpd_client.add_local_song(target_path.name)
    except FileNotFoundInMPDError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Always enable repeat/random and start playback for fallback
    await mpd_client.set_repeat(True)
    await mpd_client.set_random(True)
    await mpd_client.play()

    return SuccessResponse()


@router.delete(
    "/fallback/delete/{song_id}",
    response_model=SuccessResponse,
    summary="Admin Delete Song from Fallback Playlist",
    description="Delete a specific song from the fallback playlist. Requires admin token.",
    responses={404: {"model": ErrorResponse, "description": "Song not found"}},
)
async def admin_delete_fallback_song(
    song_id: int, mpd_client: MPDClient = Depends(dep_mpd_fallback)
) -> SuccessResponse:
    """Delete song from fallback playlist."""
    try:
        await mpd_client.remove_song(song_id)
    except SongNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return SuccessResponse()


@router.get(
    "/fallback/list",
    response_model=list[SongItem],
    summary="Admin List Fallback Playlist Songs",
    description=(
        "Get all songs in the fallback playlist. This playlist loops continuously when user queue is empty. "
        "Requires admin token."
    ),
)
async def admin_list_fallback(mpd_client: MPDClient = Depends(dep_mpd_fallback)) -> list[SongItem]:
    """Get all songs in fallback playlist."""
    queue = await mpd_client.get_queue()
    return [SongItem(**song) for song in queue]


@router.post(
    "/fallback/clear",
    response_model=SuccessResponse,
    summary="Admin Clear Fallback Playlist",
    description="Clear all songs from the fallback playlist. Requires admin token.",
)
async def admin_clear_fallback(mpd_client: MPDClient = Depends(dep_mpd_fallback)) -> SuccessResponse:
    """Clear all songs from fallback playlist."""
    await mpd_client.clear_queue()
    return SuccessResponse()


def get_mpd_client(playlist: PlaylistType) -> MPDClient:
    match playlist:
        case "user":
            return MPDClient(settings.MPD_USER_HOST, settings.MPD_USER_PORT)
        case "fallback":
            return MPDClient(settings.MPD_FALLBACK_HOST, settings.MPD_FALLBACK_PORT)


@router.get(
    "/play",
    response_model=SuccessResponse,
    summary="Admin Play MPD Playlist",
    description="Start playback on specified playlist (user or fallback). Requires admin token.",
    responses={400: {"model": ErrorResponse, "description": "Invalid playlist name"}},
)
async def admin_play(playlist: PlaylistType) -> SuccessResponse:
    """Start playback on specified MPD playlist."""
    client = get_mpd_client(playlist)
    try:
        await client.connect()

        # Enable repeat and random for fallback playlist
        if playlist == "fallback":
            await client.set_repeat(True)
            await client.set_random(True)

        await client.play()
        return SuccessResponse()
    finally:
        await client.disconnect()


@router.get(
    "/pause",
    response_model=SuccessResponse,
    summary="Admin Pause MPD Playlist",
    description="Pause playback on specified playlist (user or fallback). Requires admin token.",
    responses={400: {"model": ErrorResponse, "description": "Invalid playlist name"}},
)
async def admin_pause(playlist: PlaylistType) -> SuccessResponse:
    """Pause playback on specified MPD playlist."""
    client = get_mpd_client(playlist)

    try:
        await client.connect()
        await client.pause()
        return SuccessResponse()
    finally:
        await client.disconnect()
