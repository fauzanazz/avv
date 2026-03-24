# AVV Canvas Core — Custom Component Shape

## Context

With the monorepo scaffolded (avv-scaffold / FAU-33), we need to implement the core canvas experience. Each AI-generated UI component renders as a custom tldraw shape that displays a live HTML preview inside a sandboxed iframe. Users can select, move, and resize these components on the infinite canvas.

## Requirements

- Define a custom `avv-component` tldraw shape with properties: name, status, html, css, prompt, agentId, iteration
- Render each component as a sandboxed iframe showing the generated HTML/CSS
- Show a status overlay (spinner for "generating", error icon for "error")
- Support resize via tldraw's built-in resize handling
- Show component name as a label above the shape
- Register the custom shape with the tldraw editor

## Implementation

### Custom shape type declaration

File: `packages/web/src/canvas/shapes/avv-component/avv-component-types.ts`

```typescript
import type { TLShape } from "tldraw";

export const AVV_COMPONENT_TYPE = "avv-component" as const;

/** Extend tldraw's global shape props map */
declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [AVV_COMPONENT_TYPE]: AVVComponentProps;
  }
}

export interface AVVComponentProps {
  w: number;
  h: number;
  name: string;
  status: "pending" | "generating" | "ready" | "error";
  html: string;
  css: string;
  prompt: string;
  agentId: string;
  iteration: number;
}

export type AVVComponentShape = TLShape<typeof AVV_COMPONENT_TYPE>;
```

### Shape util

File: `packages/web/src/canvas/shapes/avv-component/AVVComponentShapeUtil.tsx`

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
  AVV_COMPONENT_TYPE,
  type AVVComponentShape,
  type AVVComponentProps,
} from "./avv-component-types";
import { ComponentPreview } from "./ComponentPreview";
import { ComponentStatusOverlay } from "./ComponentStatusOverlay";

export class AVVComponentShapeUtil extends ShapeUtil<AVVComponentShape> {
  static override type = AVV_COMPONENT_TYPE;

  static override props: RecordProps<AVVComponentShape> = {
    w: T.number,
    h: T.number,
    name: T.string,
    status: T.string,
    html: T.string,
    css: T.string,
    prompt: T.string,
    agentId: T.string,
    iteration: T.number,
  };

  getDefaultProps(): AVVComponentProps {
    return {
      w: 400,
      h: 300,
      name: "Untitled Component",
      status: "pending",
      html: "",
      css: "",
      prompt: "",
      agentId: "",
      iteration: 0,
    };
  }

  override canEdit(): boolean {
    return false;
  }

  override canResize(): boolean {
    return true;
  }

  override isAspectRatioLocked(): boolean {
    return false;
  }

  getGeometry(shape: AVVComponentShape): Geometry2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(shape: AVVComponentShape, info: TLResizeInfo<AVVComponentShape>) {
    return resizeBox(shape, info);
  }

  component(shape: AVVComponentShape) {
    const { w, h, name, status, html, css } = shape.props;

    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          display: "flex",
          flexDirection: "column",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          pointerEvents: "all",
        }}
      >
        {/* Component label bar */}
        <div
          style={{
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 600,
            color: "#475569",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span>{name}</span>
          <ComponentStatusOverlay status={status} />
        </div>

        {/* HTML preview area */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {status === "ready" && html ? (
            <ComponentPreview html={html} css={css} width={w} height={h - 32} />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "#94a3b8",
                fontSize: 14,
              }}
            >
              {status === "pending" && "Waiting..."}
              {status === "generating" && "Generating..."}
              {status === "error" && "Generation failed"}
            </div>
          )}
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape: AVVComponentShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />;
  }
}
```

### Iframe preview component

File: `packages/web/src/canvas/shapes/avv-component/ComponentPreview.tsx`

```typescript
import { useRef, useEffect } from "react";

interface ComponentPreviewProps {
  html: string;
  css: string;
  width: number;
  height: number;
}

