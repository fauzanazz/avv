# Error Retry — Section-Level Retry

## Context

After the page model refactor (FAU-45), when a builder agent fails on a section, that section shows "error" status but there's no way to retry it. The user must re-generate the entire page. This doc adds a retry mechanism for individual failed sections.

## Requirements

- Failed sections show a retry button in the layers panel and on the canvas shape
- Clicking retry re-runs the builder agent for just that section
- New WebSocket message type: `retry` (client → server)
- Backend re-spawns a single builder with the original section plan
- Retry count tracked per section (max 3 retries)
- Visual indicator of retry count on failed sections

## Implementation

### New ClientMessage type

File: `packages/shared/src/types/ws.ts` — add to `ClientMessage`:

```typescript
  | { type: "retry"; pageId: string; sectionId: string }
```

### Store section plans for retry

The orchestrator needs to store the original `SectionPlan` data so retries can re-use the design guidance. Add a plan store.

File: `packages/api/src/store/plan-store.ts`

```typescript
import type { SectionPlan } from "@avv/shared";

/** Maps pageId -> sectionId -> SectionPlan for retry purposes */
class PlanStore {
  private plans = new Map<string, Map<string, SectionPlan>>();

  save(pageId: string, sectionId: string, plan: SectionPlan): void {
    if (!this.plans.has(pageId)) {
      this.plans.set(pageId, new Map());
    }
    this.plans.get(pageId)!.set(sectionId, plan);
  }

  get(pageId: string, sectionId: string): SectionPlan | undefined {
    return this.plans.get(pageId)?.get(sectionId);
  }

  deletePage(pageId: string): void {
    this.plans.delete(pageId);
  }
}

export const planStore = new PlanStore();
```

### Update store barrel export

File: `packages/api/src/store/index.ts` — add:

```typescript
export { planStore } from "./plan-store";
```

### Save plans during orchestration

File: `packages/api/src/agents/orchestrator.ts` — after creating sections, save plans:

```typescript
import { planStore } from "../store";

// After Step 2 (creating page with sections), save each plan:
for (const sectionPlan of plan.sections) {
  const section = sections.find((s) => s.name === sectionPlan.name);
  if (section) {
    planStore.save(pageId, section.id, sectionPlan);
  }
}
```

### Retry handler

File: `packages/api/src/agents/retrier.ts`

```typescript
import { query, createSdkMcpServer, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { connectionStore } from "../store";
import { planStore } from "../store";
import { loadPrompt } from "./prompt-loader";
import { submitComponentTool } from "./tools/submit-component";
import { extractComponentResult } from "./component-collector";

const MAX_RETRIES = 3;
/** Track retry counts: sectionId -> count */
const retryCounts = new Map<string, number>();

export interface RetryOptions {
  sessionId: string;
  pageId: string;
  sectionId: string;
}

export async function retrySection({ sessionId, pageId, sectionId }: RetryOptions): Promise<void> {
  // Check retry limit
  const currentCount = retryCounts.get(sectionId) ?? 0;
  if (currentCount >= MAX_RETRIES) {
    connectionStore.broadcast(sessionId, {
      type: "error",
      message: `Max retries (${MAX_RETRIES}) reached for this section. Try iterating instead.`,
    });
    return;
  }
  retryCounts.set(sectionId, currentCount + 1);

  // Get the original plan
  const sectionPlan = planStore.get(pageId, sectionId);
  if (!sectionPlan) {
    connectionStore.broadcast(sessionId, {
      type: "error",
      message: "Cannot retry — original plan not found. Re-generate the full page.",
    });
    return;
  }

  connectionStore.broadcast(sessionId, {
    type: "section:status",
    pageId,
    sectionId,
    status: "generating",
  });

  connectionStore.broadcast(sessionId, {
    type: "agent:log",
    agentId: "retrier",
    message: `Retrying "${sectionPlan.name}" (attempt ${currentCount + 1}/${MAX_RETRIES})...`,
  });

  const builderPrompt = loadPrompt("builder");
  const mcpServer = createSdkMcpServer({
    name: "avv-tools",
    tools: [submitComponentTool],
  });

  const collectedMessages: SDKMessage[] = [];

  try {
    for await (const message of query({
      prompt: `Build the "${sectionPlan.name}" section for a web page.

**Description:** ${sectionPlan.description}
**Design guidance:** ${sectionPlan.designGuidance}

This is a retry attempt. The previous generation failed. Please generate clean, working HTML.

