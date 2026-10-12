"""Background worker: polls the database for queued documents and indexes them."""
from __future__ import annotations

import logging
import time

from app.db.session import SessionLocal, init_db
from app.services.ingestion import claim_next, process_document, requeue_stale

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("worker")


def run_once() -> bool:
    """Process at most one queued document. Returns False when the queue is empty."""
    with SessionLocal() as db:
        doc_id = claim_next(db)
        if doc_id is None:
            return False
        process_document(db, doc_id)
        log.info("processed %s", doc_id)
        return True


def main() -> None:
    """Run forever, sleeping 2 seconds whenever there is nothing to do."""
    init_db()
    with SessionLocal() as db:
        log.info("requeued %d stale documents", requeue_stale(db))
    log.info("worker started")
    while True:
        if not run_once():
            time.sleep(2)


if __name__ == "__main__":
    main()
