from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter
from fastapi import Depends
from fastapi import Form
from fastapi import HTTPException
from fastapi import Request
from fastapi import UploadFile
from yt_dlp.utils import sanitize_filename

from app.dependencies import dep_mpd_client
from app.services.mpd_service import MPDClient
from app.services.youtube_dl import YoutubeDownloadException
from app.services.youtube_dl import download_song
from app.settings import settings

router = APIRouter(prefix="/public", tags=["public"])


@router.post("/add")
async def add_song(
    url: str | None = Form(None),
    song_name: str | None = Form(None),
    file: UploadFile | None = None,
    mpd_client: MPDClient = Depends(dep_mpd_client),
):
    # TODO: Check if user is allowed to add songs

    filename = uuid4().hex + ".mp3"
    music_path = Path(settings.VOLUME_PATH) / Path("music")
    target_path = music_path / Path(filename)
    if url and file:
        raise HTTPException(status_code=400, detail="Cannot provide both URL and file.")
    if url:
        try:
            result = await download_song(url)
        except YoutubeDownloadException as e:
            raise HTTPException(status_code=400, detail=e.error_type.value)
        song_path = result.path
        song_path = song_path.rename(target_path)
    elif file:
        song_path = Path(settings.VOLUME_PATH) / Path(
            sanitize_filename(song_name or file.filename or filename)
        )
        with open(song_path, "wb") as f:
            f.write(await file.read())
        song_path = song_path.rename(target_path)
    else:
        raise HTTPException(status_code=400, detail="No valid URL or file provided.")

    await mpd_client.add_local_song(song_path.name)

    # TODO: Add to Redis for tracking user ownership
    # redis_service.store_song(request.client.host, song_path)
    return {"status": "success"}


@router.get("/list")
async def list_songs(mpd_client: MPDClient = Depends(dep_mpd_client)):
    return mpd_client.get_queue()


@router.post("/delete")
async def delete_song(
    song_id: int,
    request: Request,
    mpd_client: MPDClient = Depends(dep_mpd_client),
):
    pass
    # owner_ip = redis_service.get_song_owner(song_id)
    # if not owner_ip or owner_ip != request.client.host:
    #     raise HTTPException(status_code=403, detail="You do not own this song.")
    # mpd_client.remove_song(song_id)
    # return {"status": "success"}
