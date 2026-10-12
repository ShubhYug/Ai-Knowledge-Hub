# AI Knowledge Hub

AI Knowledge Hub is a multi-user web app for asking questions about your own documents. Upload PDF, DOCX or TXT files, wait for them to be indexed, then ask in plain language and get an answer with citations to the source passages.

The full product and architecture spec is in `AI_Knowledge_Hub_Full_Project_Document.docx`. This README describes what is **actually built** today.

## Quick start (Docker)

1. Copy the env file: `cp .env.example .env` (and set `JWT_SECRET` to a long random string)
2. Run: `docker compose up --build`
3. Open http://localhost:5173 (use `http://`, not `https://`)
4. API docs: http://localhost:8000/docs

On first use, click **Need an account? Register**. Any email works, and the password must be at least 8 characters. Registering signs you in.

Stop with `docker compose down`. Add `-v` to also delete the database and uploaded files.

## How it works

```
Browser (React) -> FastAPI API -> Postgres (users, documents, chunks, chats)
                       |                ^
                       v                |
                 file storage      Worker (polls for queued documents)
```

1. **Upload:** the API validates the type (PDF/DOCX/TXT) and size (default 10 MB), stores the file under a random key, and records the document as `queued`.
2. **Index:** the worker claims the document (`processing`), extracts text with page numbers, splits it into overlapping chunks, embeds them and stores the vectors. The document becomes `indexed`, or `failed` with a safe message. Retries are bounded at 3.
3. **Ask:** the question is embedded and compared against the caller's own chunks only. The top matches above a similarity threshold become the sources. If none qualify, the app says there is not enough evidence rather than guessing.
4. **Answer:** with an OpenAI key, a model answers from the sources and fabricated citation IDs are dropped. Without a key, the best matching passage is returned with its citations.

## Services

| Service | Port | Role |
|---|---|---|
| frontend | 5173 | React + TypeScript + Vite UI |
| backend | 8000 | FastAPI REST API (`/api/v1`) |
| worker | - | Ingestion worker (`python -m app.worker`, same image as backend) |
| db | - | PostgreSQL 16 |

## Configuration

Set in `.env` (see [.env.example](.env.example)). Compose overrides `DATABASE_URL` and `STORAGE_DIR`.

| Variable | Default | Purpose |
|---|---|---|
| `JWT_SECRET` | dev value | Signs login tokens. **Change it.** |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed browser origins |
| `OPENAI_API_KEY` | empty | Enables OpenAI embeddings and answers |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible API, e.g. Gemini: `https://generativelanguage.googleapis.com/v1beta/openai` |
| `EMBEDDING_MODEL` / `LLM_MODEL` | `text-embedding-3-small` / `gpt-4o-mini` | Used only with a key (Gemini: `gemini-embedding-001` / `gemini-flash-lite-latest`) |
| `MAX_UPLOAD_BYTES` | 10485760 | Upload size limit |
| `CHUNK_SIZE` / `CHUNK_OVERLAP` | 800 / 100 | Chunking (characters) |
| `TOP_K` / `MIN_SCORE` | 4 / 0.15 | Retrieval count and similarity cut-off |
| `JWT_EXPIRE_MINUTES` | 60 | Token lifetime |

### Offline vs OpenAI mode

- **No key (default):** a local hashing embedder is used and nothing leaves your machine. Matching is keyword-like, tolerant of plurals and typos, but not truly semantic. Answers quote the best passage rather than composing a reply.
- **With `OPENAI_API_KEY`:** real embeddings and written answers. Your document text is sent to OpenAI, so review its data terms first.

Switching embedding model automatically re-indexes existing documents when the worker restarts.

## API summary

All routes are under `/api/v1` and need `Authorization: Bearer <token>` except register, login and health.

| Method and path | Purpose |
|---|---|
| `POST /auth/register`, `POST /auth/login` | Returns an access token |
| `GET /auth/me` | Current user |
| `POST /documents` | Upload a file (multipart `file`), returns 202 |
| `GET /documents` | List your documents (`limit`, `offset`) |
| `GET /documents/{id}` | Details and status |
| `DELETE /documents/{id}` | Delete the document, chunks and file |
| `POST /chat` | `{question, document_ids?, conversation_id?}` returns answer and citations |
| `GET /conversations`, `GET /conversations/{id}` | Chat history |
| `GET /health`, `GET /api/v1/health/live` | Liveness |

Interactive docs: http://localhost:8000/docs

## Security notes

- Passwords are hashed (PBKDF2-SHA256); sessions use signed JWTs.
- Every document, chunk and conversation is scoped to its owner on the server. Other users get a 404.
- Uploaded files are stored under random keys, never user filenames, and are never served directly.
- Retrieved text is treated as untrusted in the prompt, and citation IDs are checked against the retrieved sources.

## Local development (without Docker)

Backend (Python 3.12), using SQLite and local files by default:

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload          # API on :8000
python -m app.worker                   # in a second terminal
pytest tests -q
```

Frontend (Node 20):

```bash
cd frontend
npm install
npm run dev                            # UI on :5173
npm run build                          # type-check and production build
```

## Project structure

- `backend/app/api/routes/` - auth, documents and chat endpoints
- `backend/app/services/` - parsing, chunking, embeddings, ingestion, retrieval and answering, storage
- `backend/app/models.py` - database tables
- `backend/app/worker.py` - ingestion worker loop
- `backend/tests/` - API and pipeline tests
- `frontend/src/` - React UI
- `docker-compose.yml` - local stack
- `.github/workflows/ci-cd.yml` - CI (backend tests, frontend build)

## Tech stack

React + TypeScript + Vite, FastAPI, SQLAlchemy 2, PostgreSQL, PyJWT, pypdf, python-docx, Docker Compose, GitHub Actions.

## Current limitations and roadmap

Built: registration and login, upload, async indexing, document library, cited Q&A, conversation history, user isolation.

Not built yet (from the spec):
- Document summaries and a dedicated semantic search endpoint
- pgvector (embeddings are stored as JSON and compared in Python, fine for small libraries)
- Alembic migrations (tables are created on startup)
- Rate limiting, malware scanning, scanned-PDF OCR
- S3 storage with pre-signed uploads, and Terraform/AWS deployment
- Conversation history screen in the UI (the API exists)
- Evaluation dataset and operational dashboard
