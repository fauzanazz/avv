# AVV Layout V2 — Full App Shell Redesign

## Context

The V1 layout has overlapping panels and a broken UX. This doc redesigns the entire app shell based on a reference design ("Alexandria Design" style) with a clean 3-panel layout: fixed top toolbar, fixed left layers sidebar, dark canvas center, and fixed right AI chat panel.

### Reference layout anatomy:
```
┌───────────────────────────────────────────────────────────────────┐
│  TopBar: Logo | Toolbar (select,frame,text,img) | Actions | User │  h-14
├──────────┬────────────────────────────────────┬───────────────────┤
│          │                                    │                   │
│  Left    │       Main Canvas (dark bg)        │   Right Panel     │
│  Sidebar │       • Dot grid pattern           │   "AVV Agent"     │
│  w-60    │       • Artboard (white, centered) │   • Chat msgs     │
│          │       • Selection overlays          │   • AI thinking   │
│  Layers  │       • tldraw canvas              │   • Options        │
│  Assets  │                                    │   • Textarea       │
│  Pages   │       Zoom controls (bottom)       │   w-80            │
│  History │                                    │                   │
│          │                                    │   Settings         │
├──────────┴────────────────────────────────────┴───────────────────┤
│  (no status bar — status integrated into right panel)             │
└───────────────────────────────────────────────────────────────────┘
```

### V1 problems this fixes:
- Panels overlap (absolute-positioned inside canvas)
- No consistent visual hierarchy
- tldraw default chrome clashes with custom panels
- No branding or visual identity
- StatusBar wastes vertical space

## Requirements

- Fixed top toolbar (h-14) with logo, canvas tools, and actions
- Fixed left sidebar (w-60) with layers tree, page navigation
- Center canvas area fills remaining space with dark background and dot grid
- tldraw renders inside the canvas area with its own chrome hidden
- Fixed right sidebar (w-80) for AI chat panel
- Both sidebars are collapsible with toggle buttons
- Material Symbols icons throughout (via Google Fonts CDN)
- Inter + Public Sans + Noto Serif font stack
- Dark canvas background (stone-900) with dot grid pattern
- Clean, editorial aesthetic — no shadows on panels, subtle borders only

## Implementation

### Add Google Fonts and Material Symbols to index.html

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

### Tailwind config — extend with design tokens

File: `packages/web/tailwind.config.ts` (create new file — Tailwind v4 may use CSS config, but provide this for reference)

Add to `packages/web/src/app.css`:

