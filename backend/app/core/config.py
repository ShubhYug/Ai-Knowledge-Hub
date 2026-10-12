"""Settings read from environment variables (see .env.example)."""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    storage_dir: str
    jwt_secret: str
    jwt_expire_minutes: int
    max_upload_bytes: int
    chunk_size: int
    chunk_overlap: int
    top_k: int
    min_score: float
    openai_api_key: str
    openai_base_url: str
    embedding_model: str
    llm_model: str
    cors_origins: list[str]


def load_settings() -> Settings:
    return Settings(
        database_url=os.getenv("DATABASE_URL", "sqlite:///./data/app.db"),
        storage_dir=os.getenv("STORAGE_DIR", "./data/files"),
        jwt_secret=os.getenv("JWT_SECRET", "dev-only-change-me"),
        jwt_expire_minutes=int(os.getenv("JWT_EXPIRE_MINUTES", "60")),
        max_upload_bytes=int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024))),
        chunk_size=int(os.getenv("CHUNK_SIZE", "800")),
        chunk_overlap=int(os.getenv("CHUNK_OVERLAP", "100")),
        top_k=int(os.getenv("TOP_K", "4")),
        min_score=float(os.getenv("MIN_SCORE", "0.15")),
        openai_api_key=os.getenv("OPENAI_API_KEY", ""),
        openai_base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        embedding_model=os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"),
        llm_model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
        cors_origins=[
            o.strip()
            for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
            if o.strip()
        ],
    )


settings = load_settings()
