# AVV Agent-Canvas Bridge

## Context

The backend streams agent progress via WebSocket (FAU-35), and the canvas can render custom shapes (FAU-34). This doc bridges them — a WebSocket client hook on the frontend that receives `ServerMessage` events and creates/updates tldraw shapes in real-time as agents produce components.

## Requirements

- WebSocket client hook that connects to the backend and auto-reconnects
- Receive `ServerMessage` events and dispatch them to the tldraw editor
- Create `avv-component` shapes when `component:created` arrives
- Update shape props when `component:updated` or `component:status` arrives
- Show agent activity log in a status bar
- Support sending `ClientMessage` commands (generate, iterate, cancel)

## Implementation

### WebSocket client hook

File: `packages/web/src/hooks/useAVVWebSocket.ts`

```typescript
import { useEffect, useRef, useCallback, useState } from "react";
import type { ServerMessage, ClientMessage } from "@avv/shared";

interface UseAVVWebSocketOptions {
  url?: string;
  onMessage: (msg: ServerMessage) => void;
  autoReconnect?: boolean;
  reconnectIntervalMs?: number;
}

interface UseAVVWebSocketReturn {
  send: (msg: ClientMessage) => void;
  isConnected: boolean;
  sessionId: string | null;
}

export function useAVVWebSocket({
  url = getDefaultWsUrl(),
  onMessage,
  autoReconnect = true,
  reconnectIntervalMs = 3000,
}: UseAVVWebSocketOptions): UseAVVWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const wsUrl = sessionId ? `${url}?sessionId=${sessionId}` : url;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[WS] Connected");
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === "session:started") {
          setSessionId(msg.sessionId);
        }
        onMessageRef.current(msg);
      } catch (err) {
        console.error("[WS] Failed to parse message:", err);
      }
    };

    ws.onclose = () => {
      console.log("[WS] Disconnected");
      setIsConnected(false);
      if (autoReconnect) {
        setTimeout(connect, reconnectIntervalMs);
      }
    };

    ws.onerror = (err) => {
      console.error("[WS] Error:", err);
      ws.close();
    };

    wsRef.current = ws;
  }, [url, sessionId, autoReconnect, reconnectIntervalMs]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn("[WS] Cannot send — not connected");
    }
  }, []);

  return { send, isConnected, sessionId };
}
```

### Canvas sync hook — maps ServerMessage to tldraw operations

File: `packages/web/src/hooks/useCanvasSync.ts`

```typescript
import { useCallback, useRef } from "react";
import type { Editor } from "tldraw";
import type { ServerMessage, AVVComponent } from "@avv/shared";
import { AVV_COMPONENT_TYPE, type AVVComponentProps } from "../canvas/shapes";

/** Maps server component IDs to tldraw shape IDs */
type ComponentShapeMap = Map<string, string>;

interface UseCanvasSyncReturn {
  handleMessage: (msg: ServerMessage) => void;
}

export function useCanvasSync(editor: Editor | null): UseCanvasSyncReturn {
  const componentMapRef = useRef<ComponentShapeMap>(new Map());

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      if (!editor) return;

      switch (msg.type) {
        case "component:created": {
          const comp = msg.component;
          const shapeId = editor.createShapeId();

          // Map server component ID to tldraw shape ID
          componentMapRef.current.set(comp.id, shapeId);
          // Also map by name for status updates that use name as componentId
          componentMapRef.current.set(comp.name, shapeId);

          editor.createShape({
            id: shapeId,
            type: AVV_COMPONENT_TYPE,
            x: comp.x,
            y: comp.y,
            props: {
              w: comp.width,
              h: comp.height,
              name: comp.name,
              status: comp.status,
              html: comp.html,
              css: comp.css,
              prompt: comp.prompt,
              agentId: comp.agentId,
              iteration: comp.iteration,
            } satisfies AVVComponentProps,
          });
          break;
        }

        case "component:updated": {
          const shapeId = componentMapRef.current.get(msg.componentId);
          if (!shapeId) {
            console.warn(`[CanvasSync] Unknown component: ${msg.componentId}`);
            return;
          }

          editor.updateShape({
            id: shapeId,
            type: AVV_COMPONENT_TYPE,
            props: msg.updates as Partial<AVVComponentProps>,
          });
          break;
        }

        case "component:status": {
          const shapeId = componentMapRef.current.get(msg.componentId);
          if (!shapeId) return;

          editor.updateShape({
            id: shapeId,
            type: AVV_COMPONENT_TYPE,
            props: { status: msg.status },
          });
          break;
        }

        case "generation:done": {
          console.log("[CanvasSync] Generation complete");
          // Could zoom to fit all shapes
          editor.zoomToFit({ animation: { duration: 500 } });
          break;
        }

        case "error": {
          console.error("[CanvasSync] Server error:", msg.message);
          break;
        }
      }
    },
    [editor]
  );

  return { handleMessage };
}
```

### Agent log store

File: `packages/web/src/hooks/useAgentLogs.ts`

