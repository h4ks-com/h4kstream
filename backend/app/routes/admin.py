import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter
from fastapi import Depends
from fastapi import Form
from fastapi import HTTPException
from fastapi import UploadFile
from yt_dlp.utils import sanitize_filename

from app.dependencies import admin_auth
from app.dependencies import dep_mpd_client
from app.exceptions import FileNotFoundInMPDError
from app.exceptions import SongNotFoundError
from app.models import ErrorResponse
from app.models import SuccessResponse
from app.models import TokenCreateRequest
from app.models import TokenCreateResponse
from app.services.jwt_service import generate_token
from app.services.mpd_service import MPDClient
from app.services.youtube_dl import YoutubeDownloadException
from app.services.youtube_dl import download_song
from app.settings import MUSIC_DIR
from app.settings import SONGS_DIR

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
    description="Create a temporary JWT token with specified duration (max 1 day)",
)
async def create_token(request: TokenCreateRequest) -> TokenCreateResponse:
    """Create a temporary JWT token with specified duration (max 1 day)."""
    token = generate_token(request.duration_seconds)
    return TokenCreateResponse(token=token)


@router.post(
    "/add",
    response_model=SuccessResponse,
    summary="Admin Add Song",
    description="Admin endpoint to add songs without restrictions",
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
    music_path = Path(MUSIC_DIR)
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
    return SuccessResponse()


@router.delete(
    "/delete/{song_id}",
    response_model=SuccessResponse,
    summary="Admin Delete Song",
    description="Admin endpoint to delete any song from queue",
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
    summary="Admin Clear Queue",
    description="Admin endpoint to clear all songs from queue",
)
async def admin_clear_queue(mpd_client: MPDClient = Depends(dep_mpd_client)) -> SuccessResponse:
    """Admin endpoint to clear all songs from queue."""
    await mpd_client.clear_queue()
    return SuccessResponse()
