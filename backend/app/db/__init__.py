"""Database configuration and session management."""

import logging
from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlmodel import Session
from sqlmodel import SQLModel
from sqlmodel import create_engine

from app.db.config import DATABASE_PATH
from app.db.config import DATABASE_URL
from app.db.migration_runner import run_migrations
from app.db.models import LivestreamRecording as LivestreamRecording
from app.db.models import PendingUser as PendingUser
from app.db.models import Show as Show
from app.db.models import User as User

logger = logging.getLogger(__name__)

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
    """Initialize database with Alembic migrations.

    Runs Alembic migrations to ensure schema is up to date. Falls back to SQLModel.metadata.create_all only if
    migrations fail.
    """
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Try to run Alembic migrations first
    if run_migrations():
        logger.info(f"Database initialized with migrations at {DATABASE_PATH}")
    else:
        # Fallback to basic table creation if migrations fail
        logger.warning("Migrations failed, falling back to basic table creation")
        SQLModel.metadata.create_all(engine)
        logger.info(f"Database initialized at {DATABASE_PATH}")
