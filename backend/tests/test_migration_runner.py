"""Tests for how the migration runner reads the state of the database."""

import sqlite3
from pathlib import Path

import pytest

from app.db import migration_runner


@pytest.fixture
def database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "app.db"
    monkeypatch.setattr(migration_runner, "DATABASE_PATH", path)
    return path


def test_a_database_that_does_not_exist_yet_has_nothing(database: Path) -> None:
    assert not migration_runner.has_tables()
    assert not migration_runner.is_alembic_managed()


def test_tables_created_from_the_models_are_not_alembic_managed(database: Path) -> None:
    """This is the state every service leaves behind with create_all: upgrading such a database
    from the first revision re-applies changes its schema already has."""
    with sqlite3.connect(database) as conn:
        conn.execute("CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT NOT NULL DEFAULT '')")

    assert migration_runner.has_tables()
    assert not migration_runner.is_alembic_managed()


def test_a_stamped_database_is_alembic_managed(database: Path) -> None:
    with sqlite3.connect(database) as conn:
        conn.execute("CREATE TABLE users (id TEXT PRIMARY KEY)")
        conn.execute("CREATE TABLE alembic_version (version_num TEXT NOT NULL)")
        conn.execute("INSERT INTO alembic_version VALUES ('a564c83ffa96')")

    assert migration_runner.has_tables()
    assert migration_runner.is_alembic_managed()


def test_the_version_table_alone_does_not_count_as_a_schema(database: Path) -> None:
    with sqlite3.connect(database) as conn:
        conn.execute("CREATE TABLE alembic_version (version_num TEXT NOT NULL)")

    assert not migration_runner.has_tables()


@pytest.mark.parametrize(
    ("stderr", "expected"),
    [
        ("sqlite3.OperationalError: table cache_metadata already exists", True),
        ("sqlite3.OperationalError: duplicate column name: role", True),
        ("sqlite3.OperationalError: no such table: users", False),
        ("Can't locate revision identified by 'abc123'", False),
    ],
)
def test_an_upgrade_that_adds_what_the_schema_has_is_told_apart(stderr: str, expected: bool) -> None:
    assert migration_runner.schema_is_ahead(stderr) is expected
