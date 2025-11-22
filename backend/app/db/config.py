"""Database configuration constants."""

from pathlib import Path

from app.settings import settings

DATABASE_PATH = Path(settings.DATA_PATH) / "db" / "app.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"
