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
    song_id: int = Field(..., description="MPD song ID of the added song")


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
