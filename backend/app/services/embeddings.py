"""Turns text into vectors: an offline hashing embedder or an OpenAI-compatible API."""
from __future__ import annotations

import hashlib
import math
import re
from typing import List, Protocol, Sequence

import httpx

from app.core.config import settings

_STOP = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "is", "are", "was", "were",
    "for", "with", "that", "this", "it", "as", "by", "at", "be", "what", "how", "why",
    "who", "when", "does", "do", "did", "from", "about",
}


class Embedder(Protocol):
    name: str

    def embed(self, texts: Sequence[str]) -> List[List[float]]: ...


class HashingEmbedder:
    """Deterministic bag-of-words embedder. Offline default; no API key needed."""

    name = "hashing-v2"
    dim = 1024

    def embed(self, texts: Sequence[str]) -> List[List[float]]:
        return [self._one(t) for t in texts]

    def _add(self, vec: List[float], feature: str, weight: float) -> None:
        h = int.from_bytes(hashlib.md5(feature.encode()).digest()[:8], "big")
        vec[h % self.dim] += weight if (h >> 63) & 1 else -weight

    def _one(self, text: str) -> List[float]:
        vec = [0.0] * self.dim
        for tok in re.findall(r"[a-z0-9]+", text.lower()):
            if tok in _STOP or len(tok) < 2:
                continue
            if len(tok) > 3 and tok.endswith("s") and not tok.endswith("ss"):
                tok = tok[:-1]  # crude plural stemming
            self._add(vec, "w:" + tok, 1.0)
            # character trigrams make matching tolerant of typos and word variants
            padded = f"^{tok}$"
            for i in range(len(padded) - 2):
                self._add(vec, "c:" + padded[i : i + 3], 0.4)
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


class OpenAIEmbedder:
    def __init__(self) -> None:
        self.name = settings.embedding_model

    def embed(self, texts: Sequence[str]) -> List[List[float]]:
        out: List[List[float]] = []
        for i in range(0, len(texts), 64):  # providers cap batch size
            resp = httpx.post(
                f"{settings.openai_base_url}/embeddings",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json={"model": self.name, "input": list(texts[i : i + 64])},
                timeout=60,
            )
            resp.raise_for_status()
            out.extend(d["embedding"] for d in resp.json()["data"])
        return out


def get_embedder() -> Embedder:
    """Use the OpenAI-compatible API when a key is set, otherwise the offline embedder."""
    return OpenAIEmbedder() if settings.openai_api_key else HashingEmbedder()


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    """Cosine similarity: 1 means same direction (similar meaning), 0 unrelated."""
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)
