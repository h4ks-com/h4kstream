"""Public API endpoints for user queue management and radio information.

User-facing endpoints that require JWT tokens. Users can only access their own user queue, not the radio playlist.
"""

import logging
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter
from fastapi import Depends
from fastapi import Form
from fastapi import HTTPException
from fastapi import Query
from fastapi import UploadFile
from sqlmodel import Session
from sqlmodel import select

from app.db import get_session
from app.db.models import FileCache
from app.db.models import User
from app.dependencies import dep_client_count_service
from app.dependencies import dep_event_publisher
from app.dependencies import dep_mpd_fallback
from app.dependencies import dep_mpd_user
from app.dependencies import dep_redis_client
from app.dependencies import get_jwt_token
from app.dependencies import get_jwt_token_optional
from app.dependencies import get_token_optional
from app.exceptions import FileNotFoundInMPDError
from app.exceptions import SongNotFoundError
from app.models import ClientCountsResponse
from app.models import ErrorResponse
from app.models import NavidromePlaylistItem
from app.models import PlaylistAddRequest
from app.models import PlaylistAddResponse
from app.models import PlaylistSongResult
from app.models import PlaylistSource
from app.models import SongAddedResponse
from app.models import SongDeletedEventData
from app.models import SongItem
from app.models import SongMetadataEditRequest
from app.models import SuccessResponse
from app.services import metadata_editor
from app.services import playback_service
from app.services import queue_service
from app.services.client_count_service import ClientCountService
from app.services.event_publisher import EventPublisher
from app.services.jwt_service import get_max_add_requests
from app.services.jwt_service import get_max_queue_songs
from app.services.jwt_service import get_user_id
from app.services.mpd_service import MPDClient
from app.services.navidrome_service import NavidromeService
from app.services.redis_service import RedisService
from app.services.redis_service import parse_song_id
from app.services.youtube_dl import YoutubeDownloadException
from app.settings import get_music_user_dir
from app.settings import get_songs_dir
from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/queue",
    tags=["queue"],
    responses={
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        403: {"model": ErrorResponse, "description": "Forbidden"},
    },
)

public_router = APIRouter(
    prefix="/public",
    tags=["public"],
)


