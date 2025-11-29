"""Database migration runner with automatic backup functionality."""

import fcntl
import logging
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from app.db.config import DATABASE_PATH

logger = logging.getLogger(__name__)

MIGRATION_LOCK_FILE = DATABASE_PATH.parent / ".migration.lock"


def backup_database() -> Path | None:
    """Create a backup of the database before running migrations.

    Creates a copy of the database file with _timestamp suffix.

    Returns:
        Path to the backup file, or None if database doesn't exist yet.
    """
    if not DATABASE_PATH.exists():
        logger.info("Database does not exist yet - skipping backup")
        return None

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = DATABASE_PATH.parent / f"{DATABASE_PATH.stem}_{timestamp}{DATABASE_PATH.suffix}"

    try:
        shutil.copy2(DATABASE_PATH, backup_path)
        logger.info(f"✅ Database backed up to: {backup_path}")
        return backup_path
    except Exception as e:
        logger.error(f"❌ Failed to backup database: {e}")
        raise


def _get_alembic_ini_path() -> Path | None:
    """Find the alembic.ini config file."""
    candidates = [
        Path(__file__).parent.parent.parent / "alembic.ini",
        Path.cwd() / "alembic.ini",
        Path.cwd() / "backend" / "alembic.ini",
    ]
    for path in candidates:
        if path.exists():
            return path
    return None


def run_migrations() -> bool:
    """Run Alembic migrations with automatic database backup.

    Uses subprocess to avoid blocking issues with uvicorn's event loop.
    Uses file locking to ensure only one process runs migrations at a time.
    This should be called on application startup before any database operations.

    Returns:
        True if migrations ran successfully, False otherwise.
    """
    backup_path = None
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(MIGRATION_LOCK_FILE, "w") as lock_file:
            try:
                fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                logger.info("Another process is running migrations, waiting...")
                fcntl.flock(lock_file, fcntl.LOCK_EX)
                logger.info("Migration lock acquired after waiting")

            backup_path = backup_database()

            alembic_ini_path = _get_alembic_ini_path()
            if not alembic_ini_path:
                logger.error("❌ Alembic config not found")
                return False

            logger.info("Running Alembic migrations via subprocess...")
            result = subprocess.run(
                ["uv", "run", "alembic", "upgrade", "head"],
                cwd=alembic_ini_path.parent,
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode != 0:
                logger.error(f"❌ Migration failed: {result.stderr}")
                return False

            logger.info("✅ Migrations completed successfully")
            if backup_path:
                logger.info(f"   Backup available at: {backup_path}")

            return True

    except subprocess.TimeoutExpired:
        logger.error("❌ Migration timed out after 30 seconds")
        return False
    except FileNotFoundError:
        logger.error("❌ Migration failed: 'uv' command not found")
        return False


if __name__ == "__main__":
    success = run_migrations()
    sys.exit(0 if success else 1)
