import uuid

import pytest
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.worker import run_once

PW = "Password123!"


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def signup(client):
    email = f"{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/api/v1/auth/register", json={"email": email, "password": PW})
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def upload(client, h, name, text):
    r = client.post("/api/v1/documents", headers=h, files={"file": (name, text.encode(), "text/plain")})
    assert r.status_code == 202, r.text
    return r.json()


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_auth_flow(client):
    h = signup(client)
    assert client.get("/api/v1/auth/me", headers=h).status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 401
    email = client.get("/api/v1/auth/me", headers=h).json()["email"]
    assert client.post("/api/v1/auth/login", json={"email": email, "password": "wrongpass1"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": email, "password": PW}).status_code == 200
    assert client.post("/api/v1/auth/register", json={"email": email, "password": PW}).status_code == 409


def test_upload_validation(client):
    h = signup(client)
    r = client.post("/api/v1/documents", headers=h, files={"file": ("x.exe", b"abc", "application/octet-stream")})
    assert r.status_code == 422


def test_ingest_and_chat_with_citations(client):
    h = signup(client)
    doc = upload(client, h, "pets.txt",
                 "Cats are independent animals that sleep sixteen hours a day.\n"
                 "Photosynthesis converts sunlight into chemical energy in plant chloroplasts.")
    assert doc["status"] == "queued"
    assert run_once() is True
    assert client.get(f"/api/v1/documents/{doc['id']}", headers=h).json()["status"] == "indexed"

    r = client.post("/api/v1/chat", headers=h, json={"question": "How does photosynthesis work in plants?"})
    body = r.json()
    assert r.status_code == 200 and not body["insufficient_evidence"]
    assert body["citations"][0]["document"] == "pets.txt"

    r = client.post("/api/v1/chat", headers=h, json={"question": "quantum chromodynamics gluons"})
    assert r.json()["insufficient_evidence"] is True

    convo = client.get(f"/api/v1/conversations/{body['conversation_id']}", headers=h).json()
    assert [m["role"] for m in convo["messages"]] == ["user", "assistant"]


def test_user_isolation(client):
    a, b = signup(client), signup(client)
    doc = upload(client, a, "secret.txt", "The launch codes are swordfish and marmalade.")
    run_once()
    assert client.get(f"/api/v1/documents/{doc['id']}", headers=b).status_code == 404
    assert client.delete(f"/api/v1/documents/{doc['id']}", headers=b).status_code == 404
    r = client.post("/api/v1/chat", headers=b, json={"question": "launch codes swordfish"})
    assert r.json()["citations"] == []
    assert client.get("/api/v1/documents", headers=b).json() == []


def test_delete_removes_chunks_and_search(client):
    h = signup(client)
    doc = upload(client, h, "d.txt", "Zebras have distinctive black and white stripes.")
    run_once()
    assert client.delete(f"/api/v1/documents/{doc['id']}", headers=h).status_code == 204
    r = client.post("/api/v1/chat", headers=h, json={"question": "zebra stripes"})
    assert r.json()["insufficient_evidence"] is True
    with SessionLocal() as db:
        from app.models import DocumentChunk
        assert db.query(DocumentChunk).filter_by(document_id=doc["id"]).count() == 0


def test_unparseable_file_fails_safely(client):
    h = signup(client)
    r = client.post("/api/v1/documents", headers=h, files={"file": ("bad.pdf", b"not a pdf", "application/pdf")})
    doc = r.json()
    run_once()
    got = client.get(f"/api/v1/documents/{doc['id']}", headers=h).json()
    assert got["status"] == "failed" and got["error_message"]


def test_typo_tolerant_retrieval(client):
    h = signup(client)
    upload(client, h, "cv.txt", "Senior engineer with five years of professional experience in Python.")
    run_once()
    r = client.post("/api/v1/chat", headers=h, json={"question": "total experionce?"})
    assert r.json()["insufficient_evidence"] is False
    r = client.post("/api/v1/chat", headers=h, json={"question": "quantum chromodynamics gluons"})
    assert r.json()["insufficient_evidence"] is True
