from fastapi import APIRouter
from fastapi import Depends

from app.dependencies import admin_auth

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(admin_auth)])


# @router.post("/mainloop-add")
# async def add_to_mainloop(request: AddSongRequest):
#     if not request.url and not request.file:
#         raise HTTPException(status_code=400, detail="URL or file is required.")

#     if request.url:
#         song_path = await mpd_service.download_and_add(request.url, mainloop=True)
#     else:
#         song_path = mpd_service.add_local_song(request.file, mainloop=True)

#     return {"status": "success", "song_path": song_path}


# @router.get("/list")
# async def list_all_songs():
#     return mpd_service.get_queue()


# @router.post("/delete")
# async def admin_delete_song(request: DeleteSongRequest):
#     mpd_service.remove_song(request.song_id)
#     return {"status": "success"}
