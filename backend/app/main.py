"""FastAPI application: wires routers, CORS and database setup."""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator, Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.api.routes.auth import router as auth_router
from app.api.routes.chat import router as chat_router
from app.api.routes.documents import router as documents_router
from app.core.config import settings
from app.db.session import init_db


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Create database tables when the API starts."""
    init_db()
    yield


app = FastAPI(title="AI Knowledge Hub API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(documents_router, prefix="/api/v1/documents", tags=["documents"])
app.include_router(chat_router, prefix="/api/v1", tags=["chat"])


@app.get("/health")
@app.get("/api/v1/health/live")
def health_check() -> Dict[str, str]:
    """Liveness probe: answers if the process is up. Does not check the database."""
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    """Send visitors of the bare URL to the interactive API docs."""
    return RedirectResponse("/docs")
