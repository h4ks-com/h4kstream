"""WebSocket event models for type generation.

These models define the structure of events sent over WebSocket connections. They are used to generate TypeScript types
for the frontend.
"""

from typing import Literal

from pydantic import BaseModel
from pydantic import Field

from app.models import LivestreamEndedEventData
from app.models import LivestreamRecordingDoneEventData
from app.models import LivestreamStartedEventData
from app.models import NowPlayingMetadata
from app.models import QueueSwitchedEventData
from app.models import SongAddedEventData
from app.models import SongChangedEventData
from app.models import SongDeletedEventData
from app.types import SourceType

EventType = Literal[
    "song_changed",
    "song_added",
    "song_deleted",
    "livestream_started",
    "livestream_ended",
    "queue_switched",
    "livestream_recording_done",
    "now_playing",
]


class NowPlayingEventData(BaseModel):
    """Data payload for now_playing events (initial state on connect)."""

    source: SourceType = Field(..., description="Active source: user, fallback, or livestream")
    metadata: NowPlayingMetadata = Field(..., description="Current track metadata")


EventDataUnion = (
    SongChangedEventData
    | SongAddedEventData
    | SongDeletedEventData
    | LivestreamStartedEventData
    | LivestreamEndedEventData
    | QueueSwitchedEventData
    | LivestreamRecordingDoneEventData
    | NowPlayingEventData
)


class WebSocketEvent(BaseModel):
    """WebSocket event message structure.

    This is the envelope format for all WebSocket messages sent to clients.
    """

    event_type: EventType = Field(..., description="Type of event")
    timestamp: str = Field(..., description="ISO format event timestamp")
    data: EventDataUnion = Field(..., description="Event-specific data payload")
    description: str | None = Field(None, description="Human-readable event description")


# Re-export all event data types for type generation
__all__ = [
    "EventType",
    "WebSocketEvent",
    "NowPlayingEventData",
    "SongChangedEventData",
    "SongAddedEventData",
    "SongDeletedEventData",
    "LivestreamStartedEventData",
    "LivestreamEndedEventData",
    "QueueSwitchedEventData",
    "LivestreamRecordingDoneEventData",
    "NowPlayingMetadata",
    "SourceType",
]
