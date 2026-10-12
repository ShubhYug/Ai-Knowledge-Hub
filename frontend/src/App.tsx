import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, ChatResult, Doc, hasToken, setToken } from "./api";

// Sign-in / registration screen. Calls onDone() once a token has been saved.
function Auth({ onDone }: { onDone: () => void }) {
  // which form is showing; also decides which endpoint submit() calls
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // read the values from inputs named "email" and "password"
    const f = new FormData(e.currentTarget);
    try {
      const r = await api.auth(mode, String(f.get("email")), String(f.get("password")));
      // keep the JWT in localStorage, then switch to the main screen
      setToken(r.access_token);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="card auth" onSubmit={submit}>
      <h1>AI Knowledge Hub</h1>
      <label>Email<input name="email" type="email" required autoComplete="email" /></label>
      <label>Password<input name="password" type="password" required minLength={8}
        autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
      {error && <p role="alert" className="error">{error}</p>}
      <button type="submit">{mode === "login" ? "Sign in" : "Create account"}</button>
      <button type="button" className="link"
        onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
        {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
      </button>
    </form>
  );
}

// Document list with upload and delete. Polls so status badges update by themselves.
function Library() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState("");

  // reload the document list from the backend
  const refresh = useCallback(() => api.documents().then(setDocs).catch((e) => setError(e.message)), []);
  useEffect(() => {
    refresh();
    // poll every 3s so queued -> processing -> indexed shows without a page reload
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  // runs when a file is chosen: upload it, then refresh the list
  async function onFile(e: FormEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setError("");
    try {
      await api.upload(file);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
    // clear the picker so the same file can be chosen again
    input.value = "";
  }

  return (
    <section className="card">
      <h2>Documents</h2>
      <label className="upload">Upload PDF, DOCX or TXT
        <input type="file" accept=".pdf,.docx,.txt" onChange={onFile} /></label>
      {error && <p role="alert" className="error">{error}</p>}
      {docs.length === 0 && <p className="muted">No documents yet.</p>}
      <ul>
        {docs.map((d) => (
          <li key={d.id}>
            <span>{d.filename}</span>
            <span className={`badge ${d.status}`} title={d.error_message ?? ""}>{d.status}</span>
            <button className="link" onClick={() => api.remove(d.id).then(refresh)}
              aria-label={`Delete ${d.filename}`}>Delete</button>
            {d.error_message && <small className="error">{d.error_message}</small>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Question box and answers, shown with their citation quotes.
function Chat() {
  const [question, setQuestion] = useState("");
  // id of the current conversation, sent back so follow-ups join the same chat
  const [convo, setConvo] = useState<string>();
  const [turns, setTurns] = useState<{ q: string; a?: ChatResult; err?: string }[]>([]);
  const [busy, setBusy] = useState(false);

  // send the question, then add the answer (or the error) to the list
  async function ask(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setQuestion("");
    try {
      const a = await api.chat(q, convo);
      setConvo(a.conversation_id);
      setTurns((t) => [...t, { q, a }]);
    } catch (err) {
      setTurns((t) => [...t, { q, err: (err as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Ask your documents</h2>
      {turns.map((t, i) => (
        <div key={i} className="turn">
          <p className="q">{t.q}</p>
          {t.err && <p role="alert" className="error">{t.err}</p>}
          {t.a && (
            <>
              <p className={t.a.insufficient_evidence ? "muted" : ""}>{t.a.answer}</p>
              {t.a.citations.map((c) => (
                <blockquote key={c.source_id}>
                  <strong>{c.document}{c.page ? `, p.${c.page}` : ""}</strong>
                  <br />{c.excerpt}
                </blockquote>
              ))}
            </>
          )}
        </div>
      ))}
      <form onSubmit={ask} className="ask">
        <input value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question…" maxLength={2000} aria-label="Question" />
        <button type="submit" disabled={busy}>{busy ? "Thinking…" : "Ask"}</button>
      </form>
    </section>
  );
}

// Root component: sign-in screen until a token exists, then library + chat.
export default function App() {
  const [authed, setAuthed] = useState(hasToken());
  if (!authed) return <Auth onDone={() => setAuthed(true)} />;
  return (
    <main>
      <header>
        <h1>AI Knowledge Hub</h1>
        <button className="link" onClick={() => { setToken(null); setAuthed(false); }}>Sign out</button>
      </header>
      <Library />
      <Chat />
    </main>
  );
}
