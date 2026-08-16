from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator
import os


class Settings(BaseSettings):
    # App
    PROJECT_NAME: str = "ProspectAI Backend"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    PORT: int = 4000
    HOST: str = "0.0.0.0"

    # CORS
    FRONTEND_URL: str = "http://localhost:3000"
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
    ]

    # Security & JWT
    JWT_SECRET: str = Field(default="your-jwt-secret-change-in-production")
    JWT_REFRESH_SECRET: str = Field(default="your-refresh-secret-change-in-production")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Database
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"
    )
    DIRECT_URL: Optional[str] = None

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_connection(cls, v: Optional[str]) -> str:
        if not v:
            return "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"
        # Convert standard prisma postgresql:// to asyncpg postgresql+asyncpg://
        if v.startswith("postgresql://") and not v.startswith("postgresql+asyncpg://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        return v

    # Redis
    REDIS_URL: str = Field(default="redis://localhost:6379")

    # AI API Keys
    GROQ_API_KEY: str = Field(default="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")
    TAVILY_API_KEY: str = Field(default="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")
    GOOGLE_PLACES_API_KEY: str = Field(default="AIzaSyDIyP-IlVQDOU65RlfsbcEmZzZs12NYEEQ")
    GOOGLE_GENERATIVE_AI_API_KEY: Optional[str] = None
    GOOGLE_VERTEX_PROJECT: Optional[str] = "project-317446da-f5f1-4ade-a6c"
    GOOGLE_VERTEX_LOCATION: Optional[str] = "global"
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = None

    # Verification Services
    NO2BOUNCE_API_KEY: Optional[str] = None
    ANYMAIL_FINDER_API_KEY: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env", ".env.remote", "../.env.remote"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
