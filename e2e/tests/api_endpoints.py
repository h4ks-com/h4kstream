"""API endpoint configuration for E2E tests.

Centralizes all API URLs to make refactoring easier.
"""

# ============================================================================
# Queue Endpoints (Public - User Queue)
# ============================================================================

QUEUE_ADD = "/queue/add"
QUEUE_LIST = "/queue/list"
QUEUE_DELETE = "/queue/{song_id}"  # Format with song_id


# ============================================================================
# Admin Queue Endpoints
# ============================================================================

ADMIN_QUEUE_ADD = "/admin/queue/add"
ADMIN_QUEUE_LIST = "/admin/queue/list"
ADMIN_QUEUE_DELETE = "/admin/queue/{song_id}"  # Format with song_id
ADMIN_QUEUE_CLEAR = "/admin/queue/clear"


# ============================================================================
# Admin Playback Endpoints
# ============================================================================

ADMIN_PLAYBACK_PLAY = "/admin/playback/play"
ADMIN_PLAYBACK_PAUSE = "/admin/playback/pause"
ADMIN_PLAYBACK_RESUME = "/admin/playback/resume"


# ============================================================================
# Admin Token Management
# ============================================================================

ADMIN_TOKEN_CREATE = "/admin/token"
ADMIN_LIVESTREAM_TOKEN_CREATE = "/admin/livestream/token"


# ============================================================================
# Internal Endpoints (Liquidsoap callbacks)
# ============================================================================

INTERNAL_LIVESTREAM_AUTH = "/internal/livestream/auth"
INTERNAL_LIVESTREAM_CONNECT = "/internal/livestream/connect"
INTERNAL_LIVESTREAM_DISCONNECT = "/internal/livestream/disconnect"


# ============================================================================
# Query Parameters
# ============================================================================

class Playlist:
    """Playlist type query parameters."""

    USER = "user"
    FALLBACK = "fallback"


# ============================================================================
# Helper Functions
# ============================================================================


def queue_delete(song_id: int) -> str:
    """Get queue delete endpoint with song_id."""
    return QUEUE_DELETE.format(song_id=song_id)


def admin_queue_delete(song_id: int) -> str:
    """Get admin queue delete endpoint with song_id."""
    return ADMIN_QUEUE_DELETE.format(song_id=song_id)


def admin_queue_clear(playlist: str = Playlist.USER) -> str:
    """Get admin queue clear endpoint with playlist parameter."""
    return f"{ADMIN_QUEUE_CLEAR}?playlist={playlist}"


def admin_queue_list(playlist: str = Playlist.USER) -> str:
    """Get admin queue list endpoint with playlist parameter."""
    return f"{ADMIN_QUEUE_LIST}?playlist={playlist}"


def admin_queue_add(playlist: str = Playlist.USER) -> str:
    """Get admin queue add endpoint with playlist parameter."""
    return f"{ADMIN_QUEUE_ADD}?playlist={playlist}"


def admin_playback_play(playlist: str = Playlist.USER) -> str:
    """Get admin playback play endpoint with playlist parameter."""
    return f"{ADMIN_PLAYBACK_PLAY}?playlist={playlist}"


def admin_playback_pause(playlist: str = Playlist.USER) -> str:
    """Get admin playback pause endpoint with playlist parameter."""
    return f"{ADMIN_PLAYBACK_PAUSE}?playlist={playlist}"


def admin_playback_resume(playlist: str = Playlist.USER) -> str:
    """Get admin playback resume endpoint with playlist parameter."""
    return f"{ADMIN_PLAYBACK_RESUME}?playlist={playlist}"
