"""Indexing pipeline: claim a queued document, extract, chunk, embed, save."""
from __future__ import annotations

import logging

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Document, DocumentChunk
from app.services import storage
from app.services.chunking import chunk_pages
from app.services.embeddings import get_embedder
from app.services.parsing import ParseError, extract_pages

log = logging.getLogger("ingestion")
MAX_ATTEMPTS = 3


def claim_next(db: Session) -> "str | None":
    """Atomically move one queued document to processing; return its id."""
    doc_id = db.scalar(
        select(Document.id)
        .where(Document.status == "queued", Document.attempts < MAX_ATTEMPTS)
        .order_by(Document.created_at)
        .limit(1)
    )
    if doc_id is None:
        return None
    res = db.execute(
        update(Document)
        .where(Document.id == doc_id, Document.status == "queued")
        .values(status="processing", attempts=Document.attempts + 1)
    )
    db.commit()
    return doc_id if res.rowcount == 1 else None


def requeue_stale(db: Session) -> int:
    """Re-index documents embedded with a different model than the current one."""
    current = get_embedder().name
    stale = select(DocumentChunk.document_id).where(DocumentChunk.embedding_model != current)
    res = db.execute(
        update(Document)
        .where(Document.status == "indexed", Document.id.in_(stale))
        .values(status="queued", attempts=0)
    )
    db.commit()
    return res.rowcount


def process_document(db: Session, doc_id: str) -> None:
    """Index one document: extract, chunk, embed, save. Sets indexed, failed or back to queued."""
    doc = db.get(Document, doc_id)
    if doc is None:
        return  # deleted while queued
    try:
        pages = extract_pages(doc.filename, storage.load(doc.object_key))
        pieces = chunk_pages(pages, settings.chunk_size, settings.chunk_overlap)
        embedder = get_embedder()
        vectors = embedder.embed([t for _, t in pieces])
        db.query(DocumentChunk).filter_by(document_id=doc.id).delete()  # idempotent retry
        for i, ((page, text), vec) in enumerate(zip(pieces, vectors)):
            db.add(
                DocumentChunk(
                    document_id=doc.id, owner_id=doc.owner_id, chunk_index=i,
                    text=text, page_number=page, embedding=vec, embedding_model=embedder.name,
                )
            )
        doc.status, doc.error_message = "indexed", None
    except ParseError as exc:
        db.rollback()
        doc.status, doc.error_message = "failed", str(exc)  # permanent
    except Exception:
        log.exception("ingestion failed for %s", doc_id)
        db.rollback()
        doc = db.get(Document, doc_id)
        if doc is None:
            return
        if doc.attempts >= MAX_ATTEMPTS:
            doc.status, doc.error_message = "failed", "Indexing failed. Please try again later."
        else:
            doc.status = "queued"  # bounded retry
    db.commit()
