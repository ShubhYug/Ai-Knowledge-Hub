import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { api, Citation } from "../api";
import { ChevronIcon, CheckIcon, CopyIcon, SendIcon, SparkIcon } from "./Icons";

interface Turn {
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
  declined?: boolean; // true when the app found no evidence
  error?: boolean;
}

interface Props {
  convoId?: string;
  onConvoChange: (id: string) => void; // a new chat got its id
  selectedIds: string[]; // documents the question is limited to (empty = all)
  readyCount: number; // number of indexed documents
  onAsked: () => void; // ask the parent to refresh the chat list
}

const SUGGESTIONS = [
  "What are the key points?",
  "Summarize this document",
  "List important names, dates or numbers",
];

// One citation: filename + page, a match bar, and the quote (collapsed until clicked).
function SourceCard({ c }: { c: Citation }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`source ${open ? "open" : ""}`}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="src-id">{c.source_id}</span>
        <span className="src-name">{c.document}{c.page ? ` · p.${c.page}` : ""}</span>
        <span className="match" title={`Match ${Math.round(c.score * 100)}%`}>
          <i style={{ width: `${Math.min(100, Math.round(c.score * 100))}%` }} />
        </span>
        <ChevronIcon />
      </button>
      {open && <blockquote>{c.excerpt}</blockquote>}
    </div>
  );
}

// Button that copies an answer and briefly shows a tick.
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="icon-btn" aria-label="Copy answer" onClick={() => {
      navigator.clipboard?.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }}>
      {done ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

// The conversation view: messages, thinking indicator and the question box.
export default function Chat({ convoId, onConvoChange, selectedIds, readyCount, onAsked }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // the conversation id this component already holds, so it does not reload its own chat
  const loadedRef = useRef<string | undefined>(undefined);

  // load a past conversation when one is picked from the list; clear on "New"
  useEffect(() => {
    if (convoId === loadedRef.current) return;
    loadedRef.current = convoId;
    if (!convoId) { setTurns([]); return; }
    api.conversation(convoId).then((c) =>
      setTurns(c.messages.map((m) => ({
        role: m.role, text: m.content, citations: m.citations,
        declined: m.role === "assistant" && m.citations.length === 0,
      }))),
    ).catch(() => setTurns([]));
  }, [convoId]);

  // keep the newest message in view
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setText("");
    setTurns((t) => [...t, { role: "user", text: q }]);
    try {
      const a = await api.chat(q, convoId, selectedIds.length ? selectedIds : undefined);
      if (a.conversation_id !== convoId) {
        loadedRef.current = a.conversation_id;
        onConvoChange(a.conversation_id);
      }
      setTurns((t) => [...t, {
        role: "assistant", text: a.answer, citations: a.citations, declined: a.insufficient_evidence,
      }]);
      onAsked();
    } catch (err) {
      setTurns((t) => [...t, { role: "assistant", text: (err as Error).message, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(text);
  }

  // Enter sends, Shift+Enter adds a new line
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(text);
    }
  }

  return (
    <section className="chat">
      <div className="messages" aria-live="polite">
        {turns.length === 0 && !busy && (
          <div className="hero-empty">
            <div className="orb"><SparkIcon /></div>
            <h2>{readyCount ? "What would you like to know?" : "Upload a document to begin"}</h2>
            <p>{readyCount
              ? "Answers come straight from your files, with the source shown."
              : "Drop a PDF, Word or text file on the left. It is ready to question in seconds."}</p>
            {readyCount > 0 && (
              <div className="chips">
                {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>)}
              </div>
            )}
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={`msg ${t.role} ${t.error ? "error" : ""}`}>
            <div className="bubble">
              <p className={t.declined ? "declined" : ""}>{t.text}</p>
              {t.role === "assistant" && !t.error && (
                <>
                  {t.citations && t.citations.length > 0 && (
                    <div className="sources">
                      <span className="sources-label">Sources</span>
                      {t.citations.map((c) => <SourceCard key={c.source_id} c={c} />)}
                    </div>
                  )}
                  <div className="bubble-tools"><CopyButton text={t.text} /></div>
                </>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="msg assistant">
            <div className="bubble typing" aria-label="Thinking"><i /><i /><i /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={onSubmit}>
        {selectedIds.length > 0 && (
          <div className="scope">Searching in {selectedIds.length} selected document{selectedIds.length > 1 ? "s" : ""}</div>
        )}
        <div className="composer-row">
          <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
            placeholder={readyCount ? "Ask a question about your documents…" : "Upload a document first…"}
            rows={1} maxLength={2000} aria-label="Question" />
          <button type="submit" className="btn primary send" disabled={busy || !text.trim()} aria-label="Send">
            <SendIcon />
          </button>
        </div>
        <small>Enter to send · Shift+Enter for a new line</small>
      </form>
    </section>
  );
}
