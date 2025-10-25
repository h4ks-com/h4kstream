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
    ADMIN_API_TOKEN: str = "changeme"
    JWT_SECRET: str = Field(default_factory=lambda: os.urandom(24).hex())
    MPD_HOST: str = "localhost"
    MPD_PORT: int = 6600
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    VOLUME_PATH: str = "./volumes"
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("VOLUME_PATH")
    def validate_volumes_path(cls, value):
        if not os.path.exists(value):
            os.makedirs(value)
        return value


settings = Settings()
TEMPLATES_PATH = "static"
MUSIC_DIR = "/music"
SONGS_DIR = "/songs"

__all__ = ["settings", "MUSIC_DIR", "SONGS_DIR"]
