"""Chat endpoints: ask a question, list and read conversations."""
from __future__ import annotations

from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import current_user
from app.models import Conversation, Message, User
from app.schemas.document import (ChatRequest, ChatResponse, Citation,
                                  ConversationDetail, ConversationOut)
from app.services import rag

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
def chat(
    payload: ChatRequest, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> ChatResponse:
    """Answer a question from the user's own indexed documents and save the exchange."""
    if payload.conversation_id:
        convo = db.get(Conversation, payload.conversation_id)
        if convo is None or convo.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found.")
    else:
        convo = Conversation(user_id=user.id, title=payload.question[:80])
        db.add(convo)
        db.flush()

    try:
        sources = rag.retrieve(db, user.id, payload.question, payload.document_ids)
    except httpx.HTTPError:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            "The AI provider rejected the request. Check your API key and model settings.")
    result = rag.answer_question(payload.question, sources)
    citations = [
        Citation(source_id=s.id, document_id=s.document_id, document=s.document,
                 page=s.page, excerpt=s.text[:300], score=s.score)
        for s in result["citations"]
    ]
    db.add(Message(conversation_id=convo.id, role="user", content=payload.question))
    db.add(Message(conversation_id=convo.id, role="assistant", content=result["answer"],
                   citations=[c.model_dump() for c in citations]))
    db.commit()
    return ChatResponse(answer=result["answer"], citations=citations,
                        insufficient_evidence=result["insufficient_evidence"],
                        conversation_id=convo.id)


@router.get("/conversations", response_model=List[ConversationOut])
def list_conversations(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> List[Conversation]:
    """List the user's conversations, newest first."""
    q = select(Conversation).where(Conversation.user_id == user.id).order_by(
        Conversation.created_at.desc()).limit(100)
    return list(db.scalars(q))


@router.get("/conversations/{conv_id}", response_model=ConversationDetail)
def get_conversation(
    conv_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> Conversation:
    """Return a conversation with all its messages and citations."""
    convo = db.get(Conversation, conv_id)
    if convo is None or convo.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found.")
    return convo
