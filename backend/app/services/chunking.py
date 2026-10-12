"""Splits text into overlapping chunks for embedding."""
from __future__ import annotations

import re
from typing import List, Tuple

from app.services.parsing import Page


def chunk_text(text: str, size: int, overlap: int) -> List[str]:
    """Split text into ~size-character chunks that overlap, so a sentence cut at one edge appears whole in the next."""
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    if overlap >= size:
        overlap = size // 4
    chunks, start = [], 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            # prefer breaking on a space near the end
            space = text.rfind(" ", start + size // 2, end)
            if space != -1:
                end = space
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return [c for c in chunks if c]


def chunk_pages(pages: List[Page], size: int, overlap: int) -> List[Tuple["int | None", str]]:
    out: List[Tuple["int | None", str]] = []
    for page_no, text in pages:
        for piece in chunk_text(text, size, overlap):
            out.append((page_no, piece))
    return out
