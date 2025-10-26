import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter
from fastapi import Depends
from fastapi import Form
from fastapi import HTTPException
from fastapi import UploadFile
from yt_dlp.utils import sanitize_filename

from app.dependencies import dep_mpd_user
from app.dependencies import dep_redis_client
from app.dependencies import get_jwt_token
from app.exceptions import FileNotFoundInMPDError
from app.exceptions import SongNotFoundError
from app.models import ErrorResponse
from app.models import SongItem
from app.models import SuccessResponse
from app.services.jwt_service import get_max_add_requests
from app.services.jwt_service import get_max_queue_songs
from app.services.jwt_service import get_user_id
from app.services.mpd_service import MPDClient
from app.services.redis_service import RedisService
from app.services.youtube_dl import YoutubeDownloadException
from app.services.youtube_dl import download_song
from app.settings import MUSIC_USER_DIR

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
    summary="Add Song to User Queue",
    description=(
        "Add a song to the user queue. Requires JWT token. "
        "Subject to two limits: (1) max_queue_songs - simultaneous songs in queue, "
        "(2) max_add_requests - total lifetime add requests (persists even after deletes)"
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        403: {"model": ErrorResponse, "description": "Queue limit or add request limit exceeded"},
    },
)
async def add_song(
    url: str | None = Form(None),
    song_name: str | None = Form(None),
    file: UploadFile | None = None,
    mpd_client: MPDClient = Depends(dep_mpd_user),
    redis_client: RedisService = Depends(dep_redis_client),
    token: str = Depends(get_jwt_token),
) -> SuccessResponse:
    user_id = get_user_id(token)
    max_songs = get_max_queue_songs(token)
    max_adds = get_max_add_requests(token)

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
        await mpd_client.update_database()
    elif file:
        from app.settings import SONGS_DIR

        song_path = Path(SONGS_DIR) / Path(sanitize_filename(song_name or file.filename or filename))
        with open(song_path, "wb") as f:
            f.write(await file.read())
        shutil.move(str(song_path), str(target_path))
        await mpd_client.update_database()
    else:
        raise HTTPException(status_code=400, detail="No valid URL or file provided.")

    try:
        song_id = await mpd_client.add_local_song(target_path.name)
        await redis_client.add_user_song(user_id, str(song_id), target_path.name)
        await redis_client.map_song_to_user(str(song_id), user_id)
        await redis_client.increment_user_add_count(user_id)
    except FileNotFoundInMPDError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Enable consume mode to auto-remove songs after playback
    await mpd_client.set_consume(True)
    # Always start user queue playback
    await mpd_client.play()
    return SuccessResponse()


@router.get(
    "/list",
    response_model=list[SongItem],
    summary="List User Queue Songs",
    description=(
        "Get all songs currently in the user queue. "
        "No authentication required - this is a public endpoint showing the current playback queue."
    ),
)
async def list_songs(mpd_client: MPDClient = Depends(dep_mpd_user)) -> list[SongItem]:
    """Get all songs in the user queue."""
    queue = await mpd_client.get_queue()
    return [SongItem(**song) for song in queue]


@router.delete(
    "/delete/{song_id}",
    response_model=SuccessResponse,
    summary="Delete Song from User Queue",
    description=(
        "Delete a song from the user queue. Requires JWT token (user can only delete their own songs). "
        "Note: Deleting a song does NOT decrease the total add request count - "
        "the max_add_requests limit persists regardless of deletions."
    ),
    responses={404: {"model": ErrorResponse, "description": "Song not found"}},
)
async def delete_song(
    song_id: int,
    mpd_client: MPDClient = Depends(dep_mpd_user),
    redis_client: RedisService = Depends(dep_redis_client),
    token: str = Depends(get_jwt_token),
) -> SuccessResponse:
    """Delete a song from the user queue."""
    user_id = get_user_id(token)
    try:
        await mpd_client.remove_song(song_id)
        await redis_client.remove_user_song(user_id, str(song_id))
    except SongNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return SuccessResponse()
