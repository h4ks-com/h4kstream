
from pydantic import BaseModel


class DeleteSongRequest(BaseModel):
    song_id: str  # Unique ID for song (e.g., MPD queue ID)
