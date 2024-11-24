from fastapi import APIRouter
from fastapi import HTTPException
from fastapi import Request

from app.models import AddSongRequest
from app.services import mpd_service
from app.services import redis_service

router = APIRouter(prefix="/public", tags=["public"])


@router.post("/add")
async def add_song(request: AddSongRequest):
    if request.url:
        song_path = await mpd_service.download_and_add(request.url)
    elif request.file:
        song_path = mpd_service.add_local_song(request.file)
    else:
        raise HTTPException(status_code=400, detail="No valid URL or file provided.")

    # Add to Redis for tracking user ownership
    redis_service.store_song(request.client.host, song_path)
    return {"status": "success", "song_path": song_path}


@router.get("/list")
async def list_songs():
    return mpd_service.get_queue()


@router.post("/delete")
async def delete_song(song_id: int, request: Request):
    owner_ip = redis_service.get_song_owner(song_id)
    if not owner_ip or owner_ip != request.client.host:
        raise HTTPException(status_code=403, detail="You do not own this song.")
    mpd_service.remove_song(song_id)
    return {"status": "success"}
