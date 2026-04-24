from enum import Enum
from typing import Literal

from pydantic import BaseModel
from pydantic import Field
from pydantic import model_validator

from app.types import PlaybackAction
from app.types import PlaylistType
from app.types import SourceType


class TokenCreateRequest(BaseModel):
    """Request model for creating JWT tokens."""

    duration_seconds: int = Field(..., ge=1, le=86400, description="Token validity duration in seconds (max 1 day)")
    max_queue_songs: int | None = Field(None, ge=1, le=100, description="Maximum songs allowed in queue simultaneously")
    max_add_requests: int | None = Field(
        None,
        ge=1,
        le=1000,
        description="Total number of times user can invoke add endpoint (lifetime limit, persists after deletes)",
    )

    @model_validator(mode="after")
    def validate_add_requests(self) -> "TokenCreateRequest":
        """Validate that max_add_requests >= max_queue_songs."""
        if self.max_add_requests is not None and self.max_queue_songs is not None:
            if self.max_add_requests < self.max_queue_songs:
                raise ValueError(
                    f"max_add_requests ({self.max_add_requests}) must be >= max_queue_songs ({self.max_queue_songs})"
                )
        return self


class TokenCreateResponse(BaseModel):
    """Response model for JWT token creation."""

    token: str = Field(..., description="JWT bearer token")
    refresh_token: str | None = Field(None, description="Refresh token for renewing JWT")


class TokenRefreshRequest(BaseModel):
    """Request model for token refresh."""

    token: str = Field(..., description="Current JWT token (expired or valid)")


class TokenRefreshResponse(BaseModel):
    """Response model for token refresh."""

    token: str = Field(..., description="New JWT bearer token")
    refresh_token: str = Field(..., description="New refresh token")


class SuccessResponse(BaseModel):
    """Generic success response."""

    status: str = Field(default="success", description="Operation status")


class LivestreamConnectResponse(BaseModel):
    """Response for livestream connection with intro jingle filename."""

    status: str = Field(default="success", description="Operation status")
    intro_filename: str | None = Field(default=None, description="Custom intro jingle filename if available")


class SongAddedResponse(BaseModel):
    """Response for song addition with song ID."""

    status: str = Field(default="success", description="Operation status")
    song_id: str = Field(..., description="Prefixed song ID (u-{id} for user, f-{id} for fallback)")


class SongItem(BaseModel):
    """MPD song queue item."""

    id: str = Field(..., description="MPD queue ID")
    file: str = Field(..., description="File path in MPD")
    title: str | None = Field(None, description="Song title")
    artist: str | None = Field(None, description="Song artist")
    album: str | None = Field(None, description="Song album")
    genre: str | None = Field(None, description="Song genre")
    time: str | None = Field(None, description="Song duration")
    pos: str | None = Field(None, description="Position in queue")
    playlist: PlaylistType = Field(..., description="Playlist source: user, fallback, or live")
    reference_url: str | None = Field(None, description="User-facing reference URL for clickable links")
    direct_url: str | None = Field(None, description="Direct stream URL for this cached song")


class SongListResponse(BaseModel):
    """Response model for song listing."""

    songs: list[SongItem] = Field(default_factory=list, description="List of songs in queue")


class ErrorResponse(BaseModel):
    """Error response model."""

    detail: str = Field(..., description="Error message")


class LivestreamTokenCreateRequest(BaseModel):
    """Request model for creating livestream tokens."""

    max_streaming_seconds: int = Field(
        ..., ge=60, le=86400, description="Maximum streaming time in seconds (1 min to 24 hours)"
    )
    show_name: str | None = Field(
        None, min_length=1, max_length=255, description="Optional show identifier (validates ownership if provided)"
    )
    min_recording_duration: int = Field(
        60, ge=1, le=3600, description="Minimum duration in seconds to keep recording (default 60)"
    )


class LivestreamTokenResponse(BaseModel):
    """Response model for livestream token creation."""

    token: str = Field(..., description="JWT token for streaming authentication")
    expires_at: str = Field(..., description="ISO format expiration timestamp")
    max_streaming_seconds: int = Field(..., description="Maximum allowed streaming time in seconds")


class LivestreamAuthRequest(BaseModel):
    """Request model for livestream authentication."""

    token: str = Field(..., description="JWT streaming token")
    address: str = Field(..., description="Source IP address")


