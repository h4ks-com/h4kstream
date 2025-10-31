"""Public and admin endpoints for livestream recordings."""

import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Query
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.db import get_session
from app.db import recordings as recordings_db
from app.dependencies import admin_auth
from app.models import ErrorResponse
from app.models import RecordingMetadata
from app.models import RecordingsListResponse
from app.models import ShowRecordings
from app.models import SuccessResponse
from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/recordings", tags=["recordings"])

admin_router = APIRouter(
    prefix="/admin/recordings",
    tags=["admin"],
    dependencies=[Depends(admin_auth)],
    responses={401: {"model": ErrorResponse, "description": "Unauthorized"}},
)


@router.get(
    "/list",
    response_model=RecordingsListResponse,
    summary="List Recordings",
    description="List and search livestream recordings with filters and pagination",
)
async def list_recordings(
    db: Session = Depends(get_session),
    show_name: str | None = Query(None, description="Filter by show name (exact match)"),
    search: str | None = Query(None, description="Search in title, artist, genre, description"),
    genre: str | None = Query(None, description="Filter by genre (exact match)"),
    date_from: str | None = Query(None, description="Filter by date from (ISO format)"),
    date_to: str | None = Query(None, description="Filter by date to (ISO format)"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=100, description="Page size (max 100)"),
) -> RecordingsListResponse:
    """List and search recordings with filters and pagination."""
    date_from_dt = None
    if date_from:
        try:
            date_from_dt = datetime.fromisoformat(date_from)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_from format. Use ISO format.")

    date_to_dt = None
    if date_to:
        try:
            date_to_dt = datetime.fromisoformat(date_to)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_to format. Use ISO format.")

    offset = (page - 1) * page_size
    recordings, total_recordings = recordings_db.list_recordings(
        db=db,
        show_name=show_name,
        search=search,
        genre=genre,
        date_from=date_from_dt,
        date_to=date_to_dt,
        offset=offset,
        limit=page_size,
    )

    shows_dict: dict[str, list[RecordingMetadata]] = {}
    for recording in recordings:
        assert recording.id is not None
        metadata = RecordingMetadata(
            id=recording.id,
            created_at=recording.created_at.isoformat(),
            title=recording.title,
            artist=recording.artist,
            genre=recording.genre,
            description=recording.description,
            duration_seconds=recording.duration_seconds,
            stream_url=f"{settings.ROOT_PATH}/recordings/stream/{recording.id}",
        )

        show_name = recording.show.show_name
        if show_name not in shows_dict:
            shows_dict[show_name] = []
        shows_dict[show_name].append(metadata)

    shows = [ShowRecordings(show_name=show_name, recordings=recs) for show_name, recs in shows_dict.items()]

    return RecordingsListResponse(
        shows=shows,
        total_shows=len(shows_dict),
        total_recordings=total_recordings,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/stream/{recording_id}",
    summary="Stream Recording",
    description="Stream a livestream recording file",
    responses={404: {"model": ErrorResponse, "description": "Recording not found"}},
)
async def stream_recording(recording_id: int, db: Session = Depends(get_session)):
    """Stream a recording file."""
    recording = recordings_db.get_recording(db, recording_id)

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    file_path = Path(settings.RECORDINGS_PATH) / recording.file_path

    if not file_path.exists():
        logger.error(f"Recording file not found: {file_path}")
        raise HTTPException(status_code=404, detail="Recording file not found")

    def iterfile():
        with open(file_path, "rb") as f:
            while chunk := f.read(64 * 1024):
                yield chunk

    return StreamingResponse(
        iterfile(),
        media_type="audio/ogg",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
        },
    )


@admin_router.delete(
    "/{recording_id}",
    response_model=SuccessResponse,
    summary="Delete Recording",
    description="Delete a livestream recording (file and database entry)",
    responses={404: {"model": ErrorResponse, "description": "Recording not found"}},
)
async def delete_recording(recording_id: int, db: Session = Depends(get_session)) -> SuccessResponse:
    """Delete recording from database and filesystem."""
    recording = recordings_db.get_recording(db, recording_id)

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    file_path = Path(settings.RECORDINGS_PATH) / recording.file_path

    try:
        recordings_db.delete_recording_file(file_path)
        logger.info(f"Deleted recording file: {file_path}")
    except OSError as e:
        logger.error(f"Failed to delete recording file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete recording file: {str(e)}")

    recordings_db.delete_recording(db, recording)
    logger.info(f"Deleted recording {recording_id} from database")

    return SuccessResponse()
