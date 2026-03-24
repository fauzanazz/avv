# Refactor to Page/Section Data Model

## Context

V1 creates N separate tldraw shapes per generation (one per section: Nav, Hero, Features, etc.). This is wrong — a single page should be 1 shape on the canvas containing all sections rendered together in a single iframe, like how Figma has frames (screens) containing layers (sections).

### V1 problems this fixes:
- 7 scattered shapes instead of 1 cohesive page
- No way to see the full page assembled
- Sections rendered in isolation lose visual context with each other
- Layers panel is flat (no hierarchy)

### New model:
```
Canvas
  └── Page Shape (1 tldraw shape = 1 full page)
        ├── Section: Navigation    (data inside the shape)
        ├── Section: Hero          
        ├── Section: Features      
        ├── Section: Testimonials  
        └── Section: Footer        
```

The Page shape renders ALL sections stitched together in a single iframe. The Layers panel shows the page > section tree. Iteration targets individual sections by updating just that section's HTML within the full page.

## Requirements

- New `avv-page` tldraw shape type replaces `avv-component`
- Page shape stores an ordered array of sections (each with name, status, html, css)
- Single iframe renders all sections concatenated as one HTML document
- Orchestrator creates 1 page shape, builders fill sections in parallel
- When a builder finishes, its section HTML is patched into the page shape
- Layers panel shows hierarchical: Page > Section 1, Section 2, ...
- Section-level iteration: user selects a section in layers → iterates on just that section
- Remove the old `avv-component` shape type entirely

## Implementation

### New shared types

File: `packages/shared/src/types/canvas.ts` (replace entirely)

```typescript
export type ComponentStatus = "pending" | "generating" | "ready" | "error";

/** A section within a page (nav, hero, features, etc.) */
export interface PageSection {
  id: string;
  name: string;
  status: ComponentStatus;
  html: string;
  css: string;
  prompt: string;
  agentId: string;
  iteration: number;
  order: number;
}

/** A full page on the canvas — one tldraw shape */
export interface AVVPage {
  id: string;
  title: string;
  status: ComponentStatus;
  sections: PageSection[];
  prompt: string;
  mode: "simple" | "ultrathink";
  createdAt: string;
}

/** @deprecated — use AVVPage + PageSection instead */
export interface AVVComponent {
  id: string;
  name: string;
  status: ComponentStatus;
  html: string;
  css: string;
  thumbnail?: string;
  prompt: string;
  agentId: string;
  iteration: number;
  width: number;
  height: number;
  x: number;
  y: number;
}
```

### Updated WebSocket messages

File: `packages/shared/src/types/ws.ts` (replace entirely)

```typescript
import type { AVVPage, PageSection, ComponentStatus } from "./canvas";
import type { ImageResult } from "./agent";

/** Server -> Client WebSocket messages */
export type ServerMessage =
  // Page lifecycle
  | { type: "page:created"; page: AVVPage }
  | { type: "page:status"; pageId: string; status: ComponentStatus }
  // Section lifecycle
  | { type: "section:updated"; pageId: string; sectionId: string; updates: Partial<PageSection> }
  | { type: "section:status"; pageId: string; sectionId: string; status: ComponentStatus }
  // Agent activity
  | { type: "agent:log"; agentId: string; message: string }
  | { type: "agent:thinking"; agentId: string; thought: string }
  | { type: "agent:option"; agentId: string; optionId: string; title: string; description: string; previewHtml?: string }
  // Session
  | { type: "session:started"; sessionId: string }
  | { type: "generation:done"; sessionId: string }
  // Images
  | { type: "image:ready"; image: ImageResult }
  | { type: "image:generating"; requestId: string; sectionId: string }
  // Chat / UltraThink
  | { type: "ultrathink:question"; questionId: string; question: string; options?: string[] }
  | { type: "ultrathink:spec"; spec: string }
  | { type: "ultrathink:ready"; enrichedPrompt: string }
  // Errors
  | { type: "error"; message: string };

/** Client -> Server WebSocket messages */
export type ClientMessage =
  | { type: "generate"; prompt: string; mode: "simple" | "ultrathink" }
  | {
      type: "iterate";
      pageId: string;
      sectionId: string;
      sectionName: string;
      currentHtml: string;
      currentCss: string;
      instruction: string;
      iteration: number;
    }
  | { type: "ultrathink:answer"; questionId: string; answer: string }
  | { type: "ultrathink:confirm" }
  | { type: "cancel" };
```

