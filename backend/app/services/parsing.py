"""Text extraction from PDF, DOCX and TXT files."""
from __future__ import annotations

import io
from typing import List, Tuple

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}

# (page_number or None, text)
Page = Tuple["int | None", str]


class ParseError(Exception):
    """Raised with a safe, user-visible message."""


def extension(filename: str) -> str:
    """Lowercased file extension including the dot, or "" if none."""
    dot = filename.rfind(".")
    return filename[dot:].lower() if dot != -1 else ""


def extract_pages(filename: str, content: bytes) -> List[Page]:
    """Return (page_number, text) pairs. PDFs have page numbers; DOCX and TXT use None.

    Raises ParseError, with a message safe to show users, for bad or empty files.
    """
    ext = extension(filename)
    try:
        if ext == ".txt":
            pages: List[Page] = [(None, content.decode("utf-8", errors="replace"))]
        elif ext == ".pdf":
            if not content.startswith(b"%PDF"):
                raise ParseError("File is not a valid PDF.")
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(content))
            pages = [(i + 1, p.extract_text() or "") for i, p in enumerate(reader.pages)]
        elif ext == ".docx":
            if not content.startswith(b"PK"):
                raise ParseError("File is not a valid DOCX.")
            from docx import Document

            doc = Document(io.BytesIO(content))
            pages = [(None, "\n".join(p.text for p in doc.paragraphs))]
        else:
            raise ParseError("Unsupported file type.")
    except ParseError:
        raise
    except Exception as exc:  # parser errors vary; hide the details from users
        raise ParseError("Could not read this file.") from exc

    pages = [(n, t) for n, t in pages if t.strip()]
    if not pages:
        raise ParseError("No extractable text found (scanned PDFs are not supported).")
    return pages
