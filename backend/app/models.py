from pydantic import BaseModel
from pydantic import Field
from pydantic import model_validator

from app.types import PlaybackAction
from app.types import PlaylistType


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


class SuccessResponse(BaseModel):
    """Generic success response."""

    status: str = Field(default="success", description="Operation status")


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
    time: str | None = Field(None, description="Song duration")
    pos: str | None = Field(None, description="Position in queue")


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


class MetadataUpdateRequest(BaseModel):
    """Request for updating track metadata (from Liquidsoap)."""

    source: str = Field(..., description="Source type: user, fallback, or livestream")
    metadata: NowPlayingMetadata = Field(..., description="Track metadata")


class MetadataSetRequest(BaseModel):
    """Request for setting custom livestream metadata (from streamer)."""

    title: str | None = Field(None, description="Stream title")
    artist: str | None = Field(None, description="Artist/streamer name")
    genre: str | None = Field(None, description="Music genre")
    description: str | None = Field(None, description="Stream description")


class NowPlayingResponse(BaseModel):
    """Response for current playing track information."""

    source: str = Field(..., description="Current source: user, fallback, or livestream")
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
        description="Event types to subscribe to: song_changed, livestream_started, livestream_ended, queue_switched",
    )
    signing_key: str = Field(
        ..., min_length=16, description="Secret key for HMAC signature verification (min 16 chars)"
    )
    description: str | None = Field(None, description="Optional description of webhook purpose")

    @model_validator(mode="after")
    def validate_events(self) -> "WebhookSubscriptionRequest":
        """Validate event types are recognized."""
        valid_events = {"song_changed", "livestream_started", "livestream_ended", "queue_switched"}
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
