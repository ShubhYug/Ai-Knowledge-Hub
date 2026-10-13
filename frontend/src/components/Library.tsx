import { DragEvent, useRef, useState } from "react";
import { api, Doc } from "../api";
import { CheckIcon, TrashIcon, UploadIcon } from "./Icons";

interface Props {
  docs: Doc[] | null; // null while the first load is running
  selected: Set<string>;
  onToggle: (id: string) => void;
  onChanged: () => void; // ask the parent to reload the list
  notify: (text: string, kind?: "ok" | "error") => void;
}

// Show a size in KB/MB.
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// PDF / DOCX / TXT label for the coloured file badge.
function kind(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "docx" ? "doc" : ext;
}

const STATUS_TEXT: Record<Doc["status"], string> = {
  queued: "Waiting",
  processing: "Indexing",
  indexed: "Ready",
  failed: "Failed",
};

// Upload area (click or drag and drop) plus the list of documents.
// Ticking documents limits chat questions to just those.
export default function Library({ docs, selected, onToggle, onChanged, notify }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // upload one or more files, reporting each result as a toast
  async function upload(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        await api.upload(file);
        notify(`${file.name} uploaded. Indexing…`);
        onChanged();
      } catch (err) {
        notify(`${file.name}: ${(err as Error).message}`, "error");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
  }

  async function remove(doc: Doc) {
    try {
      await api.remove(doc.id);
      notify(`${doc.filename} deleted.`);
      onChanged();
    } catch (err) {
      notify((err as Error).message, "error");
    }
    setConfirmId(null);
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Documents</h2>

      <div
        className={`dropzone ${dragging ? "drag" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        role="button" tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      >
        <UploadIcon />
        <strong>{uploading > 0 ? "Uploading…" : "Drop files here"}</strong>
        <span>or click to browse · PDF, DOCX, TXT</span>
        <input ref={inputRef} type="file" hidden multiple accept=".pdf,.docx,.txt"
          onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />
      </div>

      {docs === null && (
        <div aria-busy="true">
          <div className="skeleton" /><div className="skeleton" />
        </div>
      )}
      {docs?.length === 0 && <p className="empty">No documents yet. Upload one to get started.</p>}

      <ul className="doc-list">
        {docs?.map((d) => {
          const ready = d.status === "indexed";
          return (
            <li key={d.id} className={`doc ${selected.has(d.id) ? "picked" : ""}`}>
              <button className="doc-main" disabled={!ready} onClick={() => onToggle(d.id)}
                title={ready ? "Click to limit questions to this document" : STATUS_TEXT[d.status]}
                aria-pressed={selected.has(d.id)}>
                <span className={`file-badge ${kind(d.filename)}`}>{kind(d.filename)}</span>
                <span className="doc-info">
                  <span className="doc-name">{d.filename}</span>
                  <span className="doc-meta">
                    <span className={`status ${d.status}`}>
                      {d.status === "processing" && <i className="spinner" />}
                      {STATUS_TEXT[d.status]}
                    </span>
                    · {formatSize(d.size_bytes)}
                  </span>
                  {d.error_message && <span className="doc-error">{d.error_message}</span>}
                </span>
                {selected.has(d.id) && <span className="tick"><CheckIcon /></span>}
              </button>

              {confirmId === d.id ? (
                <span className="confirm">
                  <button className="btn danger small" onClick={() => remove(d)}>Delete</button>
                  <button className="btn ghost small" onClick={() => setConfirmId(null)}>Cancel</button>
                </span>
              ) : (
                <button className="icon-btn" aria-label={`Delete ${d.filename}`}
                  onClick={() => setConfirmId(d.id)}><TrashIcon /></button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
