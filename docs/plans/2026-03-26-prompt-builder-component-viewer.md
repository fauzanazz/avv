# Prompt Builder + Component Viewer — Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use parallel-plan-execution to implement this plan task-by-task.

**Goal:** Pivot AVV from tldraw canvas to a three-column layout: agentic chat (left), component list (center), component preview (right).

**Architecture:** Remove tldraw entirely. Replace with React split-pane layout. Backend keeps orchestrator/builder pipeline but emits updated WS message types. Component viewer renders individual components in iframes with viewport controls and export.

**Tech Stack:** React 19, Vite 6, Tailwind CSS v4, Bun, Hono v4, Claude Agent SDK, WebSocket

---

## Wave 1: Shared Types (foundation)

### Task 1: Update shared data model

**Files:**
- Modify: `packages/shared/src/types/canvas.ts`
- Modify: `packages/shared/src/types/ws.ts`

Update `canvas.ts` — replace `AVVPage`/`PageSection` with new types:

```typescript
export type ComponentStatus = "pending" | "generating" | "ready" | "error";

export interface ComponentVariant {
  id: string;
  html: string;
  css: string;
  label: string;
  createdAt: string;
}

export interface ViewerComponent {
  id: string;
  name: string;
  status: ComponentStatus;
  variants: ComponentVariant[];
  prompt: string;
  agentId: string;
  order: number;
}

export interface GenerationSession {
  id: string;
  title: string;
  status: ComponentStatus;
  components: ViewerComponent[];
  prompt: string;
  mode: "simple" | "ultrathink";
  createdAt: string;
}
```

Update `ws.ts` — rename page→generation, section→component:

```typescript
export type ServerMessage =
  | { type: "generation:created"; session: GenerationSession }
  | { type: "generation:status"; sessionId: string; status: ComponentStatus }
  | { type: "component:updated"; sessionId: string; componentId: string; updates: Partial<ViewerComponent> }
  | { type: "component:status"; sessionId: string; componentId: string; status: ComponentStatus }
  | { type: "agent:log"; agentId: string; message: string }
  | { type: "agent:thinking"; agentId: string; thought: string }
  | { type: "agent:option"; agentId: string; optionId: string; title: string; description: string; previewHtml?: string }
  | { type: "session:started"; sessionId: string }
  | { type: "generation:done"; sessionId: string }
  | { type: "image:ready"; image: ImageResult }
  | { type: "image:generating"; requestId: string; componentId: string }
  | { type: "ultrathink:question"; questionId: string; question: string; options?: string[] }
  | { type: "ultrathink:spec"; spec: string }
  | { type: "ultrathink:ready"; enrichedPrompt: string }
  | { type: "error"; message: string };

export type ClientMessage =
  | { type: "generate"; prompt: string; mode: "simple" | "ultrathink" }
  | { type: "iterate"; sessionId: string; componentId: string; componentName: string; currentHtml: string; currentCss: string; instruction: string; iteration: number }
  | { type: "chat"; message: string }
  | { type: "retry"; sessionId: string; componentId: string }
  | { type: "cancel" };
```

## Wave 2: Backend + Frontend cleanup (parallel)

### Task 2: Update backend orchestrator

**Files:**
- Modify: `packages/api/src/agents/orchestrator.ts`
- Modify: `packages/api/src/store/plan-store.ts` (if references old types)

Change orchestrator to:
- Create `ViewerComponent[]` instead of `PageSection[]`
- Each component gets a single initial variant (v1) with empty html/css
- Emit `generation:created` with full `GenerationSession`
- Emit `component:updated` with variant data when builder completes
- Emit `component:status` for status changes
- Use `sessionId` (the generation session ID) instead of `pageId`

### Task 3: Update backend WS handler + iterator

**Files:**
- Modify: `packages/api/src/ws.ts`
- Modify: `packages/api/src/agents/iterator.ts`
- Modify: `packages/api/src/agents/retrier.ts` (if exists)

Update `ws.ts`:
- `iterate` message now uses `sessionId` + `componentId` instead of `pageId` + `sectionId`
- `retry` message uses `sessionId` + `componentId`

Update `iterator.ts`:
- Change to emit `component:updated` and `component:status` messages

### Task 4: Remove tldraw from frontend

**Files:**
- Modify: `packages/web/package.json` — remove `tldraw` dependency
- Delete: `packages/web/src/canvas/` directory entirely
- Delete: `packages/web/src/hooks/useCanvasSync.ts`
- Modify: `packages/web/src/hooks/index.ts` — remove useCanvasSync export
- Delete: `packages/web/src/components/ComponentContextMenu.tsx`
- Modify: `packages/web/src/components/index.ts` — remove ComponentContextMenu
- Delete: `packages/web/src/utils/export.ts` (will rewrite)

## Wave 3: New frontend components (after cleanup)

### Task 5: Build useComponentSync hook

**Files:**
- Create: `packages/web/src/hooks/useComponentSync.ts`
- Modify: `packages/web/src/hooks/index.ts`

This hook replaces `useCanvasSync`. It:
- Maintains a `GenerationSession | null` state
- Handles `generation:created` → sets session state
- Handles `component:updated` → updates specific component + variant
- Handles `component:status` → updates component status
- Exposes `session`, `selectedComponentId`, `setSelectedComponentId`

### Task 6: Build ComponentList sidebar

**Files:**
- Create: `packages/web/src/components/ComponentList.tsx`

Replaces `LeftSidebar`. Shows:
- List of component names with status dots (color-coded)
- Click to select → updates selectedComponentId
- Active component highlighted with left border
- Retry button for errored components

### Task 7: Build ComponentPreview

**Files:**
- Create: `packages/web/src/components/ComponentPreview.tsx`
- Create: `packages/web/src/components/ViewportSelector.tsx`

Shows the selected component's HTML/CSS in an iframe:
- Title bar with component name + status
- Viewport size controls (375px / 768px / 1280px)
- Iframe rendering with Tailwind CDN (reuse PagePreview pattern)
- Export buttons (HTML, PNG, clipboard)
- Empty state when nothing selected

### Task 8: Build AgenticChat

**Files:**
- Create: `packages/web/src/components/AgenticChat.tsx`

Evolved from `RightPanel`. Same chat UI but:
- Agent logs appear inline (no separate StatusBar)
- Mode toggle (simple/ultrathink)
- Input area with send button
- Session persistence (reuse existing)

### Task 9: Rewrite App.tsx + TopBar + exports

**Files:**
- Rewrite: `packages/web/src/App.tsx`
- Modify: `packages/web/src/components/layout/TopBar.tsx`
- Create: `packages/web/src/utils/export.ts` (new, no tldraw)
- Modify: `packages/web/src/utils/session-persistence.ts`

App.tsx: Three-column layout:
- Left: AgenticChat (resizable width)
- Center: ComponentList (fixed ~200px)
- Right: ComponentPreview (flex-1)
- No StatusBar, no tldraw

TopBar: Remove editor prop, remove tldraw-based export, simplified.

Export utils: Simple HTML/clipboard export from component data (no tldraw).

Session persistence: Remove TLDRAW_ cleanup, keep chat persistence.

## Wave 4: Integration + cleanup

### Task 10: Wire everything together + type-check

- Delete leftover layout files: `LeftSidebar.tsx`, `RightPanel.tsx`
- Update component barrel exports
- Run `pnpm type-check` and fix all errors
- Run `pnpm build` to verify
- Run backend tests: `cd packages/api && bun test`

## Commit Strategy

- Commit after Wave 1 (shared types)
- Commit after Wave 2 (backend + tldraw removal)
- Commit after Wave 3+4 (new frontend + wiring)