class LivestreamAuthResponse(BaseModel):
    """Response model for livestream authentication."""

    success: bool = Field(..., description="Whether authentication succeeded")
    reason: str | None = Field(None, description="Failure reason if not successful")
    show_name: str | None = Field(None, description="Show name from token (if success)")
    min_recording_duration: int | None = Field(None, description="Minimum recording duration in seconds (if success)")


class LivestreamConnectRequest(BaseModel):
    """Request model for livestream connection tracking."""

    token: str = Field(..., description="JWT streaming token")


class LivestreamDisconnectRequest(BaseModel):
    """Request model for livestream disconnection tracking."""

    token: str = Field(..., description="JWT streaming token")


class PlaybackControlRequest(BaseModel):
    """Request model for playback control operations."""

    playlist: PlaylistType = Field(default="user", description="Target playlist (user or radio)")
    action: PlaybackAction = Field(..., description="Playback action (play, pause, resume)")


class NowPlayingMetadata(BaseModel):
    """Metadata for currently playing track."""

    title: str | None = Field(None, description="Track title")
    artist: str | None = Field(None, description="Track artist")
    genre: str | None = Field(None, description="Track genre")
    description: str | None = Field(None, description="Track description")
    reference_url: str | None = Field(None, description="Reference URL for clickable track link")
    direct_url: str | None = Field(None, description="Direct stream URL for this cached song")
    show_name: str | None = Field(None, description="Show name (livestream only)")
    show_user: str | None = Field(None, description="Show user ID (livestream only)")


class MetadataUpdateRequest(BaseModel):
    """Request for updating track metadata (from Liquidsoap)."""

    source: SourceType = Field(..., description="Source type: user, fallback, or livestream")
    metadata: NowPlayingMetadata = Field(..., description="Track metadata")


class MetadataSetRequest(BaseModel):
    """Request for setting custom livestream metadata (from streamer)."""

    title: str | None = Field(None, description="Stream title")
    artist: str | None = Field(None, description="Artist/streamer name")
    genre: str | None = Field(None, description="Music genre")
    description: str | None = Field(None, description="Stream description")


class SongMetadataEditRequest(BaseModel):
    """Request for editing song metadata (ID3 tags, Redis cache, and FileCache)."""

    title: str | None = Field(None, description="Song title")
    artist: str | None = Field(None, description="Artist name")
    album: str | None = Field(None, description="Album name")
    genre: str | None = Field(None, description="Music genre")
    reference_url: str | None = Field(None, description="Reference URL for user-facing link")


class NowPlayingResponse(BaseModel):
    """Response for current playing track information."""

    source: SourceType = Field(..., description="Current source: user, fallback, or livestream")
    metadata: NowPlayingMetadata = Field(..., description="Track metadata")


# =============================================================================
# Webhook Models
# =============================================================================


class WebhookSubscriptionRequest(BaseModel):
    """Request model for creating webhook subscriptions."""

    url: str = Field(..., description="Webhook endpoint URL (will receive POST requests)")
    events: list[str] = Field(
        ...,
        min_length=1,
        description="Event types to subscribe to: song_changed, song_added, livestream_started, livestream_ended, queue_switched, livestream_recording_done",
    )
    signing_key: str = Field(
        ..., min_length=16, description="Secret key for HMAC signature verification (min 16 chars)"
    )
    description: str | None = Field(None, description="Optional description of webhook purpose")

    @model_validator(mode="after")
    def validate_events(self) -> "WebhookSubscriptionRequest":
        valid_events = {"song_changed", "song_added", "livestream_started", "livestream_ended", "queue_switched", "livestream_recording_done"}
        for event in self.events:
            if event not in valid_events:
                raise ValueError(f"Invalid event type: {event}. Must be one of {valid_events}")
        return self


class WebhookSubscriptionResponse(BaseModel):
    """Response model for webhook subscription creation."""

    webhook_id: str = Field(..., description="Unique webhook identifier")
    url: str = Field(..., description="Webhook endpoint URL")
    events: list[str] = Field(..., description="Subscribed event types")
    description: str | None = Field(None, description="Webhook description")
    created_at: str = Field(..., description="ISO format creation timestamp")


class WebhookSubscription(BaseModel):
    """Full webhook subscription details."""

    webhook_id: str = Field(..., description="Unique webhook identifier")
    url: str = Field(..., description="Webhook endpoint URL")
    events: list[str] = Field(..., description="Subscribed event types")
    description: str | None = Field(None, description="Webhook description")
    created_at: str = Field(..., description="ISO format creation timestamp")


