# localStorage Persistence

## Context

After the page model refactor (FAU-45), users lose all canvas state on page refresh. This doc adds localStorage persistence so generated pages survive browser refreshes. tldraw has built-in persistence support — we just need to wire it up.

## Requirements

- Save tldraw canvas state (shapes, camera position) to localStorage on every change
- Restore canvas state on app load
- Debounced saves to avoid performance issues during rapid generation
- Clear state button (in settings or via "New Project")
- Handle schema migrations if shape props change between versions

## Implementation

### tldraw persistenceKey

tldraw has built-in localStorage persistence via the `persistenceKey` prop. When set, it automatically saves/restores all shapes, the camera, and page state.

File: `packages/web/src/App.tsx` — update the Tldraw component:

```typescript
<Tldraw
  shapeUtils={customShapeUtils}
  onMount={setEditor}
  hideUi
  persistenceKey="avv-canvas"
/>
```

That's it for basic persistence — tldraw handles serialization, debouncing, and restoration automatically when `persistenceKey` is set. All custom shape data (including `sectionsJson`) is serialized as part of the shape record.

### Session state persistence (chat + connection)

Canvas shapes are persisted by tldraw, but we also need to persist:
- Current session ID (so WebSocket can reconnect)
- Chat history (so conversation survives refresh)

File: `packages/web/src/hooks/useSessionPersistence.ts`

```typescript
const STORAGE_KEY = "avv-session";

interface PersistedSession {
  sessionId: string | null;
  chatHistory: Array<{
    id: string;
    type: "user" | "agent" | "thinking" | "option" | "system";
    content: string;
    title?: string;
    previewHtml?: string;
    timestamp: string;
  }>;
  mode: "simple" | "ultrathink";
  version: number;
}

const CURRENT_VERSION = 1;

export function saveSession(data: Omit<PersistedSession, "version">): void {
  try {
    const payload: PersistedSession = { ...data, version: CURRENT_VERSION };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("[Persistence] Failed to save session:", err);
  }
}

export function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PersistedSession;

    // Version check — discard if schema changed
    if (parsed.version !== CURRENT_VERSION) {
      console.log("[Persistence] Schema version mismatch, clearing");
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch (err) {
    console.warn("[Persistence] Failed to load session:", err);
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function clearAll(): void {
  // Clear both session and canvas state
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem("TLDRAW_DOCUMENT_v2_avv-canvas");
  // tldraw may use other keys — clear all tldraw-related keys
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith("TLDRAW_")) {
      localStorage.removeItem(key);
    }
  }
}
```

### Wire session persistence into RightPanel

File: `packages/web/src/components/layout/RightPanel.tsx` — add save/load:

```typescript
import { saveSession, loadSession, clearAll } from "../../hooks/useSessionPersistence";

// On mount, load persisted chat history:
useEffect(() => {
  const saved = loadSession();
  if (saved) {
    setChatHistory(saved.chatHistory.map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    })));
    setMode(saved.mode);
    if (saved.sessionId) {
      setHasStarted(true);
    }
  }
}, []);

// Save after every chat history change (debounced):
useEffect(() => {
  const timer = setTimeout(() => {
    saveSession({
      sessionId,
      chatHistory: chatHistory.map((m) => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      })),
      mode,
    });
  }, 500);
  return () => clearTimeout(timer);
}, [chatHistory, sessionId, mode]);

// Update the Clear button to clear everything:
<button
  onClick={() => {
    setChatHistory([]);
    setHasStarted(false);
    clearAll();
    // Optionally reload to reset tldraw canvas
    window.location.reload();
  }}
  className="text-[10px] font-[Public_Sans] font-bold text-stone-400 hover:text-red-500 transition-colors uppercase tracking-widest"
>
  New Project
</button>
```

### Add "New Project" to Settings in RightPanel

In the settings section at the bottom of RightPanel, add a clear-all option:

```typescript
<div className="p-2 border-t border-stone-100">
  <button
    onClick={() => {
      if (confirm("Start a new project? This will clear the canvas and chat.")) {
        clearAll();
        window.location.reload();
      }
    }}
    className="flex items-center gap-3 py-2 w-full text-stone-400 hover:bg-red-50 hover:text-red-500 rounded text-sm transition-colors"
  >
    <span className="material-symbols-outlined text-sm ml-3">delete_sweep</span>
    <span className="font-[Public_Sans] text-xs">New Project</span>
  </button>
  <a className="flex items-center gap-3 py-2 text-stone-400 hover:bg-amber-50 rounded font-[Noto_Serif] text-sm italic transition-colors" href="#">
    <span className="material-symbols-outlined text-sm ml-3">settings</span>
    <span>Settings</span>
  </a>
</div>
```

## Testing Strategy

```bash
# 1. Generate a page with several sections
# 2. Refresh the browser (Ctrl+R / Cmd+R)
# 3. Canvas should restore: page shape with all sections, same camera position
# 4. Chat history should restore: all previous messages visible
# 5. Click "New Project" → confirm → page reloads with empty canvas and chat

# Edge cases:
# 6. Open in incognito (no previous state) → app loads clean
# 7. Generate, close tab, reopen → state restored
# 8. Clear localStorage manually → app loads clean without errors
```

## Out of Scope

- Server-side persistence (database)
- Multi-project support (switching between saved projects)
- Cloud sync
- Undo/redo persistence across sessions