```css
@import "tailwindcss";

@theme {
  --font-family-serif: "Noto Serif", serif;
  --font-family-sans: "Inter", sans-serif;
  --font-family-label: "Public Sans", sans-serif;

  --color-canvas-bg: #1c1917;
  --color-canvas-grid: #44403c;
  --color-panel-bg: #fafaf9;
  --color-panel-border: #f5f5f4;
  --color-primary: #1d4ed8;
  --color-primary-container: #3366cc;
  --color-on-primary: #ffffff;
  --color-accent: #b45309;
  --color-accent-container: #bfab49;
  --color-muted: #a8a29e;
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

### App Shell — new top-level layout

File: `packages/web/src/App.tsx` (replace entirely)

```typescript
import { useState, useCallback } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import type { ServerMessage } from "@avv/shared";
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

  // Canvas sync and agent logs
  const { handleMessage: handleCanvasMessage } = useCanvasSync(editor);
  const { logs, handleMessage: handleLogMessage } = useAgentLogs();

  // Central message handler
  const [chatMessages, setChatMessages] = useState<ServerMessage[]>([]);

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      handleCanvasMessage(msg);
      handleLogMessage(msg);
      // Forward all messages to right panel for chat display
      setChatMessages((prev) => [...prev, msg]);
    },
    [handleCanvasMessage, handleLogMessage]
  );

  const { send, isConnected, sessionId } = useAVVWebSocket({ onMessage });

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-stone-900">
      {/* Top Bar */}
      <TopBar
        isConnected={isConnected}
        onToggleLeft={() => setLeftOpen(!leftOpen)}
        onToggleRight={() => setRightOpen(!rightOpen)}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
      />

      {/* Main area: sidebar + canvas + right panel */}
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar */}
        {leftOpen && (
          <LeftSidebar
            editor={editor}
            onClose={() => setLeftOpen(false)}
          />
        )}

        {/* Canvas Area */}
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
            />
          </div>

          {/* Zoom controls overlay (bottom center) */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-stone-800/90 backdrop-blur text-white px-4 py-2 rounded-full flex items-center gap-4 text-xs font-[Public_Sans] z-20">
            <button
              onClick={() => editor?.zoomOut()}
              className="hover:text-blue-400 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">remove</span>
            </button>
            <span>{Math.round((editor?.getZoomLevel() ?? 1) * 100)}%</span>
            <button
              onClick={() => editor?.zoomIn()}
              className="hover:text-blue-400 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">add</span>
            </button>
            <div className="w-px h-4 bg-stone-600" />
            <button
              onClick={() => editor?.zoomToFit({ animation: { duration: 300 } })}
              className="hover:text-blue-400 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">fit_screen</span>
            </button>
          </div>

          {/* Toggle buttons when panels are collapsed */}
          {!leftOpen && (
            <button
              onClick={() => setLeftOpen(true)}
              className="absolute top-3 left-3 z-20 p-2 bg-stone-800/80 backdrop-blur text-stone-400 rounded-lg hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-sm">menu</span>
            </button>
          )}
          {!rightOpen && (
            <button
              onClick={() => setRightOpen(true)}
              className="absolute top-3 right-3 z-20 p-2 bg-stone-800/80 backdrop-blur text-stone-400 rounded-lg hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-sm">auto_awesome</span>
            </button>
          )}
        </main>

        {/* Right Panel — AI Chat */}
        {rightOpen && (
          <RightPanel
            messages={chatMessages}
            logs={logs}
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

Note: `<Tldraw hideUi />` hides tldraw's default toolbar/panels so our custom UI takes over. We keep tldraw's canvas interactions (pan, zoom, select, move, resize).

### TopBar component

File: `packages/web/src/components/layout/TopBar.tsx`

```typescript
interface TopBarProps {
  isConnected: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  leftOpen: boolean;
  rightOpen: boolean;
}

export function TopBar({ isConnected, onToggleLeft, onToggleRight, leftOpen, rightOpen }: TopBarProps) {
  return (
    <header className="h-14 bg-white/80 backdrop-blur-xl flex justify-between items-center px-6 z-50 shrink-0">
      <div className="flex items-center gap-6">
        {/* Logo */}
        <span className="text-xl font-black text-stone-900 font-[Noto_Serif] italic">
          AVV
        </span>

        {/* Connection indicator */}
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-[10px] font-[Public_Sans] text-stone-400 uppercase tracking-widest">
            {isConnected ? "Connected" : "Offline"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Panel toggles */}
        <button
          onClick={onToggleLeft}
          className={`p-2 rounded transition-colors ${leftOpen ? "text-blue-700" : "text-stone-400 hover:text-stone-700"}`}
          title="Toggle layers panel"
        >
          <span className="material-symbols-outlined text-lg">layers</span>
        </button>
        <button
          onClick={onToggleRight}
          className={`p-2 rounded transition-colors ${rightOpen ? "text-blue-700" : "text-stone-400 hover:text-stone-700"}`}
          title="Toggle AI panel"
        >
          <span className="material-symbols-outlined text-lg">auto_awesome</span>
        </button>
      </div>
    </header>
  );
}
```

### Left Sidebar component

File: `packages/web/src/components/layout/LeftSidebar.tsx`

```typescript
import { useEffect, useState } from "react";
import type { Editor, TLShapeId } from "tldraw";
import { AVV_PAGE_TYPE, parseSections, type AVVPageProps } from "../../canvas/shapes";
import type { PageSection } from "@avv/shared";

interface LeftSidebarProps {
  editor: Editor | null;
  onClose: () => void;
}

interface PageLayer {
  shapeId: TLShapeId;
  title: string;
  status: string;
  sections: PageSection[];
}

export function LeftSidebar({ editor, onClose }: LeftSidebarProps) {
  const [pages, setPages] = useState<PageLayer[]>([]);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  useEffect(() => {
    if (!editor) return;

    const update = () => {
      const shapes = editor.getCurrentPageShapes();
      const pageShapes = shapes
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

  const statusIcon = (status: string) => {
    switch (status) {
      case "ready": return "check_circle";
      case "generating": return "pending";
      case "error": return "error";
      default: return "radio_button_unchecked";
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "ready": return "text-green-600";
      case "generating": return "text-blue-500 animate-pulse";
      case "error": return "text-red-500";
      default: return "text-stone-300";
    }
  };

  return (
    <aside className="w-60 bg-stone-50 flex flex-col border-r border-stone-100 shrink-0 z-40">
      {/* Header */}
      <div className="p-4 border-b border-stone-100">
        <h2 className="text-stone-900 font-[Noto_Serif] text-sm font-bold">Project</h2>
        <p className="text-[10px] text-stone-400 font-[Public_Sans] uppercase tracking-widest mt-1">
          Layers
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="px-2 space-y-1">
          <a className="flex items-center gap-3 py-2 text-blue-700 font-bold border-l-4 border-blue-700 pl-2 text-xs tracking-tight" href="#">
            <span className="material-symbols-outlined text-sm">layers</span>
            <span>Layers</span>
          </a>
          <a className="flex items-center gap-3 py-2 text-stone-400 pl-3 hover:text-stone-900 text-xs tracking-tight transition-colors" href="#">
            <span className="material-symbols-outlined text-sm">history</span>
            <span>History</span>
          </a>
        </div>

        {/* Page > Section tree */}
        <div className="mt-6 px-4">
          <span className="text-[10px] font-[Public_Sans] font-bold text-stone-400 uppercase tracking-widest">
            Canvas Layers
          </span>

          {pages.length === 0 ? (
            <p className="mt-4 text-[11px] text-stone-300 italic font-[Noto_Serif]">
              No pages yet. Start a conversation to generate.
            </p>
          ) : (
            pages.map((page) => (
              <div key={page.shapeId} className="mt-4 space-y-1">
                {/* Page header */}
                <button
                  onClick={() => {
                    editor?.select(page.shapeId);
                    editor?.zoomToSelection({ animation: { duration: 300 } });
                  }}
                  className="flex items-center gap-2 p-1.5 w-full rounded hover:bg-stone-100 cursor-pointer text-left"
                >
                  <span className={`material-symbols-outlined text-xs ${statusColor(page.status)}`}>
                    {statusIcon(page.status)}
                  </span>
                  <span className="text-[11px] font-semibold text-stone-700 truncate">
                    {page.title}
                  </span>
                </button>

                {/* Sections */}
                {page.sections
                  .sort((a, b) => a.order - b.order)
                  .map((section) => (
                    <button
                      key={section.id}
                      onClick={() => setSelectedSection(section.id)}
                      className={`flex items-center gap-2 p-1.5 w-full rounded hover:bg-stone-100 cursor-pointer pl-6 border-l transition-colors text-left ${
                        selectedSection === section.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-stone-200"
                      }`}
                    >
                      <span className={`material-symbols-outlined text-xs ${statusColor(section.status)}`}>
                        {statusIcon(section.status)}
                      </span>
                      <span className="text-[11px] text-stone-500 truncate">
                        {section.name}
                      </span>
                    </button>
                  ))}
              </div>
            ))
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-stone-100">
        <button
          onClick={onClose}
          className="w-full text-stone-400 hover:text-stone-600 text-[10px] font-[Public_Sans] uppercase tracking-widest transition-colors"
        >
          Collapse
        </button>
      </div>
    </aside>
  );
}
```

### Right Panel component (AI Chat)

File: `packages/web/src/components/layout/RightPanel.tsx`

```typescript
import { useState, useRef, useEffect, useCallback } from "react";
import type { ServerMessage, ClientMessage } from "@avv/shared";
import type { AgentLogEntry } from "../../hooks/useAgentLogs";

interface RightPanelProps {
  messages: ServerMessage[];
  logs: AgentLogEntry[];
  isConnected: boolean;
  sessionId: string | null;
  onSend: (msg: ClientMessage) => void;
  onClose: () => void;
}

interface ChatEntry {
  id: string;
  type: "user" | "agent" | "thinking" | "option" | "system";
  content: string;
  title?: string;
  previewHtml?: string;
  timestamp: Date;
}

export function RightPanel({ messages, logs, isConnected, sessionId, onSend, onClose }: RightPanelProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"simple" | "ultrathink">("simple");
  const [chatHistory, setChatHistory] = useState<ChatEntry[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Convert server messages to chat entries
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;

    let entry: ChatEntry | null = null;

    switch (last.type) {
      case "agent:thinking":
        entry = { id: crypto.randomUUID(), type: "thinking", content: last.thought, timestamp: new Date() };
        break;
      case "agent:option":
        entry = { id: crypto.randomUUID(), type: "option", content: last.description, title: last.title, previewHtml: last.previewHtml, timestamp: new Date() };
        break;
      case "agent:log":
        entry = { id: crypto.randomUUID(), type: "agent", content: last.message, timestamp: new Date() };
        break;
      case "generation:done":
        entry = { id: crypto.randomUUID(), type: "system", content: "Generation complete.", timestamp: new Date() };
        break;
      case "error":
        entry = { id: crypto.randomUUID(), type: "system", content: `Error: ${last.message}`, timestamp: new Date() };
        break;
    }

    if (entry) {
      setChatHistory((prev) => [...prev, entry!]);
    }
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || !isConnected) return;

    const text = input.trim();
    setChatHistory((prev) => [...prev, {
      id: crypto.randomUUID(),
      type: "user",
      content: text,
      timestamp: new Date(),
    }]);
    setInput("");

    if (!hasStarted) {
      onSend({ type: "generate", prompt: text, mode });
      setHasStarted(true);
    } else {
      onSend({ type: "chat", message: text });
    }
  }, [input, isConnected, hasStarted, mode, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <aside className="w-80 bg-white flex flex-col border-l border-stone-100 shrink-0 z-40 shadow-2xl shadow-stone-900/5">
      {/* Header */}
      <div className="p-4 border-b border-stone-100 flex justify-between items-center">
        <div>
          <h2 className="text-stone-900 font-[Noto_Serif] font-bold italic text-sm">AVV Agent</h2>
          <p className="text-[10px] text-stone-400 font-[Public_Sans] tracking-tighter">
            {isConnected ? "Design Intelligence" : "Connecting..."}
          </p>
        </div>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-900 transition-colors">
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
      </div>

      {/* Chat Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6">
        {chatHistory.length === 0 && (
          <div className="text-center mt-12 space-y-4">
            <span className="material-symbols-outlined text-4xl text-stone-200">auto_awesome</span>
            <p className="text-sm font-[Noto_Serif] italic text-stone-400">
              Describe the UI you want to build.
            </p>
          </div>
        )}

        {chatHistory.map((entry) => {
          switch (entry.type) {
            case "user":
              return (
                <div key={entry.id} className="flex flex-row-reverse gap-3">
                  <div className="w-6 h-6 rounded bg-primary-container shrink-0 flex items-center justify-center text-[10px] text-white font-bold">
                    ME
                  </div>
                  <div className="space-y-1 text-right">
                    <div className="bg-blue-700 text-white p-3 rounded-lg rounded-tr-none shadow-lg shadow-blue-700/10">
                      <p className="text-sm leading-relaxed">{entry.content}</p>
                    </div>
                    <span className="text-[9px] font-[Public_Sans] text-stone-400">
                      {entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              );

            case "agent":
              return (
                <div key={entry.id} className="flex gap-3">
                  <div className="w-6 h-6 rounded bg-amber-100 shrink-0 flex items-center justify-center">
                    <span className="material-symbols-outlined text-xs text-amber-700">auto_awesome</span>
                  </div>
                  <div className="space-y-1">
                    <div className="bg-stone-100 p-3 rounded-lg rounded-tl-none">
                      <p className="text-sm leading-relaxed text-stone-800">{entry.content}</p>
                    </div>
                    <span className="text-[9px] font-[Public_Sans] text-stone-400">AVV Agent</span>
                  </div>
                </div>
              );

            case "thinking":
              return (
                <div key={entry.id} className="flex gap-3">
                  <div className="w-6 h-6 rounded bg-stone-100 shrink-0 flex items-center justify-center">
                    <span className="material-symbols-outlined text-xs text-stone-400">pending</span>
                  </div>
                  <p className="text-[11px] font-[Noto_Serif] italic text-stone-400 self-center leading-relaxed">
                    {entry.content}
                  </p>
                </div>
              );

            case "option":
              return (
                <div key={entry.id} className="flex gap-3">
                  <div className="w-6 h-6 rounded bg-amber-100 shrink-0 flex items-center justify-center">
                    <span className="material-symbols-outlined text-xs text-amber-700">style</span>
                  </div>
                  <div className="space-y-2 flex-1">
                    <div className="bg-stone-50 border border-stone-200 p-3 rounded-lg">
                      <p className="text-xs font-[Public_Sans] font-bold text-stone-700 mb-1">{entry.title}</p>
                      <p className="text-[11px] text-stone-500 leading-relaxed">{entry.content}</p>
                      {entry.previewHtml && (
                        <iframe
                          srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/><script src="https://cdn.tailwindcss.com"></script><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui}</style></head><body>${entry.previewHtml}</body></html>`}
                          sandbox="allow-scripts"
                          className="w-full h-24 border-none rounded mt-2 bg-white"
                          title="Option Preview"
                        />
                      )}
                    </div>
                  </div>
                </div>
              );

            case "system":
              return (
                <div key={entry.id} className="text-center">
                  <span className="text-[10px] font-[Public_Sans] text-stone-400 uppercase tracking-widest">
                    {entry.content}
                  </span>
                </div>
              );
          }
        })}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-stone-100 bg-stone-50">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to build..."
            className="w-full bg-white border-none rounded-xl p-3 pr-12 text-sm focus:ring-1 focus:ring-amber-700/30 resize-none h-24 shadow-sm"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || !isConnected}
            className="absolute bottom-3 right-3 p-1.5 bg-amber-700 text-white rounded-lg shadow-lg shadow-amber-700/20 disabled:opacity-40 hover:bg-amber-800 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">send</span>
          </button>
        </div>
        <div className="mt-3 flex justify-between items-center">
          <div className="flex gap-1">
            <button
              onClick={() => setMode("simple")}
              className={`px-2 py-1 rounded text-[10px] font-[Public_Sans] font-bold uppercase tracking-widest transition-colors ${
                mode === "simple" ? "bg-stone-200 text-stone-700" : "text-stone-400 hover:text-stone-600"
              }`}
            >
              Simple
            </button>
            <button
              onClick={() => setMode("ultrathink")}
              className={`px-2 py-1 rounded text-[10px] font-[Public_Sans] font-bold uppercase tracking-widest transition-colors ${
                mode === "ultrathink" ? "bg-stone-200 text-stone-700" : "text-stone-400 hover:text-stone-600"
              }`}
            >
              UltraThink
            </button>
          </div>
          <button
            onClick={() => { setChatHistory([]); setHasStarted(false); }}
            className="text-[10px] font-[Public_Sans] font-bold text-stone-400 hover:text-red-500 transition-colors uppercase tracking-widest"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Settings */}
      <div className="p-2 border-t border-stone-100">
        <a className="flex items-center gap-3 py-2 text-stone-400 hover:bg-amber-50 rounded font-[Noto_Serif] text-sm italic transition-colors" href="#">
          <span className="material-symbols-outlined text-sm ml-3">settings</span>
          <span>Settings</span>
        </a>
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

