"""File storage on local disk. Replace this module to move to S3."""
from __future__ import annotations

from pathlib import Path

from app.core.config import settings


def _path(key: str) -> Path:
    """Map an object key to a file path inside STORAGE_DIR."""
    # Keys are server-generated hex ids; reject anything else defensively.
    if not key.isalnum():
        raise ValueError("invalid object key")
    return Path(settings.storage_dir) / key


def save(key: str, content: bytes) -> None:
    p = _path(key)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(content)


def load(key: str) -> bytes:
    return _path(key).read_bytes()


def delete(key: str) -> None:
    _path(key).unlink(missing_ok=True)
