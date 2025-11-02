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

    MPD_USER_HOST: str = "localhost"
    MPD_USER_PORT: int = 6600
    MPD_FALLBACK_HOST: str = "localhost"
    MPD_FALLBACK_PORT: int = 6601

    LIQUIDSOAP_TELNET_HOST: str = "liquidsoap"
    LIQUIDSOAP_TELNET_PORT: int = 1234

    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    VOLUME_PATH: str = "./volumes"
    DATA_PATH: str = "/app/data"
    RECORDINGS_PATH: str = "/app/data/recordings"

    # Music and songs directories (configurable for tests)
    MUSIC_ROOT_PATH: str = "/music"
    SONGS_ROOT_PATH: str = "/songs"

    ICECAST_HOST: str = "icecast"
    ICECAST_PORT: int = 8000

    DEFAULT_MAX_QUEUE_SONGS: int = 3
    DEFAULT_MAX_ADD_REQUESTS: int = 10

    # Upload limits
    MAX_SONG_DURATION_SECONDS: int = 1800  # 30 minutes for user uploads
    MAX_FILE_SIZE_MB: int = 50  # Maximum file size in MB
    DUPLICATE_CHECK_LIMIT: int = 5  # Number of songs to check for duplicates

    model_config = SettingsConfigDict(
        env_file="../.env",
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
