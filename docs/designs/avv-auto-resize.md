# Auto-Resize — Dynamic Shape Height from Content

## Context

After the page model refactor (FAU-45), page shapes have a fixed height (600px). But the actual HTML content may be taller or shorter. Like Figma's auto-layout, the shape should automatically resize to match its content height. This means:

- When generation completes, the shape grows to fit all sections
- When a section is iterated, the shape adjusts if content height changes
- The iframe body's scrollHeight drives the shape's `h` prop

### V1 problem: Fixed `h: 600` clips tall pages or wastes space on short ones.

## Requirements

- Iframe measures its content height via `postMessage` after rendering
- Shape's `h` prop updates to match content height + title bar (36px)
- Measurement triggers after: initial render, section update, iteration
- Debounced to avoid rapid re-renders during generation
- Minimum height: 200px (prevent collapse)
- Width stays user-controlled (manual resize)

## Implementation

### Iframe height reporting script

The iframe injects a script that reports its `document.body.scrollHeight` via `postMessage` after every render. The parent listens and updates the shape.

File: `packages/web/src/canvas/shapes/avv-page/PagePreview.tsx` (replace entirely)

```typescript
import { useMemo, useEffect, useRef, useCallback } from "react";

interface PagePreviewProps {
  html: string;
  css: string;
  width: number;
  height: number;
  /** Called when iframe content height changes */
  onContentHeight?: (height: number) => void;
}

const TAILWIND_CDN = `<script src="https://cdn.tailwindcss.com"></script>`;

/**
 * Script injected into iframe that reports content height to parent.
 * Uses ResizeObserver on <body> to detect height changes.
 * Reports via postMessage with a unique channel key.
 */
const HEIGHT_REPORTER_SCRIPT = `
<script>
(function() {
  var reported = 0;
  function report() {
    var h = document.body.scrollHeight;
    if (h !== reported && h > 0) {
      reported = h;
      window.parent.postMessage({ type: 'avv-iframe-height', height: h }, '*');
    }
  }
  // Report after initial paint
  if (document.readyState === 'complete') {
    setTimeout(report, 100);
  } else {
    window.addEventListener('load', function() { setTimeout(report, 100); });
  }
  // Report on resize (Tailwind CDN loads async and may reflow)
  new ResizeObserver(report).observe(document.body);
  // Fallback polling for Tailwind CDN async load
  var attempts = 0;
  var poll = setInterval(function() {
    report();
    attempts++;
    if (attempts > 20) clearInterval(poll);
  }, 200);
})();
</script>`;

export function PagePreview({ html, css, width, height, onContentHeight }: PagePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
  <body>${html}${HEIGHT_REPORTER_SCRIPT}</body>
</html>`,
    [html, css]
  );

  // Listen for height messages from this iframe
  useEffect(() => {
    if (!onContentHeight) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "avv-iframe-height" && typeof event.data.height === "number") {
        onContentHeight(event.data.height);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onContentHeight]);

  return (
    <iframe
      ref={iframeRef}
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

### Auto-resize hook

File: `packages/web/src/canvas/hooks/useAutoResize.ts`

```typescript
import { useCallback, useRef } from "react";
import type { Editor } from "tldraw";
import { AVV_PAGE_TYPE } from "../shapes";

const TITLE_BAR_HEIGHT = 36;
const MIN_HEIGHT = 200;
const DEBOUNCE_MS = 150;

/**
 * Hook that handles auto-resizing page shapes based on iframe content height.
 * Returns a callback to pass as `onContentHeight` to PagePreview.
 */
export function useAutoResize(editor: Editor | null, shapeId: string | null) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleContentHeight = useCallback(
    (contentHeight: number) => {
      if (!editor || !shapeId) return;

      // Debounce rapid updates during generation
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        const shape = editor.getShape(shapeId as any);
        if (!shape || shape.type !== AVV_PAGE_TYPE) return;

        const targetH = Math.max(MIN_HEIGHT, contentHeight + TITLE_BAR_HEIGHT);
        const currentH = (shape.props as any).h as number;

        // Only resize if difference is significant (>10px) to avoid jitter
        if (Math.abs(targetH - currentH) > 10) {
          editor.updateShape({
            id: shape.id,
            type: AVV_PAGE_TYPE,
            props: { h: targetH },
          });
        }
      }, DEBOUNCE_MS);
    },
    [editor, shapeId]
  );

  return { handleContentHeight };
}
```

### Wire auto-resize into the page shape

File: `packages/web/src/canvas/shapes/avv-page/AVVPageShapeUtil.tsx` — update the `component` method:

The shape util needs to call `onContentHeight` from the `PagePreview`. Since tldraw shape `component()` methods render as pure React, we use the `useEditor` hook to get the editor instance and update the shape from within:

```typescript
import { useEditor } from "tldraw";
import { useCallback, useRef } from "react";

// Inside the component() method:
component(shape: AVVPageShape) {
  const editor = useEditor();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { w, h, title, status, sectionsJson } = shape.props;
  const sections = parseSections(sectionsJson);

  // ... same stitching logic ...

  const handleContentHeight = useCallback((contentHeight: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const TITLE_BAR_HEIGHT = 36;
      const MIN_HEIGHT = 200;
      const targetH = Math.max(MIN_HEIGHT, contentHeight + TITLE_BAR_HEIGHT);
      if (Math.abs(targetH - h) > 10) {
        editor.updateShape({
          id: shape.id,
          type: AVV_PAGE_TYPE,
          props: { h: targetH },
        });
      }
    }, 150);
  }, [editor, shape.id, h]);

  return (
    <HTMLContainer ...>
      <PageStatusBar ... />
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {sections.length > 0 ? (
          <PagePreview
            html={stitchedHtml}
            css={stitchedCss}
            width={w}
            height={h - 36}
            onContentHeight={handleContentHeight}
          />
        ) : (
          // ... placeholder ...
        )}
      </div>
    </HTMLContainer>
  );
}
```

### Remove overflow: hidden from page container

In `AVVPageShapeUtil.tsx`, change the HTMLContainer style:

```typescript
// Change overflow from "hidden" to "visible" on the preview div
// so the shape grows and content is never clipped
<div style={{ flex: 1, position: "relative", overflow: "auto" }}>
```

And change the iframe `height` to `auto` once content height is known — or better, just let the outer container use the shape's `h` prop which auto-updates.

## Testing Strategy

```bash
# 1. Generate a page with 5-7 sections
# 2. Watch the shape height grow as sections complete
# 3. Final shape height should exactly fit the content (no scrollbar, no empty space)
# 4. Iterate on a section (e.g., "make the hero taller")
# 5. Shape height adjusts after iteration completes
# 6. Manually resize width — height stays auto-managed
# 7. Minimum height: create a page with just 1 tiny section
#    → shape should be at least 200px tall
```

## Out of Scope

- Horizontal auto-resize (width stays user-controlled)
- Responsive preview (showing mobile/tablet widths)
- Zoom-to-content on first render (handled by `zoomToFit` in canvas sync)
