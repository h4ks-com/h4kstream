"""Database configuration and session management."""

import logging
from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy import event
from sqlmodel import Session
from sqlmodel import SQLModel
from sqlmodel import create_engine

from app.db.models import LivestreamRecording as LivestreamRecording
from app.db.models import PendingUser as PendingUser
from app.db.models import Show as Show
from app.db.models import User as User
from app.settings import settings

logger = logging.getLogger(__name__)

DATABASE_PATH = Path(settings.DATA_PATH) / "db" / "app.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    """Enable WAL mode and optimize for concurrent access."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


def get_session():
    """Dependency for getting database session."""
    with Session(engine) as session:
        yield session


async def get_session_async() -> AsyncGenerator[Session, None]:
    """Async dependency for getting database session."""
    with Session(engine) as session:
        yield session


def init_db():
    """Initialize database tables."""
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    logger.info(f"Database initialized at {DATABASE_PATH}")
