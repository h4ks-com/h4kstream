"""Admin API endpoints for complete system control.

Admin-only endpoints that can manage both user queue and radio playlist, create tokens, and control playback.
"""

import hashlib
import logging
from pathlib import Path

from fastapi import APIRouter
from fastapi import Body
from fastapi import Depends
from fastapi import Form
from fastapi import HTTPException
from fastapi import Query
from fastapi import UploadFile
from fastapi.responses import StreamingResponse
from sqlmodel import Session
from sqlmodel import select

from app.db import get_session
from app.db.models import FileCache
from app.db.models import FileCachePublic
from app.db.models import Show
from app.dependencies import dep_event_publisher
from app.dependencies import dep_redis_client
from app.dependencies import require_admin_role
from app.exceptions import FileNotFoundInMPDError
from app.exceptions import SongNotFoundError
from app.models import ErrorResponse
from app.models import LivestreamTokenCreateRequest
from app.models import LivestreamTokenResponse
from app.models import NavidromeAlbumItem
from app.models import NavidromePlaylistItem
from app.models import NavidromePurgeRequest
from app.models import NavidromePurgeResponse
from app.models import PurgeAllCacheRequest
from app.models import PurgeAllCacheResponse
from app.models import SongAddedResponse
from app.models import SongDeletedEventData
from app.models import SongItem
from app.models import SongMetadataEditRequest
from app.models import SuccessResponse
from app.models import TokenCreateRequest
from app.models import TokenCreateResponse
from app.services import cache_service
from app.services import metadata_editor
from app.services import playback_service
from app.services import queue_service
from app.services.cache_service import get_distinct_metadata_values
from app.services.cache_service import get_metadata_map
from app.services.event_publisher import EventPublisher
from app.services.jwt_service import generate_livestream_token
from app.services.jwt_service import generate_token
from app.services.navidrome_service import NavidromeService
from app.services.playback_service import get_mpd_client
from app.services.redis_service import RedisService
from app.services.redis_service import parse_song_id
from app.services.youtube_dl import YoutubeDownloadException
from app.settings import settings
from app.types import PlaylistType

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin_role)],
    responses={401: {"model": ErrorResponse, "description": "Unauthorized"}},
)


# =============================================================================
# Token Management
# =============================================================================


@router.post(
    "/token",
    response_model=TokenCreateResponse,
    summary="Create JWT Token",
    description="Create a temporary JWT token with duration, queue limit, and total add request limit",
)
async def create_token(request: TokenCreateRequest) -> TokenCreateResponse:
    """Create a temporary JWT token with duration, queue limit, and add request limit."""
    token = generate_token(
        duration_seconds=request.duration_seconds,
        max_queue_songs=request.max_queue_songs,
        max_add_requests=request.max_add_requests,
    )
    return TokenCreateResponse(token=token, refresh_token=None)


@router.post(
    "/livestream/token",
    response_model=LivestreamTokenResponse,
    summary="Create Livestream Token",
    description="Create a livestream token. Auto-creates show if show_name provided and doesn't exist.",
)
async def create_livestream_token(
    request: LivestreamTokenCreateRequest, session=Depends(get_session)
) -> LivestreamTokenResponse:
    """Create a livestream token with specified time limit and recording settings.

    If show_name is provided and doesn't exist, auto-creates it without an owner. Admin tokens have no ownership
    validation.
    """
    show_name = request.show_name or "Anonymous Livestream"
    intro_filename = None

    show = session.exec(select(Show).where(Show.show_name == show_name)).first()
    if not show:
        show = Show(show_name=show_name, owner_id=None, is_active=True)
        session.add(show)
        session.commit()
        session.refresh(show)
    intro_filename = show.intro_filename

    token, expires_at = generate_livestream_token(
        request.max_streaming_seconds, show_name, None, request.min_recording_duration, intro_filename
    )
    return LivestreamTokenResponse(
        token=token, expires_at=expires_at.isoformat(), max_streaming_seconds=request.max_streaming_seconds
    )


# =============================================================================
# Queue Operations
# =============================================================================


