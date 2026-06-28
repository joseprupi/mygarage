from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://carsocial:carsocial@localhost:5433/carsocial"
    jwt_secret: str = Field(default="change-me-in-production")
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 24 * 7
    # Comma-separated list of allowed CORS origins (e.g. "https://app.example.com,https://example.com").
    # Defaults to the local dev frontend; set CORS_ORIGINS in prod to add the deployed domain.
    # NoDecode: take the raw env string (skip pydantic-settings' JSON pre-parse)
    # so the validator below can accept a plain comma-separated value.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3001"]
    google_client_id: str | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, value):
        # Accept a comma-separated string from the environment (CORS_ORIGINS=a,b,c)
        # in addition to the native list/JSON form, so deploys don't need JSON quoting.
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    storage_endpoint_url: str | None = "http://localhost:9000"
    storage_region: str = "us-east-1"
    storage_bucket: str = "car-social"
    storage_access_key_id: str = "minioadmin"
    storage_secret_access_key: str = "minioadmin"
    public_media_base_url: str = "http://localhost:9000/car-social"
    max_upload_bytes: int = 10 * 1024 * 1024

    # --- Cloudflare Stream (video) — all optional; video uploads stay disabled
    # until all three are set. The customer code is the "<CODE>" in
    # customer-<CODE>.cloudflarestream.com; the API token is a secret.
    cloudflare_account_id: str | None = None
    cloudflare_stream_api_token: str | None = None
    cloudflare_stream_customer_code: str | None = None

    @property
    def stream_enabled(self) -> bool:
        return bool(
            self.cloudflare_account_id
            and self.cloudflare_stream_api_token
            and self.cloudflare_stream_customer_code
        )

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
