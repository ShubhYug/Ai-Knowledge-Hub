import { useCallback, useEffect, useState } from "react";
import { api, ConversationSummary, Doc, hasToken, setToken } from "./api";
import Auth from "./components/Auth";
import Chat from "./components/Chat";
import History from "./components/History";
import { MoonIcon, SparkIcon, SunIcon } from "./components/Icons";
import Library from "./components/Library";
import { useTheme } from "./hooks/useTheme";
import { useToasts } from "./hooks/useToasts";

// Main screen after sign-in: sidebar (documents + chats) next to the chat panel.
function Workspace({ onSignOut }: { onSignOut: () => void }) {
  const [theme, toggleTheme] = useTheme();
  const { toasts, notify } = useToasts();
  const [email, setEmail] = useState("");
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [convoId, setConvoId] = useState<string>();

  // reload the document list from the backend
  const refreshDocs = useCallback(
    () => api.documents().then(setDocs).catch((e: Error) => notify(e.message, "error")),
    [notify],
  );
  const refreshHistory = useCallback(() => api.conversations().then(setHistory).catch(() => {}), []);

  useEffect(() => {
    api.me().then((u) => setEmail(u.email)).catch(() => {});
    refreshHistory();
    refreshDocs();
    // poll every 3s so queued -> processing -> indexed shows without a page reload
    const t = setInterval(refreshDocs, 3000);
    return () => clearInterval(t);
  }, [refreshDocs, refreshHistory]);

  // forget selections for documents that no longer exist or are not ready
  const readyIds = new Set((docs ?? []).filter((d) => d.status === "indexed").map((d) => d.id));
  const activeSelection = [...selected].filter((id) => readyIds.has(id));

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="logo"><SparkIcon /> AI Knowledge Hub</div>
        <div className="topbar-right">
          <span className="who">{email}</span>
          <button className="icon-btn" onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="btn ghost small" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <Library docs={docs} selected={new Set(activeSelection)} onToggle={toggle}
            onChanged={refreshDocs} notify={notify} />
          <History items={history} activeId={convoId} onPick={setConvoId}
            onNew={() => setConvoId(undefined)} />
        </aside>
        <Chat convoId={convoId} onConvoChange={setConvoId} selectedIds={activeSelection}
          readyCount={readyIds.size} onAsked={refreshHistory} />
      </main>

      <div className="toasts" role="status">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </div>
  );
}

// Root component: sign-in screen until a token exists, then the workspace.
export default function App() {
  useTheme(); // applies the saved theme to the sign-in screen as well
  const [authed, setAuthed] = useState(hasToken());
  if (!authed) return <Auth onDone={() => setAuthed(true)} />;
  return <Workspace onSignOut={() => { setToken(null); setAuthed(false); }} />;
}
