import os

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
    MPD_HOST: str = "localhost"
    MPD_PORT: int = 6600
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

__all__ = ["settings"]
