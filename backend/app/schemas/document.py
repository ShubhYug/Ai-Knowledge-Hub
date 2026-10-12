"""Request and response shapes for documents and chat."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    mime_type: str
    size_bytes: int
    status: str
    error_message: Optional[str] = None
    created_at: datetime


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    document_ids: Optional[List[str]] = None
    conversation_id: Optional[str] = None


class Citation(BaseModel):
    source_id: str
    document_id: str
    document: str
    page: Optional[int] = None
    excerpt: str
    score: float


class ChatResponse(BaseModel):
    answer: str
    citations: List[Citation]
    insufficient_evidence: bool
    conversation_id: str


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    role: str
    content: str
    citations: list
    created_at: datetime


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    created_at: datetime


class ConversationDetail(ConversationOut):
    messages: List[MessageOut]
