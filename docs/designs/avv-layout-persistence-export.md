# Layout V2 + Persistence + Export

## Context

This combined doc covers three features that share the same files (`App.tsx`, `TopBar.tsx`, layout components). It supersedes FAU-48, FAU-62, and FAU-64.

1. **Layout V2** — Alexandria-inspired 3-panel layout: top toolbar, left layers sidebar, dark canvas, right AI chat
2. **Persistence** — localStorage save/load for canvas state and chat history
3. **Export** — Download HTML, PNG, SVG (Figma-ready), copy HTML to clipboard

## Requirements

- Fixed top bar (h-14): logo, connection status, export menu, panel toggles
- Fixed left sidebar (w-60): layers tree showing page > sections with status icons
- Center canvas: dark bg (stone-900) with dot grid, tldraw with `hideUi`, zoom controls
- Fixed right panel (w-80): AI chat with message types (user, agent, thinking, option, system), textarea input, mode toggle, clear/new project
- Both sidebars collapsible
- tldraw `persistenceKey` for automatic canvas state persistence
- Session persistence (chat history, mode) via custom localStorage hook
- Export dropdown in TopBar: HTML download, PNG screenshot, copy HTML, SVG for Figma
- Toast notifications on export actions
- Material Symbols icons, Inter + Noto Serif + Public Sans font stack

## Implementation

### Fonts and icons in index.html

File: `packages/web/index.html` (replace entirely)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AVV — AI Visual Vibe Engineer</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,700;1,400;1,900&family=Inter:wght@400;500;600&family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### Global styles

File: `packages/web/src/app.css` (replace entirely)

```css
@import "tailwindcss";

@theme {
  --font-family-serif: "Noto Serif", serif;
  --font-family-sans: "Inter", sans-serif;
  --font-family-label: "Public Sans", sans-serif;
  --color-canvas-bg: #1c1917;
  --color-canvas-grid: #44403c;
}

html, body, #root {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: "Inter", sans-serif;
}

.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  vertical-align: middle;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

### Session persistence utility

File: `packages/web/src/utils/session-persistence.ts`

```typescript
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
    const parsed = JSON.parse(raw) as PersistedSession;
    if (parsed.version !== CURRENT_VERSION) { localStorage.removeItem(STORAGE_KEY); return null; }
    return parsed;
  } catch { return null; }
}

export function clearAll(): void {
  localStorage.removeItem(STORAGE_KEY);
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith("TLDRAW_")) localStorage.removeItem(key);
  }
}
```

### Export utility

File: `packages/web/src/utils/export.ts`

```typescript
import type { Editor } from "tldraw";
import { AVV_PAGE_TYPE, parseSections, type AVVPageProps } from "../canvas/shapes";

function getPageData(editor: Editor) {
  const shapes = editor.getCurrentPageShapes();
  const pageShape = editor.getSelectedShapes().find((s) => s.type === AVV_PAGE_TYPE)
    ?? shapes.find((s) => s.type === AVV_PAGE_TYPE);
  if (!pageShape) return null;

  const props = pageShape.props as AVVPageProps;
  const sections = parseSections(props.sectionsJson)
    .filter((s) => s.status === "ready" && s.html)
    .sort((a, b) => a.order - b.order);

  const html = sections.map((s) => `<!-- ${s.name} -->\n<section>${s.html}</section>`).join("\n\n");
  const css = sections.filter((s) => s.css).map((s) => s.css).join("\n");

  return { id: pageShape.id, title: props.title, html, css };
}

function slugify(t: string) { return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "avv-export"; }

