from pydantic import BaseModel
from pydantic import Field


class TokenCreateRequest(BaseModel):
    """Request model for creating JWT tokens."""

    duration_seconds: int = Field(..., ge=1, le=86400, description="Token validity duration in seconds (max 1 day)")


class TokenCreateResponse(BaseModel):
    """Response model for JWT token creation."""

    token: str = Field(..., description="JWT bearer token")


class SuccessResponse(BaseModel):
    """Generic success response."""

    status: str = Field(default="success", description="Operation status")


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
