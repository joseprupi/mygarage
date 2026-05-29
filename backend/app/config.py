from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://carsocial:carsocial@localhost:5433/carsocial"
    jwt_secret: str = Field(default="change-me-in-production")
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 24 * 7
    cors_origins: list[str] = ["http://localhost:3001"]
    google_client_id: str | None = None

    storage_endpoint_url: str | None = "http://localhost:9000"
    storage_region: str = "us-east-1"
    storage_bucket: str = "car-social"
    storage_access_key_id: str = "minioadmin"
    storage_secret_access_key: str = "minioadmin"
    public_media_base_url: str = "http://localhost:9000/car-social"
    max_upload_bytes: int = 10 * 1024 * 1024

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