### Updated agent types — remove x/y/width/height from ComponentPlan

File: `packages/shared/src/types/agent.ts` (replace entirely)

```typescript
/** A section in the orchestrator's decomposition plan */
export interface SectionPlan {
  name: string;
  description: string;
  htmlTag: string;
  order: number;
  designGuidance: string;
}

/** The full plan output by the orchestrator */
export interface DesignPlan {
  title: string;
  summary: string;
  sections: SectionPlan[];
}

/** Image generation request */
export interface ImageRequest {
  requestId: string;
  sectionId: string;
  pageId: string;
  description: string;
  width: number;
  height: number;
  style: "photo" | "illustration" | "icon" | "abstract";
}

/** Image generation result */
export interface ImageResult {
  requestId: string;
  sectionId: string;
  pageId: string;
  dataUri: string;
  width: number;
  height: number;
}
```

### New avv-page shape type

File: `packages/web/src/canvas/shapes/avv-page/avv-page-types.ts`

```typescript
import type { TLBaseShape } from "tldraw";
import type { ComponentStatus, PageSection } from "@avv/shared";

export const AVV_PAGE_TYPE = "avv-page" as const;

export interface AVVPageProps {
  w: number;
  h: number;
  title: string;
  status: ComponentStatus;
  /** JSON-serialized PageSection[] — tldraw props must be primitives */
  sectionsJson: string;
  prompt: string;
  mode: "simple" | "ultrathink";
}

export type AVVPageShape = TLBaseShape<typeof AVV_PAGE_TYPE, AVVPageProps>;

/** Helper to parse sections from the shape prop */
export function parseSections(json: string): PageSection[] {
  try {
    return JSON.parse(json) as PageSection[];
  } catch {
    return [];
  }
}

/** Helper to serialize sections into the shape prop */
export function serializeSections(sections: PageSection[]): string {
  return JSON.stringify(sections);
}
```

### Page shape util

File: `packages/web/src/canvas/shapes/avv-page/AVVPageShapeUtil.tsx`

```typescript
import {
  ShapeUtil,
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  T,
  type Geometry2d,
  type TLResizeInfo,
  type RecordProps,
} from "tldraw";
import {
  AVV_PAGE_TYPE,
  type AVVPageShape,
  type AVVPageProps,
  parseSections,
} from "./avv-page-types";
import { PagePreview } from "./PagePreview";
import { PageStatusBar } from "./PageStatusBar";

export class AVVPageShapeUtil extends ShapeUtil<AVVPageShape> {
  static override type = AVV_PAGE_TYPE;

  static override props: RecordProps<AVVPageShape> = {
    w: T.number,
    h: T.number,
    title: T.string,
    status: T.string,
    sectionsJson: T.string,
    prompt: T.string,
    mode: T.string,
  };

  getDefaultProps(): AVVPageProps {
    return {
      w: 800,
      h: 600,
      title: "Untitled Page",
      status: "pending",
      sectionsJson: "[]",
      prompt: "",
      mode: "simple",
    };
  }

  override canEdit = () => false;
  override canResize = () => true;
  override isAspectRatioLocked = () => false;

  getGeometry(shape: AVVPageShape): Geometry2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize = (shape: AVVPageShape, info: TLResizeInfo<AVVPageShape>) => {
    return resizeBox(shape, info);
  };

  component(shape: AVVPageShape) {
    const { w, h, title, status, sectionsJson } = shape.props;
    const sections = parseSections(sectionsJson);

    const allReady = sections.length > 0 && sections.every((s) => s.status === "ready");
    const anyGenerating = sections.some((s) => s.status === "generating");
    const readyCount = sections.filter((s) => s.status === "ready").length;

    // Stitch all ready sections into one HTML document
    const stitchedHtml = sections
      .sort((a, b) => a.order - b.order)
      .map((s) => {
        if (s.status === "ready" && s.html) {
          return `<section data-section-id="${s.id}" data-section-name="${s.name}">${s.html}</section>`;
        }
        return `<section data-section-id="${s.id}" data-section-name="${s.name}" style="padding:40px;text-align:center;color:#94a3b8;font-family:system-ui;background:#f8fafc;border-bottom:1px dashed #e2e8f0;">
          <div style="font-size:14px">${s.status === "generating" ? "⏳ Generating..." : s.status === "error" ? "❌ Failed" : "⏸ Pending..."} — ${s.name}</div>
        </section>`;
      })
      .join("\n");

    const stitchedCss = sections
      .filter((s) => s.css)
      .map((s) => s.css)
      .join("\n");

    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          display: "flex",
          flexDirection: "column",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          pointerEvents: "all",
        }}
      >
        {/* Page title bar */}
        <PageStatusBar
          title={title}
          readyCount={readyCount}
          totalCount={sections.length}
          isGenerating={anyGenerating}
          isAllReady={allReady}
        />

        {/* Stitched page preview */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {sections.length > 0 ? (
            <PagePreview html={stitchedHtml} css={stitchedCss} width={w} height={h - 36} />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "#94a3b8",
                fontSize: 14,
                fontFamily: "system-ui",
              }}
            >
              Waiting for generation...
            </div>
          )}
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape: AVVPageShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />;
  }
}
```

