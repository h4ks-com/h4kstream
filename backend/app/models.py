from typing import Optional

from pydantic import BaseModel


class AddSongRequest(BaseModel):
    url: Optional[str] = None
    file: Optional[str] = None  # File name if uploaded


class DeleteSongRequest(BaseModel):
    song_id: str  # Unique ID for song (e.g., MPD queue ID)
