/**
 * API client: the only file in the frontend that talks to the backend.
 * Components call `api.*` and never use `fetch` directly.
 */

// Backend origin. Override with VITE_API_URL at build time.
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// An uploaded document as returned by `GET /documents`.
export interface Doc {
  id: string;
  filename: string;
  // queued -> processing -> indexed, or failed (see error_message).
  status: "queued" | "processing" | "indexed" | "failed";
  // Safe, user-visible reason when status is "failed".
  error_message: string | null;
  size_bytes: number;
}

// A source passage that supports an answer.
export interface Citation {
  // Label used in the prompt, e.g. "S1".
  source_id: string;
  // Filename of the source document.
  document: string;
  // Page number when the format provides one (PDF), otherwise null.
  page: number | null;
  // The retrieved text, truncated for display.
  excerpt: string;
}

// Response of `POST /chat`.
export interface ChatResult {
  answer: string;
  citations: Citation[];
  // True when nothing relevant was found and the app declined to answer.
  insufficient_evidence: boolean;
  // Pass back on the next question to continue the same conversation.
  conversation_id: string;
}

// JWT for the signed-in user. Persisted in localStorage so a refresh keeps the session.
let token: string | null = localStorage.getItem("token");

// Store the token after login/register, or pass null to sign out.
export const setToken = (t: string | null) => {
  token = t;
  if (t) localStorage.setItem("token", t);
  else localStorage.removeItem("token");
};

// True if a token is stored (the user is assumed signed in until the server says otherwise).
export const hasToken = () => token !== null;

/**
 * Send a request to `/api/v1{path}` and return the parsed JSON body.
 *
 * - Attaches `Authorization: Bearer <token>` when signed in.
 * - On 401 with a stored token (expired or invalid), clears it and reloads to the sign-in screen.
 * - On any other error status, throws an Error whose message is the backend's `detail`
 *   text, so components can show it directly.
 * - Returns undefined for 204 No Content (e.g. delete).
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${BASE}/api/v1${path}`, { ...init, headers });
  if (res.status === 401 && token) {
    setToken(null);
    location.reload();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = typeof body.detail === "string" ? body.detail : "Request failed.";
    throw new Error(detail);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

// Build POST request options with a JSON body.
const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// One method per backend endpoint.
export const api = {
  // `POST /auth/login` or `/auth/register`. Returns the JWT to pass to `setToken`.
  auth: (mode: "login" | "register", email: string, password: string) =>
    request<{ access_token: string }>(`/auth/${mode}`, json({ email, password })),

  // `GET /documents`: the signed-in user's documents, newest first.
  documents: () => request<Doc[]>("/documents"),

  /**
   * `POST /documents`: upload a PDF, DOCX or TXT as multipart form data.
   * Resolves right away with status "queued"; the worker indexes it in the background.
   */
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    // No Content-Type header: the browser sets the multipart boundary itself.
    return request<Doc>("/documents", { method: "POST", body: form });
  },

  // `DELETE /documents/{id}`: removes the document, its indexed chunks and the stored file.
  remove: (id: string) => request<void>(`/documents/${id}`, { method: "DELETE" }),

  // `POST /chat`: ask a question about your documents; omit conversation_id to start a new chat.
  chat: (question: string, conversation_id?: string) =>
    request<ChatResult>("/chat", json({ question, conversation_id })),
};