### Page preview (replaces ComponentPreview)

File: `packages/web/src/canvas/shapes/avv-page/PagePreview.tsx`

```typescript
import { useMemo } from "react";

interface PagePreviewProps {
  html: string;
  css: string;
  width: number;
  height: number;
}

const TAILWIND_CDN = `<script src="https://cdn.tailwindcss.com"></script>`;

/**
 * Renders the full stitched page HTML in a single iframe.
 * All sections are rendered together so they share visual context.
 */
export function PagePreview({ html, css, width, height }: PagePreviewProps) {
  const srcDoc = useMemo(
    () => `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${TAILWIND_CDN}
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
      section { width: 100%; }
      ${css}
    </style>
  </head>
  <body>${html}</body>
</html>`,
    [html, css]
  );

  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      style={{
        width,
        height,
        border: "none",
        pointerEvents: "none",
      }}
      title="Page Preview"
    />
  );
}
```

### Page status bar

File: `packages/web/src/canvas/shapes/avv-page/PageStatusBar.tsx`

```typescript
interface PageStatusBarProps {
  title: string;
  readyCount: number;
  totalCount: number;
  isGenerating: boolean;
  isAllReady: boolean;
}

export function PageStatusBar({ title, readyCount, totalCount, isGenerating, isAllReady }: PageStatusBarProps) {
  return (
    <div
      style={{
        padding: "8px 14px",
        fontSize: 12,
        fontWeight: 600,
        color: "#475569",
        background: "#f8fafc",
        borderBottom: "1px solid #e2e8f0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        height: 36,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {title}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, flexShrink: 0 }}>
        {isGenerating && (
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6", animation: "pulse 1.5s infinite" }} />
        )}
        <span style={{ color: isAllReady ? "#22c55e" : "#94a3b8" }}>
          {readyCount}/{totalCount} sections
        </span>
      </div>
    </div>
  );
}
```

### Shape barrel exports (replace old)

File: `packages/web/src/canvas/shapes/avv-page/index.ts`

```typescript
export { AVVPageShapeUtil } from "./AVVPageShapeUtil";
export { AVV_PAGE_TYPE, parseSections, serializeSections } from "./avv-page-types";
export type { AVVPageShape, AVVPageProps } from "./avv-page-types";
```

File: `packages/web/src/canvas/shapes/index.ts` (replace entirely)

```typescript
export { AVVPageShapeUtil, AVV_PAGE_TYPE, parseSections, serializeSections } from "./avv-page";
export type { AVVPageShape, AVVPageProps } from "./avv-page";
```

### Updated canvas sync — page model

File: `packages/web/src/hooks/useCanvasSync.ts` (replace entirely)

