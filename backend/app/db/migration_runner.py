"""Database migration runner with automatic backup functionality."""

import logging
import shutil
import sys
from datetime import datetime
from pathlib import Path

from alembic.config import Config

from alembic import command
from app.db.config import DATABASE_PATH

logger = logging.getLogger(__name__)


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


def run_migrations() -> bool:
    """Run Alembic migrations with automatic database backup.

    This should be called on application startup before any database operations.

    Returns:
        True if migrations ran successfully, False otherwise.
    """
    try:
        # Create database directory if it doesn't exist
        DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

        # Backup database if it exists
        backup_path = backup_database()

        # Get Alembic config - try multiple locations
        alembic_ini_path = Path(__file__).parent.parent.parent / "alembic.ini"
        if not alembic_ini_path.exists():
            alembic_ini_path = Path.cwd() / "alembic.ini"
        if not alembic_ini_path.exists():
            alembic_ini_path = Path.cwd() / "backend" / "alembic.ini"

        if not alembic_ini_path.exists():
            logger.error("❌ Alembic config not found. Tried:")
            logger.error(f"   - {Path(__file__).parent.parent.parent / 'alembic.ini'}")
            logger.error(f"   - {Path.cwd() / 'alembic.ini'}")
            logger.error(f"   - {Path.cwd() / 'backend' / 'alembic.ini'}")
            return False

        # Run migrations
        logger.info("Running Alembic migrations...")
        alembic_cfg = Config(str(alembic_ini_path))

        # Run upgrade to head
        command.upgrade(alembic_cfg, "head")

        logger.info("✅ Migrations completed successfully")
        if backup_path:
            logger.info(f"   Backup available at: {backup_path}")

        return True

    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")
        logger.error("   Rolling back is manual - restore from backup if needed")
        if backup_path:
            logger.error(f"   Backup file: {backup_path}")
        return False


if __name__ == "__main__":
    success = run_migrations()
    sys.exit(0 if success else 1)
