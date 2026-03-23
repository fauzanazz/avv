# AVV Component Iteration

## Context

After generation, users need to refine individual components. This doc adds a right-click context menu on canvas components that lets the user type an instruction (e.g., "make it darker", "add more padding") and re-generate just that one component.

## Requirements

- Custom context menu on `avv-component` shapes (right-click or double-click)
- Inline chat input for iteration instructions
- Backend receives iteration request, spawns a single builder agent with previous HTML + instruction
- Updated HTML streams back and replaces the component on canvas
- Iteration counter increments

## Implementation

### Add iterate WebSocket handler

File: `packages/api/src/agents/iterator.ts`

```typescript
import { query, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "fs";
import { join } from "path";
import { connectionStore } from "../store";
import { extractComponentResult } from "./component-collector";
import { submitComponentTool } from "./tools/submit-component";

function loadSystemPrompt(name: string): string {
  const promptPath = join(import.meta.dir, "..", "..", "prompts", `${name}.md`);
  return readFileSync(promptPath, "utf-8");
}

export interface IterateOptions {
  sessionId: string;
  componentId: string;
  componentName: string;
  currentHtml: string;
  currentCss: string;
  instruction: string;
  iteration: number;
}

/**
 * Iterates on a single component by spawning a builder with the current HTML
 * and the user's refinement instruction.
 */
export async function iterateComponent({
  sessionId,
  componentId,
  componentName,
  currentHtml,
  currentCss,
  instruction,
  iteration,
}: IterateOptions): Promise<void> {
  const builderPrompt = loadSystemPrompt("builder");

  connectionStore.broadcast(sessionId, {
    type: "component:status",
    componentId,
    status: "generating",
  });

  connectionStore.broadcast(sessionId, {
    type: "agent:log",
    agentId: "iterator",
    message: `Iterating on "${componentName}": ${instruction}`,
  });

  const iteratorAgent: AgentDefinition = {
    description: `Iterates on the "${componentName}" component based on user feedback.`,
    prompt: `${builderPrompt}

## Your Task

You are refining an existing UI component called "${componentName}".
This is iteration #${iteration + 1}.

## Current HTML:
\`\`\`html
${currentHtml}
\`\`\`

## Current CSS:
\`\`\`css
${currentCss}
\`\`\`

## User's instruction:
"${instruction}"

## Rules:
- Modify the existing HTML/CSS to match the user's instruction
- Keep everything else the same unless the instruction implies broader changes
- Call the submit_component tool with the updated result
- Maintain the same quality and structure`,
    tools: ["submit_component"],
    model: "sonnet",
  };

  const collectedMessages: any[] = [];

  try {
    for await (const message of query({
      prompt: `Use the iterator agent to refine the "${componentName}" component. The user says: "${instruction}"`,
      options: {
        allowedTools: ["Agent"],
        agents: { iterator: iteratorAgent },
        maxTurns: 5,
        mcpServers: [
          {
            name: "avv-tools",
            tools: [submitComponentTool],
          },
        ],
      },
    })) {
      collectedMessages.push(message);
    }

    const result = extractComponentResult(collectedMessages);
    if (result) {
      connectionStore.broadcast(sessionId, {
        type: "component:updated",
        componentId,
        updates: {
          html: result.html,
          css: result.css,
          status: "ready",
          iteration: iteration + 1,
        },
      });
    } else {
      connectionStore.broadcast(sessionId, {
        type: "component:status",
        componentId,
        status: "error",
      });
    }
  } catch (err) {
    console.error(`[Iterator] Failed:`, err);
    connectionStore.broadcast(sessionId, {
      type: "component:status",
      componentId,
      status: "error",
    });
  }
}
```

### Update ClientMessage types

File: `packages/shared/src/types/ws.ts` — update iterate message to include component data:

```typescript
// Replace the existing iterate message in ClientMessage:
  | {
      type: "iterate";
      componentId: string;
      componentName: string;
      currentHtml: string;
      currentCss: string;
      instruction: string;
      iteration: number;
    }
```

### Wire into WebSocket handler

File: `packages/api/src/ws.ts` — update the iterate case:

```typescript
import { iterateComponent } from "./agents/iterator";