class WebhookDelivery(BaseModel):
    """Webhook delivery attempt log."""

    webhook_id: str = Field(..., description="Webhook identifier")
    event_type: str = Field(..., description="Event type delivered")
    url: str = Field(..., description="Destination URL")
    status: str = Field(..., description="Delivery status: success or failed")
    status_code: int | None = Field(None, description="HTTP status code (if request succeeded)")
    error: str | None = Field(None, description="Error message (if delivery failed)")
    timestamp: str = Field(..., description="ISO format delivery timestamp")


class WebhookStats(BaseModel):
    """Webhook delivery statistics."""

    webhook_id: str = Field(..., description="Webhook identifier")
    total_deliveries: int = Field(..., description="Total delivery attempts")
    success_count: int = Field(..., description="Successful deliveries")
    failure_count: int = Field(..., description="Failed deliveries")
    success_rate: float = Field(..., description="Success rate (0.0-1.0)")
    last_delivery: str | None = Field(None, description="ISO format timestamp of last delivery attempt")


# =============================================================================
# Recording Models
# =============================================================================


class RecordingMetadata(BaseModel):
    """Recording metadata."""

    id: int = Field(..., description="Recording ID")
    created_at: str = Field(..., description="ISO format creation timestamp")
    title: str | None = Field(None, description="Recording title")
    artist: str | None = Field(None, description="Artist name")
    genre: str | None = Field(None, description="Genre")
    description: str | None = Field(None, description="Description")
    duration_seconds: float = Field(..., description="Duration in seconds")
    stream_url: str = Field(..., description="Relative URL to stream the recording")
    max_listeners: int | None = Field(None, description="Peak concurrent listener count during recording")


class ShowRecordings(BaseModel):
    """Recordings grouped by show name."""

    show_name: str = Field(..., description="Show name")
    recordings: list[RecordingMetadata] = Field(..., description="List of recordings for this show")


class RecordingsListResponse(BaseModel):
    """Response for recordings list with pagination."""

    shows: list[ShowRecordings] = Field(..., description="Recordings grouped by show")
    total_shows: int = Field(..., description="Total number of shows")
    total_recordings: int = Field(..., description="Total number of recordings")
    page: int = Field(..., description="Current page number")
    page_size: int = Field(..., description="Page size")


class LivestreamTimeRemainingRequest(BaseModel):
    """Request for checking livestream time remaining."""

    token: str = Field(..., description="Livestream JWT token")


class LivestreamTimeRemainingResponse(BaseModel):
    """Response with livestream time remaining."""

    seconds_remaining: int = Field(..., description="Remaining time in seconds (includes 10s threshold)")


class ClientCountsResponse(BaseModel):
    """Response for current client/listener counts from all sources."""

    icecast: int = Field(..., description="Current Icecast (harbor output) listener count")
    webrtc: int = Field(..., description="Current WebRTC (Janus) viewer count")
    total: int = Field(..., description="Combined total listener count")


# =============================================================================
# Webhook Event Payload Models
# =============================================================================


class SongChangedEventData(BaseModel):
    """Data payload for song_changed webhook events."""

    playlist: SourceType = Field(..., description="Source playlist: user, fallback, or livestream")
    title: str = Field(..., description="Song title (fallback: 'Unknown Track' or 'Live Stream')")
    artist: str = Field(..., description="Artist name (fallback: 'Unknown Artist')")
    genre: str | None = Field(None, description="Music genre (optional)")


class SongAddedEventData(BaseModel):
    """Data payload for song_added webhook events."""

    song_id: str = Field(..., description="Prefixed song ID (u-{id} or f-{id})")
    playlist: PlaylistType = Field(..., description="Target playlist: user or fallback")
    title: str | None = Field(None, description="Song title (may be None)")
    artist: str | None = Field(None, description="Artist name (may be None)")


class SongDeletedEventData(BaseModel):
    """Data payload for song_deleted webhook events."""

    song_id: str = Field(..., description="Prefixed song ID (u-{id} or f-{id})")
    playlist: PlaylistType = Field(..., description="Target playlist: user or fallback")


class LivestreamStartedEventData(BaseModel):
    """Data payload for livestream_started webhook events."""

    user_id: str = Field(..., description="User ID who started the stream")
    show_name: str = Field(..., description="Show name identifier")
    min_recording_duration: int = Field(..., description="Minimum recording duration in seconds")