@router.post(
    "/add",
    response_model=SongAddedResponse,
    summary="Add Song to User Queue",
    description=(
        "Add a song to your queue. Requires JWT token. "
        "Subject to limits: (1) max_queue_songs - simultaneous songs in queue, "
        "(2) max_add_requests - total lifetime add requests, "
        "(3) max_song_duration - song duration limit (30 min default), "
        "(4) max_file_size - file size limit (50MB default), "
        "(5) duplicate prevention - cannot add songs already in next 5 songs"
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request or validation failed"},
        403: {"model": ErrorResponse, "description": "Queue limit or add request limit exceeded"},
    },
)
async def add_song(
    url: str | None = Form(None),
    song_name: str | None = Form(None),
    artist: str | None = Form(None),
    reference_url: str | None = Form(None),
    file: UploadFile | None = None,
    mpd_client: MPDClient = Depends(dep_mpd_user),
    redis_client: RedisService = Depends(dep_redis_client),
    token: str = Depends(get_jwt_token),
    db_session: Session = Depends(get_session),
) -> SongAddedResponse:
    """Add a song to your user queue with validation checks."""
    user_id = get_user_id(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user_id found")

    max_songs = get_max_queue_songs(token)
    max_adds = get_max_add_requests(token)

    # Reconcile Redis against MPD before checking limits — consume mode silently
    # removes played songs from MPD without calling remove_user_song.
    mpd_queue = await mpd_client.get_queue()
    active_ids = {song["id"] for song in mpd_queue}
    await redis_client.reconcile_user_songs(user_id, active_ids)

    # Check limits
    current_queue_count = await redis_client.get_user_song_count(user_id)
    current_add_count = await redis_client.get_user_add_count(user_id)

    if current_queue_count >= max_songs:
        raise HTTPException(
            status_code=403, detail=f"Queue limit exceeded: {current_queue_count}/{max_songs} songs in queue"
        )

    if current_add_count >= max_adds:
        raise HTTPException(
            status_code=403, detail=f"Add request limit exceeded: {current_add_count}/{max_adds} total requests used"
        )

    # Get MPD clients for duplicate checking
    user_mpd = playback_service.get_mpd_client("user")
    fallback_mpd = playback_service.get_mpd_client("fallback")

    try:
        await user_mpd.connect()
        await fallback_mpd.connect()

        song_id = await queue_service.add_song(
            playlist="user",
            mpd_client=mpd_client,
            db_session=db_session,
            url=url,
            file=file,
            song_name=song_name,
            artist_name=artist,
            reference_url=reference_url,
            redis_client=redis_client,
            user_id=user_id,
            skip_validation=False,
            user_mpd_client=user_mpd,
            fallback_mpd_client=fallback_mpd,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except YoutubeDownloadException as e:
        raise HTTPException(status_code=400, detail=e.error_type.value)
    except FileNotFoundInMPDError as e:
        raise HTTPException(status_code=404, detail=str(e))
    finally:
        await user_mpd.disconnect()
        await fallback_mpd.disconnect()

    return SongAddedResponse(song_id=song_id)


@router.get(
    "/list",
    response_model=list[SongItem],
    summary="List Queue Songs",
    description=(
        "Get songs in the queue (shared by all users). "
        "Returns user queue songs first, then fallback playlist songs. "
        "Optional filter to show only songs belonging to authenticated user. "
        "No authentication required unless user_only=true. "
        "Accepts both admin tokens and user JWT tokens."
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Invalid limit parameter"},
        401: {"model": ErrorResponse, "description": "Authentication required when user_only=true"},
    },
)
async def list_songs(
    limit: int = Query(20, ge=1, le=20, description="Maximum number of songs to return (1-20)"),
    user_only: bool = Query(False, description="Filter to show only user's own songs (requires authentication)"),
    redis_client: RedisService = Depends(dep_redis_client),
    token: str | None = Depends(get_token_optional),
    db_session: Session = Depends(get_session),
) -> list[SongItem]:
    """Get songs from user queue and fallback playlist."""
    # If user_only requested, require token
    if user_only and not token:
        raise HTTPException(status_code=401, detail="Authentication required when user_only=true")

    # Extract user_id if this is a JWT token (admin tokens return None)
    user_id = get_user_id(token) if token else None

    user_mpd = playback_service.get_mpd_client("user")
    fallback_mpd = playback_service.get_mpd_client("fallback")

    try:
        await user_mpd.connect()
        await fallback_mpd.connect()
        all_songs = await queue_service.get_next_songs(user_mpd, fallback_mpd, limit, redis_client, db_session)

        # Filter for user's songs if requested and we have a user_id
        # Admin tokens (user_id=None) will see all songs even with user_only=true
        if user_only and user_id:
            filtered_songs = []
            for song in all_songs:
                # Parse song_id to get MPD id and playlist
                try:
                    mpd_id, playlist = parse_song_id(song.id)
                    # Only include user playlist songs
                    if playlist == "user":
                        # Check if this song belongs to the user
                        song_owner = await redis_client.get_song_user(str(mpd_id))
                        if song_owner == user_id:
                            filtered_songs.append(song)
                except ValueError:
                    continue

            return filtered_songs

        return all_songs
    finally:
        await user_mpd.disconnect()
        await fallback_mpd.disconnect()


@router.delete(
    "/{song_id}",
    response_model=SuccessResponse,
    summary="Delete Song from User Queue",
    description=(
        "Delete a song from your queue. Requires JWT token (you can only delete your own songs). "
        "Note: Deleting a song does NOT decrease the total add request count - "
        "the max_add_requests limit persists regardless of deletions."
    ),
    responses={404: {"model": ErrorResponse, "description": "Song not found"}},
)
async def delete_song(
    song_id: str,
    mpd_client: MPDClient = Depends(dep_mpd_user),
    redis_client: RedisService = Depends(dep_redis_client),
    token: str = Depends(get_jwt_token),
    event_publisher: EventPublisher = Depends(dep_event_publisher),
) -> SuccessResponse:
    """Delete one of your songs from the user queue."""
    user_id = get_user_id(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user_id found")

    try:
        mpd_id, playlist = parse_song_id(song_id)
        if playlist != "user":
            raise HTTPException(status_code=400, detail="Can only delete from user queue")

        await queue_service.delete_song(
            song_id=mpd_id, playlist=playlist, mpd_client=mpd_client, redis_client=redis_client, user_id=user_id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except SongNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    event_data = SongDeletedEventData(song_id=song_id, playlist="user")
    await event_publisher.publish(
        event_type="song_deleted",
        data=event_data.model_dump(),
        description=f"Song {song_id} deleted from user queue",
    )

    return SuccessResponse()


@router.patch(
    "/{song_id}/metadata",
    response_model=SuccessResponse,
    summary="Edit Song Metadata",
    description=(
        "Edit metadata of your own uploaded song. "
        "Updates both ID3 tags in the audio file and Redis cache. "
        "Users can only edit their own songs. Only MP3 files supported."
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request or file format"},
        403: {"model": ErrorResponse, "description": "Not authorized to edit this song"},
        404: {"model": ErrorResponse, "description": "Song not found"},
    },
)
async def edit_song_metadata(
    song_id: str,
    request: SongMetadataEditRequest,
    token: str = Depends(get_jwt_token),
    mpd_client: MPDClient = Depends(dep_mpd_user),
    redis_client: RedisService = Depends(dep_redis_client),
    db: Session = Depends(get_session),
) -> SuccessResponse:
    """Edit metadata for user's own uploaded song."""
    user_id = get_user_id(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user_id found")

    # Parse song ID to get MPD ID and playlist type
    try:
        mpd_song_id, playlist_type = parse_song_id(song_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid song ID format")

    # Verify this is a user song (not fallback)
    if playlist_type != "user":
        raise HTTPException(status_code=403, detail="You can only edit user-uploaded songs")

    # Verify user owns this song
    song_owner = await redis_client.get_song_user(str(mpd_song_id))
    if not song_owner or song_owner != user_id:
        raise HTTPException(status_code=403, detail="You can only edit your own songs")

    # Get song file path from MPD
    file_path = await metadata_editor.get_song_file_path("user", str(mpd_song_id), mpd_client)

    if not file_path:
        raise HTTPException(status_code=404, detail="Song not found in queue")

    # Update metadata (ID3 + Redis)
    try:
        await metadata_editor.update_song_metadata(
            redis_client=redis_client,
            playlist="user",
            mpd_song_id=str(mpd_song_id),
            file_path=file_path,
            title=request.title,
            artist=request.artist,
            album=request.album,
            genre=request.genre,
        )
    except metadata_editor.MetadataEditException as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Update FileCache reference_url if provided
    if request.reference_url is not None:
        # Get full file path to look up cache entry
        music_root = Path(get_music_user_dir())
        full_path = music_root / file_path
        filepath_str = str(full_path)

        # Find cache entry by filepath
        statement = select(FileCache).where(FileCache.filepath == filepath_str)
        cache_entry = db.exec(statement).first()

        if cache_entry:
            cache_entry.reference_url = request.reference_url
            db.add(cache_entry)
            db.commit()
            logger.info(f"Updated reference_url for cache entry {cache_entry.id}")

    return SuccessResponse()


@router.get(
    "/playlists/navidrome",
    response_model=list[NavidromePlaylistItem],
    summary="List Navidrome Playlists",
    description=(
        "List Navidrome playlists visible to the caller. "
        "Authenticated users see their own playlists plus public ones. "
        "Unauthenticated requests (or users without a Navidrome account) see only public playlists."
    ),
    responses={503: {"model": ErrorResponse}},
)
async def list_navidrome_playlists(
    token: str | None = Depends(get_jwt_token_optional),
    db_session: Session = Depends(get_session),
) -> list[NavidromePlaylistItem]:
    """List Navidrome playlists filtered by ownership and public visibility."""
    if not settings.navidrome_enabled:
        raise HTTPException(status_code=503, detail="Navidrome integration not configured")

    username: str | None = None
    if token:
        user_id = get_user_id(token)
        if user_id:
            user = db_session.get(User, UUID(user_id))
            if user:
                username = user.username

    svc = NavidromeService()
    playlists = await svc.get_playlists()
    return [
        NavidromePlaylistItem(id=p.id, name=p.name, song_count=p.song_count, comment=p.comment, public=p.public)
        for p in playlists
        if p.public or (username and p.owner == username)
    ]


@router.post(
    "/add-playlist",
    response_model=PlaylistAddResponse,
    summary="Add Playlist to Queue",
    description=(
        "Add a playlist (from Navidrome or other sources) to your user queue. "
        "Entire playlist is rejected if adding it would exceed your queue limit."
    ),
    responses={
        400: {"model": ErrorResponse},
        403: {"model": ErrorResponse, "description": "Queue limit exceeded"},
        503: {"model": ErrorResponse},
    },
)
async def add_playlist(
    request: PlaylistAddRequest,
    mpd_client: MPDClient = Depends(dep_mpd_user),
    fallback_mpd_client: MPDClient = Depends(dep_mpd_fallback),
    redis_client: RedisService = Depends(dep_redis_client),
    token: str = Depends(get_jwt_token),
    db_session: Session = Depends(get_session),
) -> PlaylistAddResponse:
    """Add all songs from a playlist to the user queue."""
    user_id = get_user_id(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user_id")

    if request.source == PlaylistSource.NAVIDROME:
        if not settings.navidrome_enabled:
            raise HTTPException(status_code=503, detail="Navidrome integration not configured")

        # Resolve Navidrome username to enforce playlist access control
        username: str | None = None
        user = db_session.get(User, UUID(user_id))
        if user:
            username = user.username

        svc = NavidromeService()

        # Only allow adding playlists the user can see (own or public)
        accessible_ids = {
            p.id for p in await svc.get_playlists()
            if p.public or (username and p.owner == username)
        }
        if request.playlist_id not in accessible_ids:
            raise HTTPException(status_code=403, detail="Playlist not accessible")

        songs = await svc.get_playlist_songs(request.playlist_id)

        # Reconcile Redis against MPD before checking limits
        mpd_queue = await mpd_client.get_queue()
        active_ids = {song["id"] for song in mpd_queue}
        await redis_client.reconcile_user_songs(user_id, active_ids)

        # Reject if adding the whole playlist would exceed the JWT queue limit
        current_count = await redis_client.get_user_song_count(user_id)
        max_songs = get_max_queue_songs(token)
        if max_songs and current_count + len(songs) > max_songs:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Adding {len(songs)} songs would exceed your {max_songs}-song limit "
                    f"(currently {current_count} in queue)"
                ),
            )

        added: list[PlaylistSongResult] = []
        errors: list[str] = []

        for song in songs:
            tmp = Path(get_songs_dir()) / f"navidrome_{song.id}.{song.suffix}"
            try:
                await svc.download_song(song.id, tmp)
                song_id = await queue_service.add_song(
                    playlist="user",
                    mpd_client=mpd_client,
                    db_session=db_session,
                    file_path=tmp,
                    song_name=song.title,
                    artist_name=song.artist,
                    reference_url=f"{settings.NAVIDROME_URL}/app/#/song/{song.id}",
                    redis_client=redis_client,
                    user_id=user_id,
                    user_mpd_client=mpd_client,
                    fallback_mpd_client=fallback_mpd_client,
                )
                added.append(PlaylistSongResult(song_id=song_id, title=song.title, artist=song.artist))
            except Exception as e:
                errors.append(f"{song.title}: {e}")
                if tmp.exists():
                    tmp.unlink()

        return PlaylistAddResponse(added=added, errors=errors, total_added=len(added))

    raise HTTPException(status_code=400, detail=f"Unsupported playlist source: {request.source}")


@public_router.get(
    "/clients",
    response_model=ClientCountsResponse,
    summary="Get Client Counts",
    description=(
        "Get current listener counts from all sources (Icecast harbor output and Janus WebRTC). "
        "Returns separate counts for each source and combined total. "
        "Always available (public endpoint, no authentication required)."
    ),
)
async def get_client_counts(
    client_count_service: ClientCountService = Depends(dep_client_count_service),
) -> ClientCountsResponse:
    """Get current client counts from Icecast and WebRTC sources."""
    return await client_count_service.get_client_counts()
