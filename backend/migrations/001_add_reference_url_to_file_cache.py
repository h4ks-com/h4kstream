"""Add reference_url column to file_cache table.

This migration adds the reference_url column to the file_cache table to support clickable song links in the frontend.
"""

import sqlite3
from pathlib import Path


def get_db_path() -> Path:
    """Get the database file path."""
    return Path(__file__).parent.parent.parent / "data" / "db" / "app.db"


def column_exists(cursor: sqlite3.Cursor, table: str, column: str) -> bool:
    """Check if a column exists in a table."""
    cursor.execute(f"PRAGMA table_info({table})")
    columns = [row[1] for row in cursor.fetchall()]
    return column in columns


def migrate():
    """Run the migration."""
    db_path = get_db_path()

    if not db_path.exists():
        print(f"❌ Database not found at {db_path}")
        return False

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check if column already exists
        if column_exists(cursor, "file_cache", "reference_url"):
            print("✅ Column 'reference_url' already exists in 'file_cache' table - skipping")
            return True

        # Add the column
        print("📝 Adding 'reference_url' column to 'file_cache' table...")
        cursor.execute("""
            ALTER TABLE file_cache
            ADD COLUMN reference_url TEXT
        """)

        conn.commit()
        print("✅ Successfully added 'reference_url' column to 'file_cache' table")
        return True

    except sqlite3.Error as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
        return False

    finally:
        conn.close()


if __name__ == "__main__":
    success = migrate()
    exit(0 if success else 1)
