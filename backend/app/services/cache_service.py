"""File cache service for managing uploaded/downloaded files."""

import asyncio
import hashlib
import logging
from datetime import UTC
from datetime import datetime
from pathlib import Path

from sqlmodel import Session
from sqlmodel import col
from sqlmodel import desc
from sqlmodel import select

from app.db.models import FileCache
from app.types import PlaylistType

logger = logging.getLogger(__name__)


async def calculate_md5(filepath: Path) -> str:
    """Calculate MD5 hash of a file.

    :param filepath: Path to file
    :return: MD5 hash as hex string
    """

    def _calc_sync() -> str:
        hash_md5 = hashlib.md5()
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()

    return await asyncio.to_thread(_calc_sync)


async def lookup_by_url(session: Session, origin_url: str, playlist_type: PlaylistType) -> FileCache | None:
    """Look up cached file by origin URL.

    :param session: Database session
    :param origin_url: Original download URL
    :param playlist_type: Playlist type (user or fallback)
    :return: FileCache entry if found and file exists, None otherwise
    """
    statement = select(FileCache).where(
        FileCache.origin_url == origin_url, FileCache.playlist_type == playlist_type
    )
    cache_entry = session.exec(statement).first()  # type: ignore[no-any-return]

    if cache_entry:
        if not Path(cache_entry.filepath).exists():
            logger.warning(
                f"Cache entry {cache_entry.id} points to missing file {cache_entry.filepath}, removing entry"
            )
            session.delete(cache_entry)
            session.commit()
            return None

        logger.info(f"Cache hit for URL {origin_url} in {playlist_type} playlist")
        cache_entry.last_used_at = datetime.now(UTC)
        cache_entry.use_count += 1
        session.add(cache_entry)
        session.commit()
        session.refresh(cache_entry)
        return cache_entry

    return None


async def lookup_by_hash(session: Session, md5_hash: str, playlist_type: PlaylistType) -> FileCache | None:
    """Look up cached file by MD5 hash.

    :param session: Database session
    :param md5_hash: MD5 hash of file
    :param playlist_type: Playlist type (user or fallback)
    :return: FileCache entry if found and file exists, None otherwise
    """
    statement = select(FileCache).where(FileCache.md5_hash == md5_hash, FileCache.playlist_type == playlist_type)
    cache_entry = session.exec(statement).first()  # type: ignore[no-any-return]

    if cache_entry:
        if not Path(cache_entry.filepath).exists():
            logger.warning(
                f"Cache entry {cache_entry.id} points to missing file {cache_entry.filepath}, removing entry"
            )
            session.delete(cache_entry)
            session.commit()
            return None

        logger.info(f"Cache hit for hash {md5_hash} in {playlist_type} playlist")
        cache_entry.last_used_at = datetime.now(UTC)
        cache_entry.use_count += 1
        session.add(cache_entry)
        session.commit()
        session.refresh(cache_entry)
        return cache_entry

    return None


async def create_cache_entry(
    session: Session,
    filepath: Path,
    md5_hash: str,
    playlist_type: PlaylistType,
    origin_url: str | None = None,
    reference_url: str | None = None,
) -> FileCache:
    """Create new cache entry for a file.

    :param session: Database session
    :param filepath: Path to cached file
    :param md5_hash: MD5 hash of file (before trimming)
    :param playlist_type: Playlist type (user or fallback)
    :param origin_url: Optional origin URL
    :param reference_url: Optional reference URL for user-facing links
    :return: Created FileCache entry
    """
    file_size = filepath.stat().st_size

    cache_entry = FileCache(
        filename=filepath.name,
        filepath=str(filepath),
        origin_url=origin_url,
        reference_url=reference_url,
        md5_hash=md5_hash,
        file_size=file_size,
        playlist_type=playlist_type,
        created_at=datetime.now(UTC),
        last_used_at=datetime.now(UTC),
        use_count=1,
    )

    session.add(cache_entry)
    session.commit()
    session.refresh(cache_entry)

    logger.info(f"Created cache entry {cache_entry.id} for {filepath.name}")
    return cache_entry


async def list_cache_entries(
    session: Session,
    playlist_type: PlaylistType | None = None,
    search: str | None = None,
    offset: int = 0,
    limit: int = 50,
) -> tuple[list[FileCache], int]:
    """List cache entries with pagination and search.

    :param session: Database session
    :param playlist_type: Optional filter by playlist type
    :param search: Optional search term for filename or origin_url
    :param offset: Pagination offset
    :param limit: Pagination limit
    :return: Tuple of (entries, total_count)
    """
    statement = select(FileCache)

    if playlist_type:
        statement = statement.where(FileCache.playlist_type == playlist_type)

    if search:
        search_term = f"%{search}%"
        statement = statement.where(
            (col(FileCache.filename).ilike(search_term)) | (col(FileCache.origin_url).ilike(search_term))
        )

    count_statement = select(FileCache.id).select_from(statement.subquery())
    total_count = len(session.exec(count_statement).all())

    statement = statement.order_by(desc(FileCache.created_at)).offset(offset).limit(limit)
    entries = session.exec(statement).all()

    return list(entries), total_count


async def delete_cache_entry(session: Session, cache_id: int, delete_file: bool = False) -> None:
    """Delete cache entry and optionally the file.

    :param session: Database session
    :param cache_id: Cache entry ID
    :param delete_file: Whether to delete the actual file
    :raises ValueError: If cache entry not found
    """
    statement = select(FileCache).where(FileCache.id == cache_id)
    cache_entry = session.exec(statement).first()

    if not cache_entry:
        raise ValueError(f"Cache entry {cache_id} not found")

    if delete_file:
        filepath = Path(cache_entry.filepath)
        if filepath.exists():
            try:
                filepath.unlink()
                logger.info(f"Deleted file {filepath}")
            except OSError as e:
                logger.error(f"Failed to delete file {filepath}: {e}")

    session.delete(cache_entry)
    session.commit()
    logger.info(f"Deleted cache entry {cache_id}")


async def get_cache_stats(session: Session) -> dict[str, int | dict[str, int]]:
    """Get cache statistics.

    :param session: Database session
    :return: Statistics dictionary
    """
    total_statement = select(FileCache.id)
    total_entries = len(session.exec(total_statement).all())

    user_statement = select(FileCache.id).where(FileCache.playlist_type == "user")
    user_entries = len(session.exec(user_statement).all())

    fallback_statement = select(FileCache.id).where(FileCache.playlist_type == "fallback")
    fallback_entries = len(session.exec(fallback_statement).all())

    size_statement = select(FileCache.file_size)
    total_size = sum(session.exec(size_statement).all())

    return {
        "total_entries": total_entries,
        "by_playlist": {
            "user": user_entries,
            "fallback": fallback_entries,
        },
        "total_size_bytes": total_size,
    }