### Delete old components (replaced by layout components)

Delete these files:
- `packages/web/src/components/PromptBar.tsx` (replaced by RightPanel input)
- `packages/web/src/components/StatusBar.tsx` (replaced by RightPanel system messages)
- `packages/web/src/components/LayersPanel.tsx` (replaced by LeftSidebar)
- `packages/web/src/components/PropertiesPanel.tsx` (merged into LeftSidebar)
- `packages/web/src/components/ChatPanel.tsx` (replaced by RightPanel)
- `packages/web/src/components/ComponentContextMenu.tsx` (keep for now, wire later)

Update `packages/web/src/components/index.ts`:

```typescript
export { ComponentContextMenu } from "./ComponentContextMenu";
export * from "./layout";
```

### Hide tldraw default UI

The key line in App.tsx is `<Tldraw hideUi />`. This removes tldraw's built-in toolbar, panels, and menu bar while keeping all canvas interactions (pan, zoom, select, resize, drag). Our custom TopBar and panels replace tldraw's chrome entirely.

## Testing Strategy

```bash
# Start dev servers
pnpm dev

# Open http://localhost:5173
# Expected layout:
# 1. White top bar with "AVV" logo (italic serif) and panel toggle buttons
# 2. Left sidebar (stone-50 bg) with "Project > Layers" navigation and canvas layer tree
# 3. Dark canvas center (stone-900) with subtle dot grid pattern
# 4. Right panel (white bg) with "AVV Agent" header, chat messages, textarea input
# 5. Zoom controls floating at bottom center of canvas

# Test panel toggles:
# 1. Click layers icon in top bar → left sidebar collapses, canvas expands
# 2. Click AI icon in top bar → right panel collapses, canvas expands
# 3. Floating toggle buttons appear on canvas when panels are collapsed

# Test chat:
# 1. Type in textarea → press Enter or click send button
# 2. User message appears right-aligned in blue
# 3. Agent responses appear left-aligned with amber icon
# 4. Thinking appears as italic serif text with pending icon

# Type check
pnpm type-check
```

## Out of Scope

- Dark mode toggle (future)
- Custom tldraw tools (select, frame, text, image buttons in top bar are placeholders)
- Properties panel for section inspection (merge into left sidebar later)
- Responsive/mobile layout
- Keyboard shortcuts
