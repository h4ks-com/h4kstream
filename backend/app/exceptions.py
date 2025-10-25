class MPDError(Exception):
    """Base exception for MPD-related errors."""

    pass


class SongNotFoundError(MPDError):
    """Exception raised when a song is not found in MPD."""

    pass


class MPDConnectionError(MPDError):
    """Exception raised when MPD connection fails."""

    pass


class FileNotFoundInMPDError(MPDError):
    """Exception raised when a file/directory is not found in MPD."""

    pass
