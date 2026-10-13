import { FormEvent, useState } from "react";
import { api, setToken } from "../api";
import { SparkIcon } from "./Icons";

const FEATURES = [
  ["Upload", "PDF, Word and text files"],
  ["Ask", "Plain-language questions"],
  ["Trust", "Every answer cites its source"],
];

// Sign-in / registration screen. Calls onDone() once a token has been saved.
export default function Auth({ onDone }: { onDone: () => void }) {
  // which form is showing; also decides which endpoint submit() calls
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // read the values from inputs named "email" and "password"
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await api.auth(mode, String(f.get("email")), String(f.get("password")));
      // keep the JWT in localStorage, then switch to the main screen
      setToken(r.access_token);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <div className="logo"><SparkIcon /> AI Knowledge Hub</div>
        <h1>Ask your documents anything.</h1>
        <p>Upload files, then get answers with the exact passage that backs them up.</p>
        <ul>
          {FEATURES.map(([title, text]) => (
            <li key={title}><strong>{title}</strong><span>{text}</span></li>
          ))}
        </ul>
      </section>

      <form className="auth-card" onSubmit={submit}>
        <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
        <label>Email
          <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        </label>
        <label>Password
          <input name="password" type="password" required minLength={8} placeholder="At least 8 characters"
            autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </label>
        {error && <p role="alert" className="form-error">{error}</p>}
        <button type="submit" className="btn primary wide" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
        <button type="button" className="btn ghost wide"
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
          {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