case "iterate": {
  const sid = ws.data.sessionId;
  if (!sid) {
    connectionStore.send(ws, { type: "error", message: "No active session" });
    break;
  }

  iterateComponent({
    sessionId: sid,
    componentId: msg.componentId,
    componentName: msg.componentName,
    currentHtml: msg.currentHtml,
    currentCss: msg.currentCss,
    instruction: msg.instruction,
    iteration: msg.iteration,
  }).catch((err) => {
    console.error("[Iterate] Failed:", err);
    connectionStore.send(ws, { type: "error", message: "Iteration failed" });
  });
  break;
}
```

### Context menu component

File: `packages/web/src/components/ComponentContextMenu.tsx`

```typescript
import { useState, useEffect, useRef } from "react";

interface ComponentContextMenuProps {
  x: number;
  y: number;
  componentId: string;
  componentName: string;
  currentHtml: string;
  currentCss: string;
  iteration: number;
  onIterate: (instruction: string) => void;
  onClose: () => void;
}

export function ComponentContextMenu({
  x, y, componentName, onIterate, onClose,
}: ComponentContextMenuProps) {
  const [instruction, setInstruction] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (instruction.trim()) {
      onIterate(instruction.trim());
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50" onClick={onClose} />

      {/* Menu */}
      <div
        className="fixed z-50 bg-white rounded-lg shadow-xl border border-slate-200 p-3 w-80"
        style={{ left: x, top: y }}
      >
        <p className="text-xs font-medium text-slate-500 mb-2">
          Iterate on: {componentName}
        </p>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g., make it darker, add more spacing..."
            className="flex-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!instruction.trim()}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Go
          </button>
        </form>
      </div>
    </>
  );
}
```

### Hook into tldraw's context menu

File: `packages/web/src/canvas/hooks/useComponentContextMenu.ts`

```typescript
import { useState, useCallback } from "react";
import type { Editor } from "tldraw";
import { AVV_COMPONENT_TYPE, type AVVComponentProps } from "../shapes";

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  componentId: string;
  componentName: string;
  currentHtml: string;
  currentCss: string;
  iteration: number;
}

const INITIAL_STATE: ContextMenuState = {
  isOpen: false, x: 0, y: 0,
  componentId: "", componentName: "", currentHtml: "", currentCss: "", iteration: 0,
};

export function useComponentContextMenu(editor: Editor | null) {
  const [state, setState] = useState<ContextMenuState>(INITIAL_STATE);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!editor) return;

      const selectedShapes = editor.getSelectedShapes();
      const avvShape = selectedShapes.find((s) => s.type === AVV_COMPONENT_TYPE);

      if (!avvShape) return;

      e.preventDefault();
      const props = avvShape.props as AVVComponentProps;

      setState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        componentId: avvShape.id,
        componentName: props.name,
        currentHtml: props.html,
        currentCss: props.css,
        iteration: props.iteration,
      });
    },
    [editor]
  );

  const close = useCallback(() => setState(INITIAL_STATE), []);

  return { state, handleContextMenu, close };
}
```

### Wire context menu into App.tsx

Add to the canvas area div:

```typescript
// Add hook
const { state: ctxMenu, handleContextMenu, close: closeCtxMenu } = useComponentContextMenu(editor);

// Wrap the canvas div with onContextMenu
<div style={{ flex: 1, position: "relative" }} onContextMenu={handleContextMenu}>
  <Tldraw ... />
  
  {ctxMenu.isOpen && (
    <ComponentContextMenu
      {...ctxMenu}
      onIterate={(instruction) => {
        send({
          type: "iterate",
          componentId: ctxMenu.componentId,
          componentName: ctxMenu.componentName,
          currentHtml: ctxMenu.currentHtml,
          currentCss: ctxMenu.currentCss,
          instruction,
          iteration: ctxMenu.iteration,
        });
      }}
      onClose={closeCtxMenu}
    />
  )}
</div>
```

## Testing Strategy

```bash
# 1. Generate some components first (Simple mode)
# 2. Right-click on a component
# 3. Context menu appears with iteration input
# 4. Type "make it darker and add more contrast"
# 5. Click Go
# 6. Component status changes to "Generating"
# 7. Updated HTML replaces the old version
# 8. Status shows "Ready" again with iteration count incremented
```

## Out of Scope

- Iteration history / undo
- Multiple component selection for batch iteration
- Drag-and-drop reordering
