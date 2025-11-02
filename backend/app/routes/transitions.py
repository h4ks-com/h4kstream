"""Admin endpoints for jingle audio file management.

Jingles are short audio files that play between MPD playlist tracks (user queue and fallback). They do not play during
livestreams to maintain low latency.
"""

import logging
import os
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter
from fastapi import Depends
from fastapi import File
from fastapi import HTTPException
from fastapi import UploadFile
from fastapi.responses import StreamingResponse

from app.dependencies import admin_auth
from app.models import ErrorResponse
from app.models import SuccessResponse
from app.settings import settings

logger = logging.getLogger(__name__)

# Allowed audio file extensions
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".ogg", ".flac"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


router = APIRouter(
    prefix="/admin/transitions",
    tags=["admin"],
    dependencies=[Depends(admin_auth)],
    responses={401: {"model": ErrorResponse, "description": "Unauthorized"}},
)


def get_transitions_path() -> Path:
    """Get the directory path for jingles."""
    return Path(settings.DATA_PATH) / "transitions"


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent directory traversal attacks."""
    # Remove directory separators and keep only the basename
    filename = os.path.basename(filename)
    # Remove any potentially dangerous characters
    dangerous_chars = ["../", "..\\", "/", "\\", "\0"]
    for char in dangerous_chars:
        filename = filename.replace(char, "")
    return filename


def validate_audio_file(filename: str, file_size: int) -> None:
    """Validate audio file extension and size."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Allowed formats: {', '.join(ALLOWED_EXTENSIONS)}",
        )
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024 * 1024)}MB",
        )


@router.post(
    "/upload",
    response_model=SuccessResponse,
    summary="Upload Jingle File",
    description="Upload an audio file for use as a jingle between MPD tracks (admin only)",
)
async def upload_transition(
    file: UploadFile = File(..., description="Audio file (mp3, wav, ogg, flac)"),
) -> SuccessResponse:
    """Upload a jingle audio file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Sanitize filename
    safe_filename = sanitize_filename(file.filename)

    # Validate file
    file_content = await file.read()
    validate_audio_file(safe_filename, len(file_content))

    # Get target directory
    target_dir = get_transitions_path()
    target_dir.mkdir(parents=True, exist_ok=True)

    # Save file
    target_path = target_dir / safe_filename

    try:
        with open(target_path, "wb") as f:
            f.write(file_content)
        logger.info(f"Uploaded jingle file: {target_path}")
    except OSError as e:
        logger.error(f"Failed to save jingle file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    return SuccessResponse()


@router.get(
    "/list",
    summary="List Jingle Files",
    description="List all jingle files",
)
async def list_transitions():
    """List all jingle files."""
    files = []
    transitions_dir = get_transitions_path()

    if transitions_dir.exists():
        for file_path in transitions_dir.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in ALLOWED_EXTENSIONS:
                stat = file_path.stat()
                files.append(
                    {
                        "filename": file_path.name,
                        "file_size": stat.st_size,
                        "upload_date": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    }
                )

    # Sort by upload date descending
    files.sort(key=lambda x: x["upload_date"], reverse=True)

    return {"files": files}


@router.get(
    "/stream/{filename}",
    summary="Stream Jingle File",
    description="Stream a jingle audio file",
    responses={404: {"model": ErrorResponse, "description": "File not found"}},
)
async def stream_transition(filename: str):
    """Stream a jingle audio file."""
    # Sanitize filename
    safe_filename = sanitize_filename(filename)

    # Get file path
    file_path = get_transitions_path() / safe_filename

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Jingle file not found")

    # Determine media type from extension
    ext = file_path.suffix.lower()
    media_type_map = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
    }
    media_type = media_type_map.get(ext, "audio/mpeg")

    def iterfile():
        with open(file_path, "rb") as f:
            while chunk := f.read(64 * 1024):
                yield chunk

    return StreamingResponse(
        iterfile(),
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
        },
    )


@router.delete(
    "/{filename}",
    response_model=SuccessResponse,
    summary="Delete Jingle File",
    description="Delete a jingle audio file",
    responses={404: {"model": ErrorResponse, "description": "File not found"}},
)
async def delete_transition(filename: str) -> SuccessResponse:
    """Delete a jingle audio file."""
    # Sanitize filename
    safe_filename = sanitize_filename(filename)

    # Get file path
    file_path = get_transitions_path() / safe_filename

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Jingle file not found")

    try:
        file_path.unlink()
        logger.info(f"Deleted jingle file: {file_path}")
    except OSError as e:
        logger.error(f"Failed to delete jingle file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")

    return SuccessResponse()