@router.post(
    "/queue/add",
    response_model=SongAddedResponse,
    summary="Admin Add Song",
    description=(
        "Add a song to any playlist (user queue or fallback playlist). "
        "Bypasses all limits: queue limits, add request limits, duration limits, file size limits, and duplicate checks. "
        "Default: user queue"
    ),
    responses={400: {"model": ErrorResponse}},
)
async def admin_add_song(
    url: str | None = Form(None),
    song_name: str | None = Form(None),
    artist: str | None = Form(None),
    reference_url: str | None = Form(None),
    file: UploadFile | None = None,
    playlist: PlaylistType = Query("user", description="Target playlist (user or fallback)"),
    redis_client: RedisService = Depends(dep_redis_client),
    db_session: Session = Depends(get_session),
) -> SongAddedResponse:
    """Add song to specified playlist without any restrictions or validation."""
    mpd_client = get_mpd_client(playlist)

    try:
        await mpd_client.connect()
        song_id = await queue_service.add_song(
            playlist=playlist,
            mpd_client=mpd_client,
            db_session=db_session,
            url=url,
            file=file,
            song_name=song_name,
            artist_name=artist,
            reference_url=reference_url,
            redis_client=redis_client,
            skip_validation=True,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except YoutubeDownloadException as e:
        raise HTTPException(status_code=400, detail=e.error_type.value)
    except FileNotFoundInMPDError as e:
        raise HTTPException(status_code=404, detail=str(e))
    finally:
        await mpd_client.disconnect()

    return SongAddedResponse(song_id=song_id)


@router.get(
    "/queue/list",
    response_model=list[SongItem],
    summary="Admin List Songs",
    description="Get all songs in any playlist. Default: user queue",
)
async def admin_list_songs(
    playlist: PlaylistType = Query("user", description="Target playlist (user or fallback)"),
    redis_client: RedisService = Depends(dep_redis_client),
    db_session: Session = Depends(get_session),
) -> list[SongItem]:
    """List all songs in the specified playlist."""
    mpd_client = get_mpd_client(playlist)

    try:
        await mpd_client.connect()
        return await queue_service.list_songs(mpd_client, playlist, redis_client, db_session)
    finally:
        await mpd_client.disconnect()


@router.delete(
    "/queue/{song_id}",
    response_model=SuccessResponse,
    summary="Admin Delete Song",
    description="Delete a specific song from any playlist. Default: user queue",
    responses={404: {"model": ErrorResponse, "description": "Song not found"}},
)
async def admin_delete_song(
    song_id: str,
    playlist: PlaylistType = Query("user", description="Target playlist (user or fallback)"),
    event_publisher: EventPublisher = Depends(dep_event_publisher),
) -> SuccessResponse:
    """Delete song from specified playlist."""
    try:
        mpd_id, parsed_playlist = parse_song_id(song_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if parsed_playlist != playlist:
        raise HTTPException(
            status_code=400, detail=f"Song ID prefix '{parsed_playlist}' doesn't match playlist '{playlist}'"
        )

    mpd_client = get_mpd_client(playlist)

    try:
        await mpd_client.connect()
        await queue_service.delete_song(song_id=mpd_id, playlist=playlist, mpd_client=mpd_client)
    except SongNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    finally:
        await mpd_client.disconnect()

    event_data = SongDeletedEventData(song_id=song_id, playlist=playlist)
    await event_publisher.publish(
        event_type="song_deleted",
        data=event_data.model_dump(),
        description=f"Song {song_id} deleted from {playlist} queue",
    )

    return SuccessResponse()


@router.post(
    "/queue/clear",
    response_model=SuccessResponse,
    summary="Admin Clear Queue",
    description="Clear all songs from any playlist. Default: user queue",
)
async def admin_clear_queue(
    playlist: PlaylistType = Query("user", description="Target playlist (user or fallback)"),
) -> SuccessResponse:
    """Clear all songs from specified playlist."""
    mpd_client = get_mpd_client(playlist)

    try:
        await mpd_client.connect()
        await queue_service.clear_queue(mpd_client, playlist)
    finally:
        await mpd_client.disconnect()

    return SuccessResponse()


# =============================================================================
# Playback Control
# =============================================================================


@router.post(
    "/playback/play",
    response_model=SuccessResponse,
    summary="Admin Play",
    description="Start playback on any playlist. Default: user queue",
    responses={400: {"model": ErrorResponse, "description": "Invalid playlist"}},
)
async def admin_play(
    playlist: PlaylistType = Query("user", description="Target playlist (user or fallback)"),
) -> SuccessResponse:
    """Start playback on specified playlist."""
    await playback_service.control_playback("play", playlist)
    return SuccessResponse()


@router.post(
    "/playback/pause",
    response_model=SuccessResponse,
    summary="Admin Pause",
    description="Pause playback on any playlist. Default: user queue",
    responses={400: {"model": ErrorResponse, "description": "Invalid playlist"}},
)
async def admin_pause(
    playlist: PlaylistType = Query("user", description="Target playlist (user or fallback)"),
) -> SuccessResponse:
    """Pause playback on specified playlist."""
    await playback_service.control_playback("pause", playlist)
    return SuccessResponse()


@router.post(
    "/playback/resume",
    response_model=SuccessResponse,
    summary="Admin Resume",
    description="Resume playback on any playlist. Default: user queue",
    responses={400: {"model": ErrorResponse, "description": "Invalid playlist"}},
)
async def admin_resume(
    playlist: PlaylistType = Query("user", description="Target playlist (user or fallback)"),
) -> SuccessResponse:
    """Resume playback on specified playlist."""
    await playback_service.control_playback("resume", playlist)
    return SuccessResponse()


@router.get(
    "/cache",
    response_model=dict,
    summary="List Cached Files",
    description="List all cached files with pagination and search",
)
async def list_cache(
    playlist: PlaylistType | None = Query(None, description="Filter by playlist type"),
    search: str | None = Query(None, description="Search in filename, origin_url, or reference_url"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    sort: str = Query("added", pattern="^(added|size|uses|used)$", description="Sort field"),
    order: str = Query("desc", pattern="^(asc|desc)$", description="Sort order"),
    db_session: Session = Depends(get_session),
) -> dict:
    """List cached files with pagination, search, and sort."""
    entries, total = await cache_service.list_cache_entries(
        db_session,
        playlist_type=playlist,
        search=search,
        offset=offset,
        limit=limit,
        sort=sort,
        order=order,
    )

    metadata_map = get_metadata_map(db_session, [e.id for e in entries if e.id])

    return {
        "entries": [
            {**FileCachePublic.model_validate(entry).model_dump(), "metadata": metadata_map.get(entry.id or 0, [])}
            for entry in entries
        ],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.delete(
    "/cache/{cache_id}",
    response_model=SuccessResponse,
    summary="Delete Cache Entry",
    description="Delete a cache entry and optionally the file",
    responses={404: {"model": ErrorResponse, "description": "Cache entry not found"}},
)
async def delete_cache(
    cache_id: int,
    delete_file: bool = Query(False, description="Also delete the physical file"),
    db_session: Session = Depends(get_session),
) -> SuccessResponse:
    """Delete cache entry and optionally the file."""
    try:
        await cache_service.delete_cache_entry(db_session, cache_id, delete_file)
        return SuccessResponse()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch(
    "/queue/{playlist}/{song_id}/metadata",
    response_model=SuccessResponse,
    summary="Admin Edit Song Metadata",
    description=(
        "Edit metadata of any song in user queue or fallback playlist. "
        "Updates both ID3 tags in the audio file and Redis cache. "
        "Admins can edit any song. Only MP3 files supported."
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request or file format"},
        404: {"model": ErrorResponse, "description": "Song not found"},
    },
)
async def admin_edit_song_metadata(
    playlist: PlaylistType,
    song_id: str,
    request: SongMetadataEditRequest,
    redis_client: RedisService = Depends(dep_redis_client),
) -> SuccessResponse:
    """Edit metadata for any song (admin only)."""
    # Parse song ID to get MPD ID
    try:
        mpd_song_id, _ = parse_song_id(song_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid song ID format")

    # Get MPD client for the specified playlist
    mpd_client = get_mpd_client(playlist)

    try:
        await mpd_client.connect()

        # Get song file path from MPD
        file_path = await metadata_editor.get_song_file_path(playlist, str(mpd_song_id), mpd_client)

        if not file_path:
            raise HTTPException(status_code=404, detail="Song not found in queue")

        # Update metadata (ID3 + Redis)
        try:
            await metadata_editor.update_song_metadata(
                redis_client=redis_client,
                playlist=playlist,
                mpd_song_id=str(mpd_song_id),
                file_path=file_path,
                title=request.title,
                artist=request.artist,
                album=request.album,
                genre=request.genre,
            )
        except metadata_editor.MetadataEditException as e:
            raise HTTPException(status_code=400, detail=str(e))
    finally:
        await mpd_client.disconnect()

    return SuccessResponse()


@router.get(
    "/cache/stats",
    response_model=dict,
    summary="Cache Statistics",
    description="Get cache statistics",
)
async def cache_stats(
    db_session: Session = Depends(get_session),
) -> dict:
    """Get cache statistics."""
    return await cache_service.get_cache_stats(db_session)


@router.get(
    "/cache/{cache_id}/stream",
    summary="Stream Cached File",
    description="Stream a cached audio file by its ID",
    responses={404: {"model": ErrorResponse, "description": "Cache entry or file not found"}},
    dependencies=[Depends(require_admin_role)],
)
async def stream_cache_file(
    cache_id: int,
    db_session: Session = Depends(get_session),
) -> StreamingResponse:
    """Stream a cached audio file."""
    entry = db_session.get(FileCache, cache_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Cache entry not found")

    file_path = Path(entry.filepath)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Cached file not found on disk")

    media_type_map = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".opus": "audio/opus",
    }
    media_type = media_type_map.get(file_path.suffix.lower(), "audio/mpeg")

    def iterfile():
        with open(file_path, "rb") as f:
            while chunk := f.read(64 * 1024):
                yield chunk

    return StreamingResponse(
        iterfile(),
        media_type=media_type,
        headers={"Accept-Ranges": "bytes", "Cache-Control": "no-cache"},
    )


@router.post(
    "/cache/lookup-by-hash",
    response_model=dict,
    summary="Lookup Cache Entries by File Hash",
    description="Upload a file to compute its MD5 and find matching cache entries. File is not stored.",
)
async def lookup_cache_by_hash(
    file: UploadFile,
    db_session: Session = Depends(get_session),
) -> dict:
    """Compute MD5 of the uploaded file and return matching cache entries."""
    content = await file.read()
    # MD5 here is for dedup identity matching, not cryptographic security
    md5_hash = hashlib.md5(content).hexdigest()

    statement = select(FileCache).where(FileCache.md5_hash == md5_hash)
    matches = db_session.exec(statement).all()
    metadata_map = get_metadata_map(db_session, [e.id for e in matches if e.id is not None])

    return {
        "md5_hash": md5_hash,
        "matches": [
            {**FileCachePublic.model_validate(entry).model_dump(), "metadata": metadata_map.get(entry.id or 0, [])}
            for entry in matches
        ],
    }


@router.get(
    "/cache/metadata/distinct",
    response_model=dict,
    summary="Get Distinct Metadata Values",
    description="Get distinct titles and artists from cache_metadata for filter dropdowns",
)
async def cache_metadata_distinct(
    db_session: Session = Depends(get_session),
) -> dict:
    """Return distinct title and artist values stored in cache_metadata."""
    return {
        "titles": get_distinct_metadata_values(db_session, "title"),
        "artists": get_distinct_metadata_values(db_session, "artist"),
    }


@router.delete(
    "/cache",
    response_model=dict,
    summary="Bulk Delete Cache Entries",
    description="Delete multiple cache entries by ID, optionally deleting their files",
    dependencies=[Depends(require_admin_role)],
)
async def bulk_delete_cache(
    ids: list[int] = Body(..., description="List of cache entry IDs to delete"),
    delete_file: bool = Query(False, description="Also delete the physical files"),
    db_session: Session = Depends(get_session),
) -> dict:
    """Bulk delete cache entries."""
    deleted = 0
    not_found = 0
    for cache_id in ids:
        try:
            await cache_service.delete_cache_entry(db_session, cache_id, delete_file)
            deleted += 1
        except ValueError:
            not_found += 1

    return {"deleted": deleted, "not_found": not_found}


@router.get(
    "/navidrome/playlists",
    response_model=list[NavidromePlaylistItem],
    summary="List All Navidrome Playlists",
    description="Return all Navidrome playlists (no user visibility filter). Admin only.",
    dependencies=[Depends(require_admin_role)],
)
async def list_all_navidrome_playlists() -> list[NavidromePlaylistItem]:
    """Return all Navidrome playlists for admin cache purge use."""
    if not settings.navidrome_enabled:
        raise HTTPException(status_code=503, detail="Navidrome integration not configured")
    svc = NavidromeService()
    playlists = await svc.get_playlists()
    return [
        NavidromePlaylistItem(id=p.id, name=p.name, song_count=p.song_count, comment=p.comment, public=p.public)
        for p in playlists
    ]


@router.get(
    "/navidrome/albums/search",
    response_model=list[NavidromeAlbumItem],
    summary="Search Navidrome Albums",
    description="Search Navidrome albums by query string. Admin only.",
    dependencies=[Depends(require_admin_role)],
)
async def search_navidrome_albums_admin(query: str = Query(..., description="Search query")) -> list[NavidromeAlbumItem]:
    """Search Navidrome albums for admin cache purge use."""
    if not settings.navidrome_enabled:
        raise HTTPException(status_code=503, detail="Navidrome integration not configured")
    if not query.strip():
        return []
    svc = NavidromeService()
    albums = await svc.search_albums(query)
    return [NavidromeAlbumItem(id=a.id, name=a.name, artist=a.artist, song_count=a.song_count) for a in albums]


@router.post(
    "/cache/purge-navidrome",
    response_model=NavidromePurgeResponse,
    summary="Purge Cache by Navidrome Playlist or Album",
    description="Fetch songs from a Navidrome playlist or album and delete matching cache entries.",
    dependencies=[Depends(require_admin_role)],
)
async def purge_navidrome_cache(
    request: NavidromePurgeRequest,
    db_session: Session = Depends(get_session),
) -> NavidromePurgeResponse:
    """Purge all cache entries whose reference_url matches songs in the given playlist or album."""
    if not settings.navidrome_enabled:
        raise HTTPException(status_code=503, detail="Navidrome integration not configured")
    svc = NavidromeService()
    if request.source == "playlist":
        songs = await svc.get_playlist_songs(request.id)
    else:
        songs = await svc.get_album_songs(request.id)
    song_ids = [s.id for s in songs]
    purged = await cache_service.purge_navidrome_songs(db_session, song_ids)
    return NavidromePurgeResponse(purged=purged, songs_checked=len(song_ids))


@router.post(
    "/cache/purge-all",
    response_model=PurgeAllCacheResponse,
    summary="Purge ALL cache entries and files",
    description=(
        "DESTRUCTIVE: deletes every cache row and every file on disk it references. "
        "Songs currently queued in MPD that reference deleted files will fail to play until re-added. "
        "Requires confirm='PURGE ALL CACHE' in the request body."
    ),
    dependencies=[Depends(require_admin_role)],
)
async def purge_all_cache(
    request: PurgeAllCacheRequest,  # noqa: ARG001  # kept for request-body validation gate
    db_session: Session = Depends(get_session),
) -> PurgeAllCacheResponse:
    """Wipe full cache (db rows + files).

    Guarded by Literal on request.confirm.
    """
    result = await cache_service.purge_all(db_session)
    return PurgeAllCacheResponse(entries=result["entries"], files=result["files"])
