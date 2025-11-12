"""Songs API endpoints for streaming cached audio files."""

import logging
import mimetypes
from pathlib import Path

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi.responses import FileResponse
from sqlmodel import Session
from sqlmodel import select

from app.db import get_session
from app.db.models import FileCache
from app.models import ErrorResponse

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/songs",
    tags=["songs"],
)


@router.get(
    "/stream/{cache_id}",
    response_class=FileResponse,
    summary="Stream Cached Song",
    description=(
        "Stream an audio file from the file cache by cache ID. "
        "Used as fallback when reference_url is not available. "
        "Returns the audio file with appropriate Content-Type headers."
    ),
    responses={
        200: {"description": "Audio file stream"},
        404: {"model": ErrorResponse, "description": "Cache entry or file not found"},
    },
)
async def stream_song(
    cache_id: int,
    db_session: Session = Depends(get_session),
) -> FileResponse:
    """Stream a cached audio file by cache ID."""
    # Look up cache entry
    statement = select(FileCache).where(FileCache.id == cache_id)
    cache_entry = db_session.exec(statement).first()

    if not cache_entry:
        raise HTTPException(status_code=404, detail=f"Cache entry {cache_id} not found")

    # Check if file exists
    file_path = Path(cache_entry.filepath)
    if not file_path.exists():
        logger.error(f"Cache entry {cache_id} points to missing file: {file_path}")
        raise HTTPException(status_code=404, detail="Audio file not found")

    # Determine media type using Python's mimetypes module
    media_type, _ = mimetypes.guess_type(str(file_path))
    # Fallback to audio/mpeg for unknown or None types
    if not media_type or not media_type.startswith("audio/"):
        media_type = "audio/mpeg"

    logger.info(f"Streaming cached song {cache_id}: {file_path.name}")

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=cache_entry.filename,
    )
