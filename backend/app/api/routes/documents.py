"""Document endpoints: upload, list, get and delete. All scoped to the signed-in user."""
from __future__ import annotations

import hashlib
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.deps import current_user
from app.models import Document, User
from app.schemas.document import DocumentOut
from app.services import storage
from app.services.parsing import ALLOWED_EXTENSIONS, extension

router = APIRouter()


def _owned(db: Session, user: User, doc_id: str) -> Document:
    """Load a document only if the user owns it. Others get 404, so existence is not leaked."""
    doc = db.get(Document, doc_id)
    if doc is None or doc.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")
    return doc


@router.get("", response_model=List[DocumentOut])
def list_documents(
    limit: int = 50, offset: int = 0,
    user: User = Depends(current_user), db: Session = Depends(get_db),
) -> List[Document]:
    """List the user's documents, newest first (page size capped at 100)."""
    q = (select(Document).where(Document.owner_id == user.id)
         .order_by(Document.created_at.desc()).limit(min(limit, 100)).offset(max(offset, 0)))
    return list(db.scalars(q))


@router.post("", response_model=DocumentOut, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    file: UploadFile = File(...),
    user: User = Depends(current_user), db: Session = Depends(get_db),
) -> Document:
    """Validate and store a file, then queue it for the worker. Returns 202 immediately."""
    filename = (file.filename or "upload")[:512]
    if extension(filename) not in ALLOWED_EXTENSIONS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "Only PDF, DOCX and TXT files are supported.")
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File is too large.")
    if not content:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "File is empty.")

    # random key, so user-supplied filenames never touch the disk
    key = uuid.uuid4().hex
    storage.save(key, content)
    doc = Document(
        owner_id=user.id, filename=filename, object_key=key,
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=len(content), checksum=hashlib.sha256(content).hexdigest(),
    )
    db.add(doc)
    db.commit()
    return doc


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(
    doc_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> Document:
    """Return one document, including its indexing status."""
    return _owned(db, user, doc_id)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    doc_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> Response:
    """Delete the document, its chunks and its stored file."""
    doc = _owned(db, user, doc_id)
    key = doc.object_key
    db.delete(doc)  # chunks cascade
    db.commit()
    storage.delete(key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
