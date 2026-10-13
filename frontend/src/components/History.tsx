import { ConversationSummary } from "../api";
import { ChatIcon, PlusIcon } from "./Icons";

interface Props {
  items: ConversationSummary[];
  activeId?: string;
  onPick: (id: string) => void;
  onNew: () => void;
}

// List of past chats with a "New chat" button.
export default function History({ items, activeId, onPick, onNew }: Props) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Chats</h2>
        <button className="btn ghost small" onClick={onNew}><PlusIcon /> New</button>
      </div>
      {items.length === 0 && <p className="empty">Your conversations will show up here.</p>}
      <ul className="history">
        {items.map((c) => (
          <li key={c.id}>
            <button className={c.id === activeId ? "active" : ""} onClick={() => onPick(c.id)}>
              <ChatIcon /><span>{c.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
