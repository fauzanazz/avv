const STORAGE_KEY = "avv-session";
const CURRENT_VERSION = 1;

export interface ChatEntry {
  id: string;
  type: "user" | "agent" | "thinking" | "option" | "system";
  content: string;
  title?: string;
  previewHtml?: string;
  timestamp: string;
}

interface PersistedSession {
  sessionId: string | null;
  chatHistory: ChatEntry[];
  mode: "simple" | "ultrathink";
  version: number;
}

export function saveSession(data: Omit<PersistedSession, "version">): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: CURRENT_VERSION }));
  } catch {}
}

export function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    if (parsed.version !== CURRENT_VERSION) { localStorage.removeItem(STORAGE_KEY); return null; }
    if (!Array.isArray(parsed.chatHistory)) return null;
    if (parsed.mode !== "simple" && parsed.mode !== "ultrathink") return null;
    const validHistory = parsed.chatHistory.filter(
      (entry: unknown): entry is ChatEntry =>
        typeof entry === "object" && entry !== null &&
        typeof (entry as ChatEntry).id === "string" &&
        typeof (entry as ChatEntry).content === "string" &&
        typeof (entry as ChatEntry).timestamp === "string" &&
        ["user", "agent", "thinking", "option", "system"].includes((entry as ChatEntry).type)
    );
    return { ...parsed, chatHistory: validHistory } as PersistedSession;
  } catch { return null; }
}

export function clearAll(): void {
  localStorage.removeItem(STORAGE_KEY);
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith("TLDRAW_")) localStorage.removeItem(key);
  }
}