class LivestreamEndedEventData(BaseModel):
    """Data payload for livestream_ended webhook events."""

    user_id: str = Field(..., description="User ID who was streaming")
    duration_seconds: int = Field(..., description="Total stream duration in seconds")
    reason: str = Field(..., description="Disconnect reason (e.g., 'disconnect', 'time_limit')")


class QueueSwitchedEventData(BaseModel):
    """Data payload for queue_switched webhook events."""

    from_source: SourceType = Field(..., description="Previous active source")
    to_source: SourceType = Field(..., description="New active source")


class LivestreamRecordingDoneEventData(BaseModel):
    """Data payload for livestream_recording_done webhook events."""

    recording_id: int = Field(..., description="Database recording ID")
    show_name: str = Field(..., description="Show name identifier")
    title: str | None = Field(None, description="Recording title")
    artist: str | None = Field(None, description="Artist/streamer name")
    duration_seconds: float = Field(..., description="Recording duration in seconds")
    recording_url: str = Field(..., description="Relative API path to recording (e.g., '/recordings/stream/21')")


# =============================================================================
# Playlist Models
# =============================================================================


class PlaylistSource(str, Enum):
    NAVIDROME = "navidrome"
    NAVIDROME_ALBUM = "navidrome_album"


class NavidromeAlbumItem(BaseModel):
    """A Navidrome album returned from search."""

    id: str = Field(..., description="Navidrome album ID")
    name: str = Field(..., description="Album name")
    artist: str = Field(..., description="Artist name")
    song_count: int = Field(..., description="Number of songs in the album")


class NavidromePlaylistItem(BaseModel):
    """A Navidrome playlist available to add to the queue."""

    id: str = Field(..., description="Navidrome playlist ID")
    name: str = Field(..., description="Playlist name")
    song_count: int = Field(..., description="Number of songs in the playlist")
    comment: str = Field(default="", description="Playlist comment/description")
    public: bool = Field(default=False, description="Whether the playlist is public")


class PlaylistAddRequest(BaseModel):
    """Request to add a playlist to the user queue."""

    source: PlaylistSource = Field(..., description="Playlist source (e.g. navidrome)")
    playlist_id: str = Field(..., description="ID of the playlist to add")
    clamp: bool = Field(default=False, description="Trim playlist to remaining queue capacity instead of rejecting")


class PlaylistSongResult(BaseModel):
    """Result for a single song added from a playlist."""

    song_id: str = Field(..., description="Prefixed song ID added to queue")
    title: str = Field(..., description="Song title")
    artist: str = Field(..., description="Artist name")


class PlaylistAddResponse(BaseModel):
    """Response after adding a playlist to the queue."""

    added: list[PlaylistSongResult] = Field(default_factory=list, description="Successfully added songs")
    errors: list[str] = Field(default_factory=list, description="Per-song error messages")
    total_added: int = Field(..., description="Total number of songs added")


class NavidromePurgeRequest(BaseModel):
    """Request to purge cache entries for a Navidrome playlist or album."""

    source: Literal["playlist", "album"] = Field(..., description="'playlist' or 'album'")
    id: str = Field(..., description="Navidrome playlist or album ID")


class NavidromePurgeResponse(BaseModel):
    """Response after purging Navidrome cache entries."""

    purged: int = Field(..., description="Number of cache entries deleted")
    songs_checked: int = Field(..., description="Number of songs looked up from Navidrome")


class PurgeAllCacheRequest(BaseModel):
    """Destructive: wipe every cache entry AND its file on disk."""

    confirm: Literal["PURGE ALL CACHE"] = Field(
        ..., description="Must equal 'PURGE ALL CACHE' to proceed; any other value rejected"
    )


class PurgeAllCacheResponse(BaseModel):
    """Response after full cache purge."""

    entries: int = Field(..., description="Number of cache rows deleted")
    files: int = Field(..., description="Number of files unlinked from disk")


class WebhookEventPayload(BaseModel):
    """Complete webhook event payload structure sent to webhook URLs."""

    event_type: str = Field(
        ...,
        description="Event type: song_changed, song_added, livestream_started, livestream_ended, queue_switched, livestream_recording_done"
    )
    timestamp: str = Field(..., description="ISO format event timestamp")
    data: (
        SongChangedEventData
        | SongAddedEventData
        | LivestreamStartedEventData
        | LivestreamEndedEventData
        | QueueSwitchedEventData
        | LivestreamRecordingDoneEventData
    ) = Field(..., description="Event-specific data payload")
    description: str = Field(..., description="Human-readable event description")
