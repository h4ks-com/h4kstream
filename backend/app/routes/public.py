import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter
from fastapi import Depends
from fastapi import Form
from fastapi import HTTPException
from fastapi import UploadFile
from yt_dlp.utils import sanitize_filename

from app.dependencies import dep_mpd_client
from app.dependencies import jwt_or_admin_auth
from app.exceptions import FileNotFoundInMPDError
from app.exceptions import SongNotFoundError
from app.models import ErrorResponse
from app.models import SongItem
from app.models import SuccessResponse
from app.services.mpd_service import MPDClient
from app.services.youtube_dl import YoutubeDownloadException
from app.services.youtube_dl import download_song
from app.settings import MUSIC_DIR

router = APIRouter(
    prefix="/public",
    tags=["public"],
    responses={
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        403: {"model": ErrorResponse, "description": "Forbidden"},
    },
)


@router.post(
    "/add",
    response_model=SuccessResponse,
    summary="Add Song",
    description="Add a song to the queue from URL or file upload (requires authentication)",
    responses={400: {"model": ErrorResponse}},
)
async def add_song(
    url: str | None = Form(None),
    song_name: str | None = Form(None),
    file: UploadFile | None = None,
    mpd_client: MPDClient = Depends(dep_mpd_client),
    _: bool = Depends(jwt_or_admin_auth),
) -> SuccessResponse:

    filename = uuid4().hex + ".mp3"
    music_path = Path(MUSIC_DIR)
    target_path = music_path / Path(filename)
    if url and file:
        raise HTTPException(
            status_code=400, detail="Cannot provide both URL and file.")
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
        from app.settings import SONGS_DIR
        song_path = Path(SONGS_DIR) / Path(
            sanitize_filename(song_name or file.filename or filename)
        )
        with open(song_path, "wb") as f:
            f.write(await file.read())
        shutil.move(str(song_path), str(target_path))
        song_path = target_path
        await mpd_client.update_database()
    else:
        raise HTTPException(
            status_code=400, detail="No valid URL or file provided.")

    try:
        await mpd_client.add_local_song(song_path.name)
    except FileNotFoundInMPDError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return SuccessResponse()


@router.get(
    "/list",
    response_model=list[SongItem],
    summary="List Songs",
    description="Get all songs in the queue (no authentication required)",
)
async def list_songs(mpd_client: MPDClient = Depends(dep_mpd_client)) -> list[SongItem]:
    """Get all songs in the queue."""
    queue = await mpd_client.get_queue()
    print("Queue:", queue)
    return [SongItem(**song) for song in queue]


@router.delete(
    "/delete/{song_id}",
    response_model=SuccessResponse,
    summary="Delete Song",
    description="Delete a song from the queue (requires authentication)",
    responses={404: {"model": ErrorResponse, "description": "Song not found"}},
)
async def delete_song(
    song_id: int,
    mpd_client: MPDClient = Depends(dep_mpd_client),
    _: bool = Depends(jwt_or_admin_auth),
) -> SuccessResponse:
    """Delete a song from the queue (requires authentication)."""
    try:
        await mpd_client.remove_song(song_id)
    except SongNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return SuccessResponse()
