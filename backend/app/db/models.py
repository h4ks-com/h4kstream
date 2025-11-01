"""User authentication and authorization models using SQLModel."""

from datetime import UTC
from datetime import datetime
from uuid import UUID
from uuid import uuid4

from sqlalchemy import Text
from sqlalchemy import event
from sqlalchemy.sql import text
from sqlmodel import Field
from sqlmodel import Relationship
from sqlmodel import SQLModel


class UserBase(SQLModel):
    """Base user model with shared fields."""

    email: str = Field(unique=True, index=True)
    username: str | None = Field(default=None, index=True)
    full_name: str | None = None


class User(UserBase, table=True):  # type: ignore[call-arg]
    """User database model."""

    __tablename__ = "users"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    password_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    is_active: bool = Field(default=True)

    shows: list["Show"] = Relationship(back_populates="owner")


class UserCreate(UserBase):
    """Model for creating a new user."""

    password: str


class UserPublic(UserBase):
    """Public user model (excludes password_hash)."""

    id: UUID
    created_at: datetime
    is_active: bool


class UserUpdate(SQLModel):
    """Model for updating user information."""

    username: str | None = None
    full_name: str | None = None
    password: str | None = None


class UserLogin(SQLModel):
    """Model for user login."""

    email: str
    password: str


class ShowBase(SQLModel):
    """Base show model with shared fields."""

    show_name: str = Field(unique=True, index=True)
    title: str | None = None
    artist: str | None = None
    genre: str | None = None
    description: str | None = None


class Show(ShowBase, table=True):  # type: ignore[call-arg]
    """Show database model."""

    __tablename__ = "shows"

    id: int | None = Field(default=None, primary_key=True)
    owner_id: UUID | None = Field(default=None, foreign_key="users.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    is_active: bool = Field(default=True)

    owner: User | None = Relationship(back_populates="shows")
    recordings: list["LivestreamRecording"] = Relationship(back_populates="show")


class ShowCreate(ShowBase):
    """Model for creating a new show."""

    owner_id: UUID | None = None


class ShowPublic(ShowBase):
    """Public show model."""

    id: int
    owner_id: UUID | None
    created_at: datetime
    is_active: bool


class ShowUpdate(SQLModel):
    """Model for updating show information."""

    title: str | None = None
    artist: str | None = None
    genre: str | None = None
    description: str | None = None


class PendingUser(SQLModel, table=True):  # type: ignore[call-arg]
    """Pending user registration tokens."""

    __tablename__ = "pending_users"

    token: str = Field(primary_key=True)
    email: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime
    max_queue_songs: int = Field(default=3)
    max_add_requests: int = Field(default=10)
    used: bool = Field(default=False)


class PendingUserCreate(SQLModel):
    """Model for creating a pending user token."""

    email: str
    duration_hours: int = Field(default=24, ge=1, le=168)
    max_queue_songs: int = Field(default=3, ge=1)
    max_add_requests: int = Field(default=10, ge=1)


class PendingUserPublic(SQLModel):
    """Public pending user model."""

    token: str
    email: str
    created_at: datetime
    expires_at: datetime
    used: bool


class LivestreamRecording(SQLModel, table=True):  # type: ignore[call-arg]
    """Livestream recording metadata."""

    __tablename__ = "livestream_recordings"

    id: int | None = Field(default=None, primary_key=True)
    show_id: int = Field(foreign_key="shows.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)
    title: str | None = None
    artist: str | None = None
    genre: str | None = None
    description: str | None = Field(default=None, sa_type=Text)
    duration_seconds: float
    file_path: str = Field(unique=True)

    show: Show = Relationship(back_populates="recordings")


@event.listens_for(SQLModel.metadata, "after_create")
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
