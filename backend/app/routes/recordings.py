"""Public and admin endpoints for livestream recordings."""

import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Query
from fastapi.responses import FileResponse
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.db import get_session
from app.db import recordings as recordings_db
from app.dependencies import get_jwt_token
from app.dependencies import require_admin_role
from app.models import ErrorResponse
from app.models import RecordingMetadata
from app.models import RecordingPeaks
from app.models import RecordingsListResponse
from app.models import ShowRecordings
from app.models import SuccessResponse
from app.services import edit_spec
from app.services import recording_render_service
from app.services.edit_spec import EditSpecError
from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/recordings", tags=["recordings"])

admin_router = APIRouter(
    prefix="/admin/recordings",
    tags=["admin"],
    dependencies=[Depends(require_admin_role)],
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
            max_listeners=recording.max_listeners,
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
    "/clip/{blob}.mp3",
    summary="Render Recording Edit Clip",
    description=(
        "Render an edit of a recording, described entirely by the URL blob, to MP3 on the fly. "
        "The blob encodes the recording id and an ordered list of cut/silence segments with "
        "per-segment gain, fades and equal-power crossfades. Public and unauthenticated; nothing "
        "is written to disk. Add ?dl=1 to download instead of inline playback."
    ),
    responses={
        200: {"content": {"audio/mpeg": {}}, "description": "Rendered MP3 clip"},
        400: {"model": ErrorResponse, "description": "Invalid edit"},
        404: {"model": ErrorResponse, "description": "Recording not found"},
        503: {"model": ErrorResponse, "description": "Renderer busy"},
    },
)
async def render_clip(
    blob: str,
    db: Session = Depends(get_session),
    dl: bool = Query(False, description="Download instead of inline playback"),
) -> StreamingResponse:
    """Decode, validate and stream-render a recording edit on the fly (no caching)."""
    try:
        spec = edit_spec.decode(blob)
    except EditSpecError as e:
        raise HTTPException(status_code=400, detail=str(e))

    recording = recordings_db.get_recording(db, spec.recording_id)
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    file_path = Path(settings.RECORDINGS_PATH) / recording.file_path
    if not file_path.exists():
        logger.error(f"Recording file not found: {file_path}")
        raise HTTPException(status_code=404, detail="Recording file not found")

    try:
        edit_spec.validate(spec, recording.duration_seconds)
    except EditSpecError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if recording_render_service.slots_busy():
        raise HTTPException(status_code=503, detail="Render pool is busy, try again shortly")

    stem = Path(recording.file_path).stem
    disposition = "attachment" if dl else "inline"
    return StreamingResponse(
        recording_render_service.stream_edit(file_path, spec),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f'{disposition}; filename="{stem}_clip.mp3"',
            "Cache-Control": "no-store",
        },
    )


@router.get(
    "/{recording_id}/peaks",
    summary="Recording Waveform Peaks",
    description="Downsampled waveform peaks for the editor. Requires a logged-in user.",
    responses={
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        404: {"model": ErrorResponse, "description": "Recording not found"},
    },
)
async def recording_peaks(
    recording_id: int,
    db: Session = Depends(get_session),
    _token: str = Depends(get_jwt_token),
    bins: int = Query(1500, ge=16, description="Number of waveform bins"),
) -> RecordingPeaks:
    """Return downsampled max-amplitude peaks for a recording (authed, cached)."""
    bins = min(bins, settings.PEAKS_BINS_MAX)
    recording = recordings_db.get_recording(db, recording_id)
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    file_path = Path(settings.RECORDINGS_PATH) / recording.file_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Recording file not found")

    return await recording_render_service.get_peaks(file_path, recording_id, recording.duration_seconds, bins)


@router.get(
    "/stream/{recording_id}",
    summary="Stream Recording",
    description="Stream a livestream recording file. Use start/end (seconds) to request a time-range segment.",
    responses={404: {"model": ErrorResponse, "description": "Recording not found"}},
)
async def stream_recording(
    recording_id: int,
    db: Session = Depends(get_session),
    start: float | None = Query(None, ge=0, description="Start offset in seconds"),
    end: float | None = Query(None, gt=0, description="End offset in seconds"),
):
    """Stream a recording file.

    Supports full file or a time-range segment via start/end params.
    """
    recording = recordings_db.get_recording(db, recording_id)

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    file_path = Path(settings.RECORDINGS_PATH) / recording.file_path

    if not file_path.exists():
        logger.error(f"Recording file not found: {file_path}")
        raise HTTPException(status_code=404, detail="Recording file not found")

    if end is not None and start is not None and end <= start:
        raise HTTPException(status_code=400, detail="end must be greater than start")

    stem = Path(recording.file_path).stem

    if start is None and end is None:
        return FileResponse(
            path=file_path,
            media_type="audio/mpeg",
            filename=f"{stem}.mp3",
            content_disposition_type="inline",
            headers={"Cache-Control": "no-cache"},
        )

    t0 = int(start or 0)
    t1 = int(end) if end is not None else 0
    filename = f"{stem}_{t0}s-{t1}s.mp3"
    return StreamingResponse(
        recording_render_service.stream_segment(file_path, start, end),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
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