export function exportAsHtml(editor: Editor): void {
  const page = getPageData(editor);
  if (!page) { alert("No page to export."); return; }

  const blob = new Blob([`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${page.title}</title><script src="https://cdn.tailwindcss.com"></script>
<style>*,*::before,*::after{box-sizing:border-box}body{margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif}${page.css}</style>
</head><body>${page.html}</body></html>`], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slugify(page.title)}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function exportAsPng(editor: Editor): Promise<void> {
  const page = getPageData(editor);
  if (!page) { alert("No page to export."); return; }
  try {
    const blob = await editor.toImage([page.id], { format: "png", background: true, padding: 0, scale: 2 });
    if (!blob) { alert("PNG export failed."); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slugify(page.title)}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch { alert("PNG export failed."); }
}

export async function copyHtmlToClipboard(editor: Editor): Promise<boolean> {
  const page = getPageData(editor);
  if (!page) return false;
  try { await navigator.clipboard.writeText(page.html); return true; } catch { return false; }
}

export async function exportAsSvg(editor: Editor): Promise<boolean> {
  const page = getPageData(editor);
  if (!page) return false;
  try {
    const blob = await editor.toImage([page.id], { format: "svg", background: true, padding: 0 });
    if (!blob) return false;
    await navigator.clipboard.writeText(await blob.text());
    return true;
  } catch { return false; }
}
```

### App.tsx — full rewrite with persistence + layout

File: `packages/web/src/App.tsx` (replace entirely)

```typescript
import { useState, useCallback, useEffect } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import type { ServerMessage, ClientMessage } from "@avv/shared";
import { AVVPageShapeUtil } from "./canvas/shapes";
import { useAVVWebSocket } from "./hooks/useAVVWebSocket";
import { useCanvasSync } from "./hooks/useCanvasSync";
import { useAgentLogs } from "./hooks/useAgentLogs";
import { TopBar } from "./components/layout/TopBar";
import { LeftSidebar } from "./components/layout/LeftSidebar";
import { RightPanel } from "./components/layout/RightPanel";

const customShapeUtils = [AVVPageShapeUtil];

export function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [serverMessages, setServerMessages] = useState<ServerMessage[]>([]);

  const { handleMessage: handleCanvasMessage } = useCanvasSync(editor);
  const { logs, handleMessage: handleLogMessage } = useAgentLogs();

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      handleCanvasMessage(msg);
      handleLogMessage(msg);
      setServerMessages((prev) => [...prev, msg]);
    },
    [handleCanvasMessage, handleLogMessage]
  );

  const { send, isConnected, sessionId } = useAVVWebSocket({ onMessage });

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-stone-900">
      <TopBar
        editor={editor}
        isConnected={isConnected}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => setLeftOpen(!leftOpen)}
        onToggleRight={() => setRightOpen(!rightOpen)}
      />

      <div className="flex flex-1 min-h-0">
        {leftOpen && (
          <LeftSidebar
            editor={editor}
            onClose={() => setLeftOpen(false)}
            onRetry={(pageId, sectionId) => send({ type: "retry", pageId, sectionId })}
          />
        )}

        <main
          className="flex-1 relative overflow-hidden"
          style={{
            background: "#1c1917",
            backgroundImage: "radial-gradient(circle, #44403c 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        >
          <div className="absolute inset-0">
            <Tldraw
              shapeUtils={customShapeUtils}
              onMount={setEditor}
              hideUi
              persistenceKey="avv-canvas"
            />
          </div>

          {/* Zoom controls */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-stone-800/90 backdrop-blur text-white px-4 py-2 rounded-full flex items-center gap-4 text-xs font-[Public_Sans] z-20">
            <button onClick={() => editor?.zoomOut()} className="hover:text-blue-400"><span className="material-symbols-outlined text-sm">remove</span></button>
            <span>{Math.round((editor?.getZoomLevel() ?? 1) * 100)}%</span>
            <button onClick={() => editor?.zoomIn()} className="hover:text-blue-400"><span className="material-symbols-outlined text-sm">add</span></button>
            <div className="w-px h-4 bg-stone-600" />
            <button onClick={() => editor?.zoomToFit({ animation: { duration: 300 } })} className="hover:text-blue-400"><span className="material-symbols-outlined text-sm">fit_screen</span></button>
          </div>

          {!leftOpen && (
            <button onClick={() => setLeftOpen(true)} className="absolute top-3 left-3 z-20 p-2 bg-stone-800/80 backdrop-blur text-stone-400 rounded-lg hover:text-white">
              <span className="material-symbols-outlined text-sm">menu</span>
            </button>
          )}
          {!rightOpen && (
            <button onClick={() => setRightOpen(true)} className="absolute top-3 right-3 z-20 p-2 bg-stone-800/80 backdrop-blur text-stone-400 rounded-lg hover:text-white">
              <span className="material-symbols-outlined text-sm">auto_awesome</span>
            </button>
          )}
        </main>

        {rightOpen && (
          <RightPanel
            messages={serverMessages}
            isConnected={isConnected}
            sessionId={sessionId}
            onSend={send}
            onClose={() => setRightOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
```

### TopBar with export menu

File: `packages/web/src/components/layout/TopBar.tsx`

```typescript
import { useState, useRef, useEffect } from "react";
import type { Editor } from "tldraw";
import { exportAsHtml, exportAsPng, exportAsSvg, copyHtmlToClipboard } from "../../utils/export";

interface TopBarProps {
  editor: Editor | null;
  isConnected: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
}

export function TopBar({ editor, isConnected, leftOpen, rightOpen, onToggleLeft, onToggleRight }: TopBarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

  return (
    <header className="h-14 bg-white/80 backdrop-blur-xl flex justify-between items-center px-6 z-50 shrink-0">
      <div className="flex items-center gap-6">
        <span className="text-xl font-black text-stone-900 font-[Noto_Serif] italic">AVV</span>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-[10px] font-[Public_Sans] text-stone-400 uppercase tracking-widest">
            {isConnected ? "Connected" : "Offline"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Export dropdown */}
        <div ref={exportRef} className="relative">
          <button onClick={() => setExportOpen(!exportOpen)} className="p-2 rounded text-stone-400 hover:text-stone-700 transition-colors" title="Export">
            <span className="material-symbols-outlined text-lg">download</span>
          </button>
          {exportOpen && editor && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-xl border border-stone-200 py-1 z-50">
              <button onClick={() => { exportAsHtml(editor); setExportOpen(false); showToast("HTML downloaded"); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50">
                <span className="material-symbols-outlined text-sm text-stone-400">code</span>
                <div><p className="text-xs font-semibold text-stone-700">Download HTML</p><p className="text-[10px] text-stone-400">Standalone .html file</p></div>
              </button>
              <button onClick={async () => { await exportAsPng(editor); setExportOpen(false); showToast("PNG downloaded"); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50">
                <span className="material-symbols-outlined text-sm text-stone-400">image</span>
                <div><p className="text-xs font-semibold text-stone-700">Download PNG</p><p className="text-[10px] text-stone-400">2x screenshot</p></div>
              </button>
              <div className="border-t border-stone-100 my-1" />
              <button onClick={async () => { const ok = await copyHtmlToClipboard(editor); setExportOpen(false); showToast(ok ? "HTML copied" : "Copy failed"); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50">
                <span className="material-symbols-outlined text-sm text-stone-400">content_copy</span>
                <div><p className="text-xs font-semibold text-stone-700">Copy HTML</p><p className="text-[10px] text-stone-400">Raw HTML to clipboard</p></div>
              </button>
              <button onClick={async () => { const ok = await exportAsSvg(editor); setExportOpen(false); showToast(ok ? "SVG copied — paste in Figma" : "SVG failed"); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50">
                <span className="material-symbols-outlined text-sm text-stone-400">design_services</span>
                <div><p className="text-xs font-semibold text-stone-700">Copy SVG for Figma</p><p className="text-[10px] text-stone-400">Paste directly into Figma</p></div>
              </button>
            </div>
          )}
        </div>

        <button onClick={onToggleLeft} className={`p-2 rounded transition-colors ${leftOpen ? "text-blue-700" : "text-stone-400 hover:text-stone-700"}`}>
          <span className="material-symbols-outlined text-lg">layers</span>
        </button>
        <button onClick={onToggleRight} className={`p-2 rounded transition-colors ${rightOpen ? "text-blue-700" : "text-stone-400 hover:text-stone-700"}`}>
          <span className="material-symbols-outlined text-lg">auto_awesome</span>
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-800 text-white px-4 py-2 rounded-lg text-xs font-[Public_Sans] z-[100] shadow-lg">
          {toast}
        </div>
      )}
    </header>
  );
}
```

### LeftSidebar with retry buttons

File: `packages/web/src/components/layout/LeftSidebar.tsx`

```typescript
import { useEffect, useState } from "react";
import type { Editor, TLShapeId } from "tldraw";
import { AVV_PAGE_TYPE, parseSections, type AVVPageProps } from "../../canvas/shapes";
import type { PageSection } from "@avv/shared";

interface LeftSidebarProps {
  editor: Editor | null;
  onClose: () => void;
  onRetry: (pageId: string, sectionId: string) => void;
}

interface PageLayer { shapeId: TLShapeId; title: string; status: string; sections: PageSection[]; }

export function LeftSidebar({ editor, onClose, onRetry }: LeftSidebarProps) {
  const [pages, setPages] = useState<PageLayer[]>([]);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const pageShapes = editor.getCurrentPageShapes()
        .filter((s) => s.type === AVV_PAGE_TYPE)
        .map((s) => ({
          shapeId: s.id,
          title: (s.props as AVVPageProps).title,
          status: (s.props as AVVPageProps).status,
          sections: parseSections((s.props as AVVPageProps).sectionsJson),
        }));
      setPages(pageShapes);
    };
    const unsub = editor.store.listen(update, { scope: "document" });
    update();
    return () => unsub();
  }, [editor]);

  const statusIcon = (s: string) => s === "ready" ? "check_circle" : s === "generating" ? "pending" : s === "error" ? "error" : "radio_button_unchecked";
  const statusColor = (s: string) => s === "ready" ? "text-green-600" : s === "generating" ? "text-blue-500 animate-pulse" : s === "error" ? "text-red-500" : "text-stone-300";

  return (
    <aside className="w-60 bg-stone-50 flex flex-col border-r border-stone-100 shrink-0 z-40">
      <div className="p-4 border-b border-stone-100">
        <h2 className="text-stone-900 font-[Noto_Serif] text-sm font-bold">Project</h2>
        <p className="text-[10px] text-stone-400 font-[Public_Sans] uppercase tracking-widest mt-1">Layers</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        <div className="px-4">
          <span className="text-[10px] font-[Public_Sans] font-bold text-stone-400 uppercase tracking-widest">Canvas Layers</span>
          {pages.length === 0 ? (
            <p className="mt-4 text-[11px] text-stone-300 italic font-[Noto_Serif]">No pages yet.</p>
          ) : pages.map((page) => (
            <div key={page.shapeId} className="mt-4 space-y-1">
              <button onClick={() => { editor?.select(page.shapeId); editor?.zoomToSelection({ animation: { duration: 300 } }); }}
                className="flex items-center gap-2 p-1.5 w-full rounded hover:bg-stone-100 cursor-pointer text-left">
                <span className={`material-symbols-outlined text-xs ${statusColor(page.status)}`}>{statusIcon(page.status)}</span>
                <span className="text-[11px] font-semibold text-stone-700 truncate">{page.title}</span>
              </button>
              {page.sections.sort((a, b) => a.order - b.order).map((section) => (
                <div key={section.id} className={`flex items-center gap-2 p-1.5 rounded hover:bg-stone-100 cursor-pointer pl-6 border-l transition-colors ${selectedSection === section.id ? "border-blue-500 bg-blue-50" : "border-stone-200"}`}>
                  <button onClick={() => setSelectedSection(section.id)} className="flex items-center gap-2 flex-1 text-left">
                    <span className={`material-symbols-outlined text-xs ${statusColor(section.status)}`}>{statusIcon(section.status)}</span>
                    <span className="text-[11px] text-stone-500 truncate">{section.name}</span>
                  </button>
                  {section.status === "error" && (
                    <button onClick={() => onRetry(page.shapeId, section.id)} className="text-red-400 hover:text-red-600" title="Retry">
                      <span className="material-symbols-outlined text-xs">refresh</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </nav>

      <div className="p-4 border-t border-stone-100">
        <button onClick={onClose} className="w-full text-stone-400 hover:text-stone-600 text-[10px] font-[Public_Sans] uppercase tracking-widest">Collapse</button>
      </div>
    </aside>
  );
}
```

### RightPanel with chat + persistence + new project

File: `packages/web/src/components/layout/RightPanel.tsx`

```typescript
import { useState, useRef, useEffect, useCallback } from "react";
import type { ServerMessage, ClientMessage } from "@avv/shared";
import { saveSession, loadSession, clearAll, type ChatEntry } from "../../utils/session-persistence";

interface RightPanelProps {
  messages: ServerMessage[];
  isConnected: boolean;
  sessionId: string | null;
  onSend: (msg: ClientMessage) => void;
  onClose: () => void;
}

export function RightPanel({ messages, isConnected, sessionId, onSend, onClose }: RightPanelProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"simple" | "ultrathink">("simple");
  const [chatHistory, setChatHistory] = useState<Array<ChatEntry & { timestamp: Date }>>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load persisted session on mount
  useEffect(() => {
    const saved = loadSession();
    if (saved && saved.chatHistory.length > 0) {
      setChatHistory(saved.chatHistory.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
      setMode(saved.mode);
      if (saved.sessionId) setHasStarted(true);
    }
  }, []);

  // Save session on change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveSession({
        sessionId,
        chatHistory: chatHistory.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() })),
        mode,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [chatHistory, sessionId, mode]);

  // Convert new server messages to chat entries
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    let entry: (ChatEntry & { timestamp: Date }) | null = null;
    const ts = new Date();
    const id = crypto.randomUUID();

    if (last.type === "agent:thinking") entry = { id, type: "thinking", content: (last as any).thought, timestamp: ts };
    else if (last.type === "agent:option") entry = { id, type: "option", content: (last as any).description, title: (last as any).title, previewHtml: (last as any).previewHtml, timestamp: ts };
    else if (last.type === "agent:log") entry = { id, type: "agent", content: (last as any).message, timestamp: ts };
    else if (last.type === "generation:done") entry = { id, type: "system", content: "Generation complete.", timestamp: ts };
    else if (last.type === "error") entry = { id, type: "system", content: `Error: ${(last as any).message}`, timestamp: ts };

    if (entry) setChatHistory((prev) => [...prev, entry!]);
  }, [messages]);

  useEffect(() => { scrollRef.current && (scrollRef.current.scrollTop = scrollRef.current.scrollHeight); }, [chatHistory]);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || !isConnected) return;
    const text = input.trim();
    setChatHistory((prev) => [...prev, { id: crypto.randomUUID(), type: "user", content: text, timestamp: new Date() }]);
    setInput("");
    if (!hasStarted) { onSend({ type: "generate", prompt: text, mode }); setHasStarted(true); }
    else { onSend({ type: "chat", message: text } as any); }
  }, [input, isConnected, hasStarted, mode, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } };

  return (
    <aside className="w-80 bg-white flex flex-col border-l border-stone-100 shrink-0 z-40 shadow-2xl shadow-stone-900/5">
      <div className="p-4 border-b border-stone-100 flex justify-between items-center">
        <div>
          <h2 className="text-stone-900 font-[Noto_Serif] font-bold italic text-sm">AVV Agent</h2>
          <p className="text-[10px] text-stone-400 font-[Public_Sans] tracking-tighter">{isConnected ? "Design Intelligence" : "Connecting..."}</p>
        </div>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-900"><span className="material-symbols-outlined text-lg">close</span></button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6">
        {chatHistory.length === 0 && (
          <div className="text-center mt-12 space-y-4">
            <span className="material-symbols-outlined text-4xl text-stone-200">auto_awesome</span>
            <p className="text-sm font-[Noto_Serif] italic text-stone-400">Describe the UI you want to build.</p>
          </div>
        )}
        {chatHistory.map((entry) => {
          if (entry.type === "user") return (
            <div key={entry.id} className="flex flex-row-reverse gap-3">
              <div className="w-6 h-6 rounded bg-blue-700 shrink-0 flex items-center justify-center text-[10px] text-white font-bold">ME</div>
              <div className="space-y-1 text-right">
                <div className="bg-blue-700 text-white p-3 rounded-lg rounded-tr-none shadow-lg shadow-blue-700/10"><p className="text-sm leading-relaxed">{entry.content}</p></div>
                <span className="text-[9px] font-[Public_Sans] text-stone-400">{entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>
          );
          if (entry.type === "agent") return (
            <div key={entry.id} className="flex gap-3">
              <div className="w-6 h-6 rounded bg-amber-100 shrink-0 flex items-center justify-center"><span className="material-symbols-outlined text-xs text-amber-700">auto_awesome</span></div>
              <div className="space-y-1"><div className="bg-stone-100 p-3 rounded-lg rounded-tl-none"><p className="text-sm leading-relaxed text-stone-800">{entry.content}</p></div><span className="text-[9px] font-[Public_Sans] text-stone-400">AVV Agent</span></div>
            </div>
          );
          if (entry.type === "thinking") return (
            <div key={entry.id} className="flex gap-3">
              <div className="w-6 h-6 rounded bg-stone-100 shrink-0 flex items-center justify-center"><span className="material-symbols-outlined text-xs text-stone-400">pending</span></div>
              <p className="text-[11px] font-[Noto_Serif] italic text-stone-400 self-center">{entry.content}</p>
            </div>
          );
          if (entry.type === "option") return (
            <div key={entry.id} className="flex gap-3">
              <div className="w-6 h-6 rounded bg-amber-100 shrink-0 flex items-center justify-center"><span className="material-symbols-outlined text-xs text-amber-700">style</span></div>
              <div className="flex-1 bg-stone-50 border border-stone-200 p-3 rounded-lg">
                <p className="text-xs font-[Public_Sans] font-bold text-stone-700 mb-1">{entry.title}</p>
                <p className="text-[11px] text-stone-500">{entry.content}</p>
                {entry.previewHtml && <iframe srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/><script src="https://cdn.tailwindcss.com"></script><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui}</style></head><body>${entry.previewHtml}</body></html>`} sandbox="allow-scripts" className="w-full h-24 border-none rounded mt-2 bg-white" title="Preview" />}
              </div>
            </div>
          );
          if (entry.type === "system") return (
            <div key={entry.id} className="text-center"><span className="text-[10px] font-[Public_Sans] text-stone-400 uppercase tracking-widest">{entry.content}</span></div>
          );
          return null;
        })}
      </div>

      <div className="p-4 border-t border-stone-100 bg-stone-50">
        <div className="relative">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Describe what you want to build..." className="w-full bg-white border-none rounded-xl p-3 pr-12 text-sm focus:ring-1 focus:ring-amber-700/30 resize-none h-24 shadow-sm" />
          <button onClick={handleSubmit} disabled={!input.trim() || !isConnected} className="absolute bottom-3 right-3 p-1.5 bg-amber-700 text-white rounded-lg shadow-lg shadow-amber-700/20 disabled:opacity-40 hover:bg-amber-800"><span className="material-symbols-outlined text-sm">send</span></button>
        </div>
        <div className="mt-3 flex justify-between items-center">
          <div className="flex gap-1">
            {(["simple", "ultrathink"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`px-2 py-1 rounded text-[10px] font-[Public_Sans] font-bold uppercase tracking-widest ${mode === m ? "bg-stone-200 text-stone-700" : "text-stone-400 hover:text-stone-600"}`}>{m === "ultrathink" ? "UltraThink" : "Simple"}</button>
            ))}
          </div>
          <button onClick={() => { if (confirm("Start fresh?")) { clearAll(); window.location.reload(); } }} className="text-[10px] font-[Public_Sans] font-bold text-stone-400 hover:text-red-500 uppercase tracking-widest">New</button>
        </div>
      </div>
    </aside>
  );
}
```

### Layout barrel exports

File: `packages/web/src/components/layout/index.ts`

```typescript
export { TopBar } from "./TopBar";
export { LeftSidebar } from "./LeftSidebar";
export { RightPanel } from "./RightPanel";
```

### Delete old components

Delete these files (replaced by layout components):
- `packages/web/src/components/PromptBar.tsx`
- `packages/web/src/components/StatusBar.tsx`
- `packages/web/src/components/LayersPanel.tsx`
- `packages/web/src/components/PropertiesPanel.tsx`
- `packages/web/src/components/ChatPanel.tsx`

Update `packages/web/src/components/index.ts`:
```typescript
export { ComponentContextMenu } from "./ComponentContextMenu";
export * from "./layout";
```

## Testing Strategy

```bash
pnpm dev

# Layout: 3-panel layout with dark canvas, collapsible sidebars
# Persistence: generate → refresh → canvas and chat restored
# Export: TopBar download icon → HTML/PNG/Copy/SVG options work
# Retry: failed section shows refresh icon in layers → retry re-generates
# New Project: clears everything and reloads
```

## Out of Scope

- Dark mode toggle
- Responsive/mobile layout
- Figma plugin (V3)
- React/Next.js code export (V3)
