"""Database models for livestream recordings."""

from datetime import UTC
from datetime import datetime

from sqlalchemy import Text
from sqlalchemy import event
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy.sql import text

from app.db import Base


class LivestreamRecording(Base):
    """Livestream recording metadata."""

    __tablename__ = "livestream_recordings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    show_name: Mapped[str] = mapped_column(index=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC), index=True)
    title: Mapped[str | None] = mapped_column()
    artist: Mapped[str | None] = mapped_column()
    genre: Mapped[str | None] = mapped_column()
    description: Mapped[str | None] = mapped_column(Text)
    duration_seconds: Mapped[float] = mapped_column()
    file_path: Mapped[str] = mapped_column(unique=True)

    def __repr__(self) -> str:
        return f"<LivestreamRecording(id={self.id}, show_name='{self.show_name}', title='{self.title}')>"


@event.listens_for(Base.metadata, "after_create")
def create_fts_table(target, connection, **kw):
    """Create FTS5 virtual table for text search after main table creation."""
    connection.execute(
        text(
            """
        CREATE VIRTUAL TABLE IF NOT EXISTS livestream_recordings_fts USING fts5(
            title,
            artist,
            genre,
            description,
            content=livestream_recordings,
            content_rowid=id
        )
        """
        )
    )

    connection.execute(
        text(
            """
        CREATE TRIGGER IF NOT EXISTS livestream_recordings_ai AFTER INSERT ON livestream_recordings BEGIN
            INSERT INTO livestream_recordings_fts(rowid, title, artist, genre, description)
            VALUES (new.id, new.title, new.artist, new.genre, new.description);
        END
        """
        )
    )

    connection.execute(
        text(
            """
        CREATE TRIGGER IF NOT EXISTS livestream_recordings_ad AFTER DELETE ON livestream_recordings BEGIN
            DELETE FROM livestream_recordings_fts WHERE rowid = old.id;
        END
        """
        )
    )

    connection.execute(
        text(
            """
        CREATE TRIGGER IF NOT EXISTS livestream_recordings_au AFTER UPDATE ON livestream_recordings BEGIN
            UPDATE livestream_recordings_fts SET
                title = new.title,
                artist = new.artist,
                genre = new.genre,
                description = new.description
            WHERE rowid = new.id;
        END
        """
        )
    )

    connection.commit()
