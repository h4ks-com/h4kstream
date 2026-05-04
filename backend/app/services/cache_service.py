"""File cache service for managing uploaded/downloaded files."""

import asyncio
import hashlib
import logging
from collections import defaultdict
from datetime import UTC
from datetime import datetime
from pathlib import Path

from sqlalchemy import exists
from sqlalchemy import func
from sqlmodel import Session
from sqlmodel import col
from sqlmodel import select

from app.db.models import CacheMetadata
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


async def lookup_by_reference_url(session: Session, reference_url: str, playlist_type: PlaylistType) -> FileCache | None:
    """Look up cached file by reference URL (e.g. Navidrome song URL).

    :param session: Database session
    :param reference_url: Reference URL to look up (e.g. Navidrome song URL)
    :param playlist_type: Playlist type (user or fallback)
    :return: FileCache entry if found and file exists, None otherwise
    """
    statement = select(FileCache).where(
        FileCache.reference_url == reference_url, FileCache.playlist_type == playlist_type
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


def add_metadata(session: Session, cache_id: int, title: str | None, artist: str | None) -> None:
    """Associate title/artist metadata with a cache entry, skipping duplicates.

    :param session: Database session
    :param cache_id: FileCache entry ID
    :param title: Song title
    :param artist: Song artist
    """
    if not title and not artist:
        return

    # SQLite treats each NULL as distinct, so the UNIQUE constraint won't catch duplicates when title/artist is NULL.
    existing = session.exec(
        select(CacheMetadata).where(
            CacheMetadata.cache_id == cache_id,
            (CacheMetadata.title == title) if title is not None else col(CacheMetadata.title).is_(None),
            (CacheMetadata.artist == artist) if artist is not None else col(CacheMetadata.artist).is_(None),
        )
    ).first()
    if not existing:
        session.add(CacheMetadata(cache_id=cache_id, title=title, artist=artist, created_at=datetime.now(UTC)))
        session.commit()


async def create_cache_entry(
    session: Session,
    filepath: Path,
    md5_hash: str,
    playlist_type: PlaylistType,
    origin_url: str | None = None,
    reference_url: str | None = None,
    title: str | None = None,
    artist: str | None = None,
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

    # Trim whitespace from URLs
    if origin_url is not None:
        origin_url = origin_url.strip()
        if not origin_url:
            origin_url = None

    if reference_url is not None:
        reference_url = reference_url.strip()
        if not reference_url:
            reference_url = None

    # Default reference_url to origin_url if not explicitly provided
    if reference_url is None and origin_url is not None:
        reference_url = origin_url

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

    if (title or artist) and cache_entry.id is not None:
        add_metadata(session, cache_entry.id, title, artist)

    logger.info(f"Created cache entry {cache_entry.id} for {filepath.name}")
    return cache_entry


async def list_cache_entries(
    session: Session,
    playlist_type: PlaylistType | None = None,
    search: str | None = None,
    offset: int = 0,
    limit: int = 50,
    sort: str = "added",
    order: str = "desc",
) -> tuple[list[FileCache], int]:
    """List cache entries with pagination, search, and sort.

    :param session: Database session
    :param playlist_type: Optional filter by playlist type
    :param search: Optional search term for filename, origin_url, or reference_url
    :param offset: Pagination offset
    :param limit: Pagination limit
    :param sort: Sort field: "added" | "size" | "uses" | "used"
    :param order: Sort order: "asc" | "desc"
    :return: Tuple of (entries, total_count)
    """
    filters = []
    if playlist_type:
        filters.append(FileCache.playlist_type == playlist_type)
    if search:
        search_term = f"%{search}%"
        metadata_match = exists().where(
            CacheMetadata.cache_id == FileCache.id,
            col(CacheMetadata.title).ilike(search_term) | col(CacheMetadata.artist).ilike(search_term),
        )
        filters.append(
            col(FileCache.filename).ilike(search_term)
            | col(FileCache.origin_url).ilike(search_term)
            | col(FileCache.reference_url).ilike(search_term)
            | metadata_match
        )

    count_statement = select(func.count()).select_from(FileCache)
    for f in filters:
        count_statement = count_statement.where(f)
    total_count = session.exec(count_statement).one()

    sort_column_map = {
        "added": FileCache.created_at,
        "size": FileCache.file_size,
        "uses": FileCache.use_count,
        "used": FileCache.last_used_at,
    }
    sort_col = sort_column_map.get(sort, FileCache.created_at)
    order_clause = sort_col.asc() if order == "asc" else sort_col.desc()

    statement = select(FileCache)
    for f in filters:
        statement = statement.where(f)
    statement = statement.order_by(order_clause).offset(offset).limit(limit)
    entries = session.exec(statement).all()

    return list(entries), total_count


def get_metadata_map(session: Session, cache_ids: list[int]) -> dict[int, list[dict[str, str | None]]]:
    """Fetch all metadata rows for a set of cache IDs and group by cache_id.

    :param session: Database session
    :param cache_ids: List of FileCache IDs to fetch metadata for
    :return: Dict mapping cache_id → list of {title, artist} dicts
    """
    if not cache_ids:
        return {}
    rows = session.exec(select(CacheMetadata).where(col(CacheMetadata.cache_id).in_(cache_ids))).all()
    result: dict[int, list[dict[str, str | None]]] = defaultdict(list)
    for row in rows:
        result[row.cache_id].append({"title": row.title, "artist": row.artist})
    return dict(result)


def get_distinct_metadata_values(session: Session, field: str) -> list[str]:
    """Get distinct non-null values for a metadata field (title or artist) for dropdowns.

    :param session: Database session
    :param field: "title" or "artist"
    :return: Sorted list of distinct values
    """
    col_ref = col(CacheMetadata.title) if field == "title" else col(CacheMetadata.artist)
    rows = session.exec(
        select(col_ref).where(col_ref.is_not(None)).distinct().order_by(col_ref)
    ).all()
    return [r for r in rows if r]


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


async def purge_navidrome_songs(session: Session, song_ids: list[str]) -> int:
    """Invalidate cache entries whose reference_url matches a Navidrome song URL.

    Deletes DB rows only. Files on disk are left intact — they are the live MPD-served files (filepath points into
    /music/user/ or /music/fallback/), and songs currently queued in MPD would fail to play if we removed them. Next
    time the user adds the same playlist/album, cache miss triggers a fresh download.

    :param session: Database session
    :param song_ids: List of Navidrome song IDs to purge
    :return: Number of cache entries deleted
    """
    purged = 0
    for song_id in song_ids:
        pattern = f"%/song/{song_id}"
        statement = select(FileCache).where(col(FileCache.reference_url).ilike(pattern))
        entries = session.exec(statement).all()
        for entry in entries:
            session.delete(entry)
            purged += 1
    session.commit()
    return purged


async def purge_all(session: Session) -> dict[str, int]:
    """Delete ALL cache entries and their files on disk.

    Destructive. Any songs currently queued in MPD that reference these files will fail to play until re-added. Intended
    for a manual, admin-confirmed full reset of the cache.

    :param session: Database session
    :return: Dict with 'entries' (rows deleted) and 'files' (files unlinked)
    """
    entries = session.exec(select(FileCache)).all()
    files_deleted = 0
    for entry in entries:
        filepath = Path(entry.filepath)
        if filepath.exists():
            try:
                filepath.unlink()
                files_deleted += 1
            except OSError as e:
                logger.error(f"Failed to delete file {filepath}: {e}")
        session.delete(entry)
    session.commit()
    logger.warning(f"Full cache purge: {len(entries)} entries, {files_deleted} files deleted")
    return {"entries": len(entries), "files": files_deleted}


async def get_cache_stats(session: Session) -> dict[str, int | dict[str, int]]:
    """Get cache statistics.

    :param session: Database session
    :return: Statistics dictionary
    """
    total_entries = session.exec(select(func.count()).select_from(FileCache)).one()
    user_entries = session.exec(
        select(func.count()).select_from(FileCache).where(FileCache.playlist_type == "user")
    ).one()
    fallback_entries = session.exec(
        select(func.count()).select_from(FileCache).where(FileCache.playlist_type == "fallback")
    ).one()
    total_size = session.exec(select(func.coalesce(func.sum(FileCache.file_size), 0))).one()

    return {
        "total_entries": total_entries,
        "by_playlist": {
            "user": user_entries,
            "fallback": fallback_entries,
        },
        "total_size_bytes": total_size,
    }