```typescript
import { useCallback, useRef } from "react";
import { createShapeId, type Editor, type TLShapeId } from "tldraw";
import type { ServerMessage, PageSection } from "@avv/shared";
import { AVV_PAGE_TYPE, type AVVPageProps, parseSections, serializeSections } from "../canvas/shapes";

/** Maps server page IDs to tldraw shape IDs */
type PageShapeMap = Map<string, TLShapeId>;

interface UseCanvasSyncReturn {
  handleMessage: (msg: ServerMessage) => void;
}

export function useCanvasSync(editor: Editor | null): UseCanvasSyncReturn {
  const pageMapRef = useRef<PageShapeMap>(new Map());

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      if (!editor) return;

      switch (msg.type) {
        case "page:created": {
          const page = msg.page;
          const shapeId = createShapeId();
          pageMapRef.current.set(page.id, shapeId);

          editor.createShape({
            id: shapeId,
            type: AVV_PAGE_TYPE,
            x: 100,
            y: 100,
            props: {
              w: 800,
              h: 600,
              title: page.title,
              status: page.status,
              sectionsJson: JSON.stringify(page.sections),
              prompt: page.prompt,
              mode: page.mode,
            } satisfies AVVPageProps,
          });
          break;
        }

        case "section:updated": {
          const shapeId = pageMapRef.current.get(msg.pageId);
          if (!shapeId) return;

          const shape = editor.getShape(shapeId);
          if (!shape) return;

          const props = shape.props as AVVPageProps;
          const sections = parseSections(props.sectionsJson);
          const idx = sections.findIndex((s) => s.id === msg.sectionId);
          if (idx === -1) return;

          sections[idx] = { ...sections[idx], ...msg.updates };

          // Derive page status from sections
          const allReady = sections.every((s) => s.status === "ready");
          const anyError = sections.some((s) => s.status === "error");

          editor.updateShape({
            id: shapeId,
            type: AVV_PAGE_TYPE,
            props: {
              sectionsJson: serializeSections(sections),
              status: allReady ? "ready" : anyError ? "error" : "generating",
            },
          });
          break;
        }

        case "section:status": {
          const shapeId = pageMapRef.current.get(msg.pageId);
          if (!shapeId) return;

          const shape = editor.getShape(shapeId);
          if (!shape) return;

          const props = shape.props as AVVPageProps;
          const sections = parseSections(props.sectionsJson);
          const idx = sections.findIndex((s) => s.id === msg.sectionId);
          if (idx === -1) return;

          sections[idx] = { ...sections[idx], status: msg.status };

          editor.updateShape({
            id: shapeId,
            type: AVV_PAGE_TYPE,
            props: { sectionsJson: serializeSections(sections) },
          });
          break;
        }

        case "page:status": {
          const shapeId = pageMapRef.current.get(msg.pageId);
          if (!shapeId) return;

          editor.updateShape({
            id: shapeId,
            type: AVV_PAGE_TYPE,
            props: { status: msg.status },
          });
          break;
        }

        case "generation:done": {
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

### Updated orchestrator — page model

File: `packages/api/src/agents/orchestrator.ts` — Key changes (update existing file):

1. Replace `"components"` with `"sections"` in the plan prompt
2. Create 1 page with sections instead of N components
3. Broadcast `page:created` once, then `section:updated` per builder

The orchestrator prompt to the LLM changes from creating components with x/y coordinates to creating sections with just order:

```typescript
// In orchestrate(), replace Step 2 (placeholder creation):

    // Step 2: Create a single page with pending sections
    const pageId = crypto.randomUUID();
    const sections: PageSection[] = plan.sections.map((s) => ({
      id: crypto.randomUUID(),
      name: s.name,
      status: "pending" as const,
      html: "",
      css: "",
      prompt: s.designGuidance,
      agentId: `builder-${s.order}`,
      iteration: 0,
      order: s.order,
    }));

    const page: AVVPage = {
      id: pageId,
      title: plan.title,
      status: "generating",
      sections,
      prompt: finalPrompt,
      mode,
      createdAt: new Date().toISOString(),
    };

    connectionStore.broadcast(sessionId, { type: "page:created", page });

    // Step 3: Spawn builders — each updates its section
    const buildPromises = plan.sections.map(async (sectionPlan) => {
      const section = sections.find((s) => s.name === sectionPlan.name)!;

      connectionStore.broadcast(sessionId, {
        type: "section:status",
        pageId,
        sectionId: section.id,
        status: "generating",
      });

      // ... builder query same as before, but on completion:
      // Broadcast section:updated instead of component:updated
      connectionStore.broadcast(sessionId, {
        type: "section:updated",
        pageId,
        sectionId: section.id,
        updates: {
          html: result.html,
          css: result.css,
          status: "ready",
        },
      });
    });