/**
 * Renders generated HTML/CSS in a sandboxed iframe.
 * The iframe is completely isolated — no script execution, no parent access.
 */
export function ComponentPreview({ html, css, width, height }: ComponentPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: system-ui, -apple-system, sans-serif; overflow: hidden; }
            ${css}
          </style>
        </head>
        <body>${html}</body>
      </html>
    `);
    doc.close();
  }, [html, css]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      style={{
        width,
        height,
        border: "none",
        pointerEvents: "none",
      }}
      title="Component Preview"
    />
  );
}
```

### Status overlay component

File: `packages/web/src/canvas/shapes/avv-component/ComponentStatusOverlay.tsx`

```typescript
interface ComponentStatusOverlayProps {
  status: "pending" | "generating" | "ready" | "error";
}

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "#94a3b8", dot: "#cbd5e1" },
  generating: { label: "Generating", color: "#3b82f6", dot: "#3b82f6" },
  ready: { label: "Ready", color: "#22c55e", dot: "#22c55e" },
  error: { label: "Error", color: "#ef4444", dot: "#ef4444" },
} as const;

export function ComponentStatusOverlay({ status }: ComponentStatusOverlayProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: config.color,
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: config.dot,
          animation: status === "generating" ? "pulse 1.5s infinite" : "none",
        }}
      />
      {config.label}
    </div>
  );
}
```

### Shape barrel export

File: `packages/web/src/canvas/shapes/avv-component/index.ts`

```typescript
export { AVVComponentShapeUtil } from "./AVVComponentShapeUtil";
export { AVV_COMPONENT_TYPE } from "./avv-component-types";
export type { AVVComponentShape, AVVComponentProps } from "./avv-component-types";
```

File: `packages/web/src/canvas/shapes/index.ts`

```typescript
export { AVVComponentShapeUtil, AVV_COMPONENT_TYPE } from "./avv-component";
export type { AVVComponentShape, AVVComponentProps } from "./avv-component";
```

### Updated App.tsx — register custom shape

File: `packages/web/src/App.tsx` (replace existing)

```typescript
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { AVVComponentShapeUtil, AVV_COMPONENT_TYPE } from "./canvas/shapes";

const customShapeUtils = [AVVComponentShapeUtil];

function handleMount(editor: Editor) {
  // Create a sample component to verify the shape works
  editor.createShape({
    type: AVV_COMPONENT_TYPE,
    x: 100,
    y: 100,
    props: {
      w: 400,
      h: 300,
      name: "Hero Section",
      status: "ready" as const,
      html: '<div style="padding:40px;text-align:center"><h1 style="font-size:32px;font-weight:bold;margin-bottom:16px">Welcome to AVV</h1><p style="font-size:16px;color:#64748b">AI Visual Vibe Engineer</p></div>',
      css: "",
      prompt: "A hero section for AVV",
      agentId: "demo",
      iteration: 0,
    },
  });
}

export function App() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw shapeUtils={customShapeUtils} onMount={handleMount} />
    </div>
  );
}
```

### Add pulse animation to global styles

File: `packages/web/src/app.css` (replace existing)

```css
@import "tailwindcss";

html, body, #root {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

## Testing Strategy

```bash
# Start dev server
pnpm dev

# Open http://localhost:5173 in browser
# Expected:
# 1. tldraw canvas loads with pan/zoom
# 2. A "Hero Section" component shape is visible at (100, 100)
# 3. The shape shows a label bar with "Hero Section" and a green "Ready" status dot
# 4. The body renders "Welcome to AVV" heading inside an iframe preview
# 5. The shape can be selected, moved, and resized
# 6. The iframe content scales when the shape is resized

# Type check
pnpm type-check
# Expected: no errors
```

## Out of Scope

- WebSocket integration for live updates (avv-agent-canvas-bridge)
- Context menu / right-click iteration (avv-component-iteration)
- Layers panel (avv-panels)
- Properties panel (avv-panels)
- Agent integration (avv-orchestrator-agent)
