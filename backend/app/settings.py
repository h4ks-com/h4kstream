import os

from pydantic import Field
from pydantic import field_validator
from pydantic_settings import BaseSettings
from pydantic_settings import SettingsConfigDict


class Settings(BaseSettings):
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    RELOAD: bool = False
    CHECK_WORKING_PROVIDERS: bool = True
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"  # Logging level: DEBUG, INFO, WARNING, ERROR, CRITICAL
    ROOT_PATH: str = ""  # API root path prefix (e.g., "/api" when behind reverse proxy)
    ADMIN_API_TOKEN: str = "changeme"  # Comma-separated list of admin tokens
    LIQUIDSOAP_TOKEN: str = "liquidsoap-secret"  # Liquidsoap internal token
    JWT_SECRET: str = Field(default_factory=lambda: os.urandom(24).hex())

    @property
    def admin_tokens(self) -> list[str]:
        """Get all valid admin tokens (ADMIN_API_TOKEN + LIQUIDSOAP_TOKEN)."""
        tokens = [t.strip() for t in self.ADMIN_API_TOKEN.split(",") if t.strip()]
        if self.LIQUIDSOAP_TOKEN.strip():
            tokens.append(self.LIQUIDSOAP_TOKEN.strip())
        return tokens

    @property
    def REDIS_URL(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}"

    @property
    def LIQUIDSOAP_RECORDING_URL(self) -> str:
        """Get the full URL for Liquidsoap recording stream."""
        return f"http://{self.LIQUIDSOAP_RECORDING_HOST}:{self.LIQUIDSOAP_RECORDING_PORT}/stream"

    @property
    def LIQUIDSOAP_BUFFER_URL(self) -> str:
        """Get the full URL for the Liquidsoap uncounted clip-buffer mount."""
        return f"http://{self.LIQUIDSOAP_BUFFER_HOST}:{self.LIQUIDSOAP_BUFFER_PORT}{self.LIQUIDSOAP_BUFFER_MOUNT}"

    MPD_USER_HOST: str = "localhost"
    MPD_USER_PORT: int = 6600
    MPD_FALLBACK_HOST: str = "localhost"
    MPD_FALLBACK_PORT: int = 6601

    LIQUIDSOAP_TELNET_HOST: str = "liquidsoap"
    LIQUIDSOAP_TELNET_PORT: int = 1234
    LIQUIDSOAP_RECORDING_HOST: str = "liquidsoap"
    LIQUIDSOAP_RECORDING_PORT: int = 8004

    # Rolling clip buffer: backend pulls the full radio mix from a dedicated, uncounted
    # Liquidsoap mount and keeps the most recent audio in memory to serve on-demand clips.
    STREAM_BUFFER_ENABLED: bool = True
    LIQUIDSOAP_BUFFER_HOST: str = "liquidsoap"
    LIQUIDSOAP_BUFFER_PORT: int = 8001
    LIQUIDSOAP_BUFFER_MOUNT: str = "/buffer"
    STREAM_BUFFER_SECONDS: int = 330  # Retain slightly more than the 300s max clip window

    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    VOLUME_PATH: str = "./volumes"
    DATA_PATH: str = "/app/data"
    RECORDINGS_PATH: str = "/app/data/recordings"

    # Recording clip editor: a recording edit (ordered cut/silence segments with per-segment gain,
    # fades and equal-power crossfades) is encoded into a URL blob and rendered on the fly. The
    # public render path is unauthenticated and writes nothing to disk, so it is bounded by a
    # concurrency semaphore, a wall-clock timeout and size caps to keep it cheap to abuse.
    EDIT_MAX_SEGMENTS: int = 40  # bounds URL size and per-request ffmpeg work
    EDIT_MAX_BLOB_CHARS: int = 4000  # reject oversized blobs before decoding
    EDIT_MAX_OUTPUT_SECONDS: float = 3600.0  # safety backstop on rendered duration
    EDIT_RENDER_TIMEOUT_SECONDS: float = 120.0  # kill a render that runs longer
    EDIT_MAX_CONCURRENT_RENDERS: int = 4  # simultaneous edit renders (the expensive re-encode); /stream copy is uncapped
    PEAKS_BINS_MAX: int = 4000  # max waveform resolution served by the (authed) peaks endpoint
    PEAKS_DOWNSAMPLE_RATE: int = 8000  # mono Hz fed through ffmpeg when computing peaks
    PEAKS_CACHE_DIR: str = "/app/data/peaks"  # small deterministic JSON, written only on authed requests
    EDIT_MP3_BITRATE: str = "192k"  # CBR: streamed (Xing-less) clips report correct duration to players

    # Music and songs directories (configurable for tests)
    MUSIC_ROOT_PATH: str = "/music"
    SONGS_ROOT_PATH: str = "/songs"

    ICECAST_HOST: str = "icecast"
    ICECAST_PORT: int = 8000

    JANUS_HOST: str = "host.docker.internal"
    JANUS_HTTP_PORT: int = 8100
    JANUS_ADMIN_PORT: int = 8089

    DEFAULT_MAX_QUEUE_SONGS: int = 3
    DEFAULT_MAX_ADD_REQUESTS: int = 10

    # Upload limits
    MAX_SONG_DURATION_SECONDS: int = 1800  # 30 minutes for user uploads
    MAX_FILE_SIZE_MB: int = 50  # Maximum file size in MB
    DUPLICATE_CHECK_LIMIT: int = 5  # Number of songs to check for duplicates

    # Optional Logto OAuth2 login (leave empty to use email/password login)
    LOGTO_ENDPOINT: str = ""
    LOGTO_APP_ID: str = ""
    LOGTO_APP_SECRET: str = ""
    LOGTO_REDIRECT_URI: str = ""

    @property
    def oauth_enabled(self) -> bool:
        return bool(self.LOGTO_ENDPOINT and self.LOGTO_APP_ID and self.LOGTO_APP_SECRET and self.LOGTO_REDIRECT_URI)

    # Path to cookies file for yt-dlp (enables full SoundCloud/YouTube downloads requiring login)
    YTDLP_COOKIES_FILE: str = ""

    # Navidrome integration (Subsonic API)
    NAVIDROME_URL: str = ""
    NAVIDROME_USER: str = ""
    NAVIDROME_PASSWORD: str = ""

    @property
    def navidrome_enabled(self) -> bool:
        return bool(self.NAVIDROME_URL and self.NAVIDROME_USER and self.NAVIDROME_PASSWORD)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("LOG_LEVEL")
    def validate_log_level(cls, value: str) -> str:
        """Validate log level is valid."""
        valid_levels = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        value_upper = value.upper()
        if value_upper not in valid_levels:
            raise ValueError(f"LOG_LEVEL must be one of {valid_levels}, got {value}")
        return value_upper

    @field_validator("VOLUME_PATH")
    def validate_volumes_path(cls, value):
        if not os.path.exists(value):
            os.makedirs(value, exist_ok=True)
        return value


settings = Settings()
TEMPLATES_PATH = "static"


# Lazy-evaluated path getters (allow env vars to be set before evaluation in tests)
def get_music_user_dir() -> str:
    """Get music user directory path (lazy-evaluated for test compatibility)."""
    return f"{settings.MUSIC_ROOT_PATH}/user"


def get_music_fallback_dir() -> str:
    """Get music fallback directory path (lazy-evaluated for test compatibility)."""
    return f"{settings.MUSIC_ROOT_PATH}/fallback"


def get_songs_dir() -> str:
    """Get songs directory path (lazy-evaluated for test compatibility)."""
    return settings.SONGS_ROOT_PATH


__all__ = ["settings", "get_music_user_dir", "get_music_fallback_dir", "get_songs_dir"]