```typescript
import { useState, useCallback } from "react";
import type { ServerMessage } from "@avv/shared";

export interface AgentLogEntry {
  id: string;
  agentId: string;
  message: string;
  timestamp: Date;
}

interface UseAgentLogsReturn {
  logs: AgentLogEntry[];
  handleMessage: (msg: ServerMessage) => void;
  clearLogs: () => void;
}

export function useAgentLogs(): UseAgentLogsReturn {
  const [logs, setLogs] = useState<AgentLogEntry[]>([]);

  const handleMessage = useCallback((msg: ServerMessage) => {
    if (msg.type === "agent:log") {
      setLogs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          agentId: msg.agentId,
          message: msg.message,
          timestamp: new Date(),
        },
      ]);
    }
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, handleMessage, clearLogs };
}
```

### Updated App.tsx — wired together

File: `packages/web/src/App.tsx` (replace existing)

```typescript
import { useState, useCallback } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { AVVComponentShapeUtil } from "./canvas/shapes";
import { useAVVWebSocket } from "./hooks/useAVVWebSocket";
import { useCanvasSync } from "./hooks/useCanvasSync";
import { useAgentLogs } from "./hooks/useAgentLogs";
import { PromptBar } from "./components/PromptBar";
import { StatusBar } from "./components/StatusBar";
import type { ServerMessage } from "@avv/shared";

const customShapeUtils = [AVVComponentShapeUtil];

export function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const { handleMessage: handleCanvasMessage } = useCanvasSync(editor);
  const { logs, handleMessage: handleLogMessage } = useAgentLogs();

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      handleCanvasMessage(msg);
      handleLogMessage(msg);
    },
    [handleCanvasMessage, handleLogMessage]
  );

  const { send, isConnected, sessionId } = useAVVWebSocket({ onMessage });

  const handleGenerate = useCallback(
    (prompt: string, mode: "simple" | "ultrathink") => {
      send({ type: "generate", prompt, mode });
    },
    [send]
  );

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      {/* Prompt input bar at top */}
      <PromptBar onGenerate={handleGenerate} isConnected={isConnected} />

      {/* Canvas */}
      <div style={{ flex: 1, position: "relative" }}>
        <Tldraw
          shapeUtils={customShapeUtils}
          onMount={(e) => setEditor(e)}
        />
      </div>

      {/* Status bar at bottom */}
      <StatusBar logs={logs} isConnected={isConnected} sessionId={sessionId} />
    </div>
  );
}
```

### Prompt bar component

File: `packages/web/src/components/PromptBar.tsx`

```typescript
import { useState } from "react";

interface PromptBarProps {
  onGenerate: (prompt: string, mode: "simple" | "ultrathink") => void;
  isConnected: boolean;
}

export function PromptBar({ onGenerate, isConnected }: PromptBarProps) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"simple" | "ultrathink">("simple");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    onGenerate(prompt.trim(), mode);
    setPrompt("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 z-50"
    >
      <div
        className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
        title={isConnected ? "Connected" : "Disconnected"}
      />

      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the UI you want to build..."
        className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />

      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as "simple" | "ultrathink")}
        className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
      >
        <option value="simple">Simple</option>
        <option value="ultrathink">UltraThink</option>
      </select>

      <button
        type="submit"
        disabled={!prompt.trim() || !isConnected}
        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Generate
      </button>
    </form>
  );
}
```

### Status bar component

File: `packages/web/src/components/StatusBar.tsx`

```typescript
import type { AgentLogEntry } from "../hooks/useAgentLogs";

interface StatusBarProps {
  logs: AgentLogEntry[];
  isConnected: boolean;
  sessionId: string | null;
}

export function StatusBar({ logs, isConnected, sessionId }: StatusBarProps) {
  const lastLog = logs[logs.length - 1];

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 z-50">
      <div className="flex items-center gap-2">
        <span>{isConnected ? "Connected" : "Disconnected"}</span>
        {sessionId && <span>| Session: {sessionId.slice(0, 8)}...</span>}
      </div>

      {lastLog && (
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-600">[{lastLog.agentId}]</span>
          <span>{lastLog.message}</span>
        </div>
      )}
    </div>
  );
}
```

### Hooks barrel export

File: `packages/web/src/hooks/index.ts`

```typescript
export { useAVVWebSocket } from "./useAVVWebSocket";
export { useCanvasSync } from "./useCanvasSync";
export { useAgentLogs } from "./useAgentLogs";
```

### Components barrel export

File: `packages/web/src/components/index.ts`

```typescript
export { PromptBar } from "./PromptBar";
export { StatusBar } from "./StatusBar";
```

## Testing Strategy

```bash
# Start both frontend and backend
pnpm dev

# Open http://localhost:5173
# Expected UI:
# 1. Prompt bar at top with input, mode selector, and Generate button
# 2. tldraw canvas in the middle
# 3. Status bar at bottom showing connection status

# Test generation:
# 1. Type "SaaS landing page for a project management tool"
# 2. Click Generate
# 3. Status bar should show agent activity messages
# 4. Components should appear on canvas one by one
# 5. Components start as "Pending" → "Generating" → "Ready" with HTML preview
# 6. Canvas auto-zooms to fit when generation completes

# Test disconnect/reconnect:
# 1. Stop the API server
# 2. Status dot turns red, status bar shows "Disconnected"
# 3. Restart API server
# 4. Status dot turns green automatically (auto-reconnect)
```

## Out of Scope

- UltraThink mode questionnaire UI (avv-ultrathink-mode)
- Component iteration via right-click (avv-component-iteration)
- Layers/properties panels (avv-panels)
- Offline mode or message queue persistence
