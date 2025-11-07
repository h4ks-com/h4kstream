import tempfile
from pathlib import Path

import pytest
from sqlmodel import Session
from sqlmodel import SQLModel
from sqlmodel import create_engine

from app.db.models import FileCache
from app.services import cache_service


@pytest.fixture
def db_session():
    """Create in-memory SQLite database for testing."""
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture
def temp_file():
    """Create temporary file for testing."""
    with tempfile.NamedTemporaryFile(mode="wb", delete=False, suffix=".mp3") as f:
        f.write(b"test audio content")
        temp_path = Path(f.name)

    yield temp_path

    if temp_path.exists():
        temp_path.unlink()


async def test_calculate_md5(temp_file):
    """Test MD5 calculation."""
    md5_hash = await cache_service.calculate_md5(temp_file)

    assert isinstance(md5_hash, str)
    assert len(md5_hash) == 32


async def test_create_cache_entry(db_session, temp_file):
    """Test creating cache entry."""
    md5_hash = await cache_service.calculate_md5(temp_file)

    entry = await cache_service.create_cache_entry(
        db_session, temp_file, md5_hash, "user", origin_url="https://example.com/song"
    )

    assert entry.id is not None
    assert entry.filename == temp_file.name
    assert entry.filepath == str(temp_file)
    assert entry.origin_url == "https://example.com/song"
    assert entry.md5_hash == md5_hash
    assert entry.playlist_type == "user"
    assert entry.use_count == 1


async def test_lookup_by_url_hit(db_session, temp_file):
    """Test cache hit by URL."""
    md5_hash = await cache_service.calculate_md5(temp_file)
    await cache_service.create_cache_entry(db_session, temp_file, md5_hash, "user", origin_url="https://example.com/song")

    result = await cache_service.lookup_by_url(db_session, "https://example.com/song", "user")

    assert result is not None
    assert result.origin_url == "https://example.com/song"
    assert result.use_count == 2


async def test_lookup_by_url_miss(db_session):
    """Test cache miss by URL."""
    result = await cache_service.lookup_by_url(db_session, "https://example.com/nonexistent", "user")

    assert result is None


async def test_lookup_by_hash_hit(db_session, temp_file):
    """Test cache hit by MD5 hash."""
    md5_hash = await cache_service.calculate_md5(temp_file)
    await cache_service.create_cache_entry(db_session, temp_file, md5_hash, "user")

    result = await cache_service.lookup_by_hash(db_session, md5_hash, "user")

    assert result is not None
    assert result.md5_hash == md5_hash
    assert result.use_count == 2


async def test_lookup_by_hash_miss(db_session):
    """Test cache miss by MD5 hash."""
    result = await cache_service.lookup_by_hash(db_session, "nonexistent_hash", "user")

    assert result is None


async def test_lookup_missing_file_removes_entry(db_session, temp_file):
    """Test that cache entry is removed if file doesn't exist."""
    md5_hash = await cache_service.calculate_md5(temp_file)
    entry = await cache_service.create_cache_entry(db_session, temp_file, md5_hash, "user")

    temp_file.unlink()

    result = await cache_service.lookup_by_hash(db_session, md5_hash, "user")

    assert result is None

    from sqlmodel import select

    statement = select(FileCache).where(FileCache.id == entry.id)
    deleted_entry = db_session.exec(statement).first()
    assert deleted_entry is None


async def test_list_cache_entries(db_session, temp_file):
    """Test listing cache entries."""
    md5_hash = await cache_service.calculate_md5(temp_file)
    await cache_service.create_cache_entry(db_session, temp_file, md5_hash, "user", origin_url="https://example.com/song1")

    entries, total = await cache_service.list_cache_entries(db_session)

    assert total == 1
    assert len(entries) == 1
    assert entries[0].md5_hash == md5_hash


async def test_list_cache_entries_with_filter(db_session, temp_file):
    """Test listing cache entries with playlist filter."""
    md5_hash = await cache_service.calculate_md5(temp_file)
    await cache_service.create_cache_entry(db_session, temp_file, md5_hash, "user")

    entries, total = await cache_service.list_cache_entries(db_session, playlist_type="fallback")

    assert total == 0
    assert len(entries) == 0


async def test_list_cache_entries_with_search(db_session, temp_file):
    """Test listing cache entries with search."""
    md5_hash = await cache_service.calculate_md5(temp_file)
    await cache_service.create_cache_entry(
        db_session, temp_file, md5_hash, "user", origin_url="https://example.com/special_song"
    )

    entries, total = await cache_service.list_cache_entries(db_session, search="special")

    assert total == 1
    assert len(entries) == 1


async def test_delete_cache_entry(db_session, temp_file):
    """Test deleting cache entry without file."""
    md5_hash = await cache_service.calculate_md5(temp_file)
    entry = await cache_service.create_cache_entry(db_session, temp_file, md5_hash, "user")

    await cache_service.delete_cache_entry(db_session, entry.id, delete_file=False)

    from sqlmodel import select

    statement = select(FileCache).where(FileCache.id == entry.id)
    deleted_entry = db_session.exec(statement).first()
    assert deleted_entry is None

    assert temp_file.exists()


async def test_delete_cache_entry_with_file(db_session, temp_file):
    """Test deleting cache entry with file."""
    md5_hash = await cache_service.calculate_md5(temp_file)
    entry = await cache_service.create_cache_entry(db_session, temp_file, md5_hash, "user")

    await cache_service.delete_cache_entry(db_session, entry.id, delete_file=True)

    assert not temp_file.exists()


async def test_delete_nonexistent_cache_entry(db_session):
    """Test deleting nonexistent cache entry raises error."""
    with pytest.raises(ValueError, match="Cache entry .* not found"):
        await cache_service.delete_cache_entry(db_session, 99999)


async def test_cache_stats(db_session, temp_file):
    """Test cache statistics."""
    md5_hash = await cache_service.calculate_md5(temp_file)
    await cache_service.create_cache_entry(db_session, temp_file, md5_hash, "user")

    stats = await cache_service.get_cache_stats(db_session)

    assert stats["total_entries"] == 1
    assert stats["by_playlist"]["user"] == 1
    assert stats["by_playlist"]["fallback"] == 0
    assert stats["total_size_bytes"] > 0
