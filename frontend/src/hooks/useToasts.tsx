import { useCallback, useState } from "react";

export interface Toast {
  id: number;
  kind: "ok" | "error";
  text: string;
}

// Short messages that appear in a corner and disappear on their own.
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return { toasts, notify };
}