Instructions:
1. Generate beautiful, modern HTML using Tailwind CSS utility classes
2. Call mcp__avv-tools__submit_component with your result (name, html, css)
3. Use real-sounding content, not placeholders
4. The section must be self-contained HTML that renders in an iframe`,
      options: {
        systemPrompt: builderPrompt,
        allowedTools: ["mcp__avv-tools__submit_component"],
        mcpServers: { "avv-tools": mcpServer },
        maxTurns: 5,
      },
    })) {
      collectedMessages.push(message);
    }

    const result = extractComponentResult(collectedMessages);
    if (result) {
      connectionStore.broadcast(sessionId, {
        type: "section:updated",
        pageId,
        sectionId,
        updates: {
          html: result.html,
          css: result.css,
          status: "ready",
        },
      });
      connectionStore.broadcast(sessionId, {
        type: "agent:log",
        agentId: "retrier",
        message: `"${sectionPlan.name}" retry succeeded.`,
      });
    } else {
      connectionStore.broadcast(sessionId, {
        type: "section:status",
        pageId,
        sectionId,
        status: "error",
      });
    }
  } catch (err) {
    console.error(`[Retrier] Failed:`, err);
    connectionStore.broadcast(sessionId, {
      type: "section:status",
      pageId,
      sectionId,
      status: "error",
    });
  }
}
```

### Wire retry into WebSocket handler

File: `packages/api/src/ws.ts` — add retry case:

```typescript
import { retrySection } from "./agents/retrier";

case "retry": {
  const sid = ws.data.sessionId;
  if (!sid) {
    connectionStore.send(ws, { type: "error", message: "No active session" });
    break;
  }

  retrySection({
    sessionId: sid,
    pageId: msg.pageId,
    sectionId: msg.sectionId,
  }).catch((err) => {
    console.error("[Retry] Failed:", err);
    connectionStore.send(ws, { type: "error", message: "Retry failed" });
  });
  break;
}
```

### Retry button in Left Sidebar (layers)

File: `packages/web/src/components/layout/LeftSidebar.tsx` — add retry button to failed sections:

```typescript
// In the section button, add a retry icon for error status:
{section.status === "error" && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onRetry(page.shapeId, section.id);
    }}
    className="ml-auto text-red-400 hover:text-red-600 transition-colors"
    title="Retry this section"
  >
    <span className="material-symbols-outlined text-xs">refresh</span>
  </button>
)}
```

Add `onRetry` prop to LeftSidebar:

```typescript
interface LeftSidebarProps {
  editor: Editor | null;
  onClose: () => void;
  onRetry: (pageShapeId: TLShapeId, sectionId: string) => void;
}
```

### Wire retry from App.tsx

In App.tsx, pass the retry handler to LeftSidebar:

```typescript
const handleRetry = useCallback(
  (pageShapeId: TLShapeId, sectionId: string) => {
    if (!editor) return;
    const shape = editor.getShape(pageShapeId);
    if (!shape) return;

    // We need the pageId (server-side ID), not tldraw shapeId.
    // For now, use the shape to get pageId from the reverse map in useCanvasSync
    // or broadcast the retry with what we have.
    send({
      type: "retry",
      pageId: pageShapeId, // The canvas sync maps these
      sectionId,
    });
  },
  [editor, send]
);

<LeftSidebar editor={editor} onClose={() => setLeftOpen(false)} onRetry={handleRetry} />
```

### Visual retry indicator in page shape

In `AVVPageShapeUtil.tsx`, the section placeholder for error status shows retry info:

```typescript
// In the stitchedHtml for error sections:
return `<section data-section-id="${s.id}" style="padding:40px;text-align:center;color:#ef4444;font-family:system-ui;background:#fef2f2;border-bottom:1px dashed #fecaca;">
  <div style="font-size:14px">❌ Failed — ${s.name}</div>
  <div style="font-size:11px;color:#f87171;margin-top:4px">Click retry in the layers panel</div>
</section>`;
```

## Testing Strategy

```bash
# 1. Generate a page (some sections may fail naturally due to agent timeouts)
# 2. If no failures, simulate one by stopping the API mid-generation
# 3. Failed section shows error in layers panel with refresh icon
# 4. Click retry icon → section status changes to "generating"
# 5. On success: section HTML appears, status turns "ready"
# 6. Retry up to 3 times → after 3rd failure, error message says "max retries"

# Type check
pnpm type-check
```

## Out of Scope

- Automatic retry (agent decides to retry without user action)
- Retry all failed sections at once (batch retry)
- Configurable retry limit
- Different builder model on retry (e.g., upgrade to opus)