```

Also update the plan generation prompt: replace `"components"` key with `"sections"`, remove x/y/width/height fields, just use `name`, `description`, `htmlTag`, `order`, `designGuidance`.

### Updated orchestrator prompt

File: `packages/api/prompts/orchestrator.md` — Key change: remove all x/y/width/height references.

The plan output format becomes:
```json
{
  "title": "Page Title",
  "summary": "Design approach",
  "sections": [
    {
      "name": "Section Name",
      "description": "What this section does",
      "htmlTag": "section",
      "order": 0,
      "designGuidance": "Detailed design instructions"
    }
  ]
}
```

Remove all layout rules about canvas positioning, component sizing, gaps. The sections are rendered vertically in document flow — CSS handles layout, not canvas coordinates.

### Updated iterator — section-level

File: `packages/api/src/agents/iterator.ts` — Update `IterateOptions`:

```typescript
export interface IterateOptions {
  sessionId: string;
  pageId: string;
  sectionId: string;
  sectionName: string;
  currentHtml: string;
  currentCss: string;
  instruction: string;
  iteration: number;
}
```

On completion, broadcast `section:updated` instead of `component:updated`:

```typescript
connectionStore.broadcast(sessionId, {
  type: "section:updated",
  pageId: opts.pageId,
  sectionId: opts.sectionId,
  updates: {
    html: result.html,
    css: result.css,
    status: "ready",
    iteration: opts.iteration + 1,
  },
});
```

### Updated Layers panel — hierarchical

File: `packages/web/src/components/LayersPanel.tsx` — Key change: show page > section tree instead of flat list.

```typescript
// Instead of listing shapes, read the selected page shape's sectionsJson
// and display sections as indented children:

// Page: "SaaS Landing Page"
//   ├── ✅ Navigation
//   ├── ✅ Hero Section
//   ├── ⏳ Features Grid
//   ├── ⏸ Testimonials
//   └── ⏸ Footer

// Clicking a section scrolls the iframe to that section and stores
// selectedSectionId in state for the Properties panel and iteration.
```

The layers panel reads the `sectionsJson` prop from the selected page shape, parses it, and renders a tree. Clicking a section name stores `{ pageId, sectionId }` in app state for properties/iteration.

### Delete old avv-component shape

Delete the entire directory: `packages/web/src/canvas/shapes/avv-component/`

Files to delete:
- `packages/web/src/canvas/shapes/avv-component/avv-component-types.ts`
- `packages/web/src/canvas/shapes/avv-component/AVVComponentShapeUtil.tsx`
- `packages/web/src/canvas/shapes/avv-component/ComponentPreview.tsx`
- `packages/web/src/canvas/shapes/avv-component/ComponentStatusOverlay.tsx`
- `packages/web/src/canvas/shapes/avv-component/index.ts`

### Updated App.tsx — use AVVPageShapeUtil

Replace `AVVComponentShapeUtil` import with `AVVPageShapeUtil`:

```typescript
import { AVVPageShapeUtil } from "./canvas/shapes";
const customShapeUtils = [AVVPageShapeUtil];
```

Remove the `handleMount` demo shape creation (no longer relevant).

## Testing Strategy

```bash
# Start dev servers
pnpm dev

# 1. Open http://localhost:5173
# 2. Type "Landing page for a project management tool" → Simple mode → Generate
# 3. Expected: ONE shape appears on canvas (not 7 separate shapes)
# 4. The shape title bar shows "Project Management Landing" with "0/5 sections"
# 5. As builders complete, sections appear inside the shape one by one
# 6. Progress shows "1/5 sections", "2/5 sections", etc.
# 7. Final state: all sections rendered together as one cohesive page
# 8. Layers panel shows: Page > Nav, Hero, Features, Testimonials, Footer
# 9. Clicking a section in layers highlights it

# Type check
pnpm type-check
```

## Out of Scope

- Auto-resize based on content height (avv-auto-resize)
- Agentic chat conversation flow (avv-agentic-chat)
- Layout redesign (user will provide separately)
- Multi-page support (V2+)
