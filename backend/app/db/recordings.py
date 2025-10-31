"""Database operations for livestream recordings."""

from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session
from sqlalchemy.sql import text

from app.db.models import LivestreamRecording


def list_recordings(
    db: Session,
    show_name: str | None = None,
    search: str | None = None,
    genre: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    offset: int = 0,
    limit: int = 20,
) -> tuple[list[LivestreamRecording], int]:
    """List recordings with filters and pagination."""
    query = db.query(LivestreamRecording)

    if show_name:
        query = query.filter(LivestreamRecording.show_name == show_name)

    if genre:
        query = query.filter(LivestreamRecording.genre == genre)

    if date_from:
        query = query.filter(LivestreamRecording.created_at >= date_from)

    if date_to:
        query = query.filter(LivestreamRecording.created_at <= date_to)

    if search:
        fts_result = db.execute(
            text("SELECT id FROM livestream_recordings_fts WHERE livestream_recordings_fts MATCH :search"),
            {"search": search},
        ).fetchall()
        matching_ids = [row[0] for row in fts_result]
        if matching_ids:
            query = query.filter(LivestreamRecording.id.in_(matching_ids))
        else:
            return [], 0

    total_count = query.count()
    recordings = query.order_by(LivestreamRecording.created_at.desc()).offset(offset).limit(limit).all()

    return recordings, total_count


def get_recording(db: Session, recording_id: int) -> LivestreamRecording | None:
    """Get recording by ID."""
    return db.query(LivestreamRecording).filter(LivestreamRecording.id == recording_id).first()


def delete_recording(db: Session, recording: LivestreamRecording) -> None:
    """Delete recording from database."""
    db.delete(recording)
    db.commit()


def delete_recording_file(file_path: Path) -> None:
    """Delete recording file from filesystem."""
    if file_path.exists():
        file_path.unlink()
