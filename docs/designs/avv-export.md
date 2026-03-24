# Export — PNG, HTML, Clipboard, and Figma-Ready Formats

## Context

After pages are generated (FAU-45), users need to get their work out of AVV. This doc adds export capabilities: download the assembled page as HTML, capture a PNG screenshot (importable into Figma), copy section HTML to clipboard, and export as SVG that Figma can paste.

### Export options (V2):
1. **Download HTML** — full assembled page as a standalone `.html` file
2. **Screenshot PNG** — capture the page as an image (Figma can import images)
3. **Copy HTML to clipboard** — copy a section's or full page's HTML
4. **Export SVG** — render page as SVG (Figma can paste SVG directly)

### Why not direct Figma API?
Figma's REST API is read-mostly — there's no "create file from HTML" endpoint. Creating Figma nodes programmatically requires a [Figma plugin](https://developers.figma.com/docs/plugins/), which is a separate project (V3). For now, PNG and SVG are the practical Figma import paths.

## Requirements

- Export menu in the TopBar with options: HTML, PNG, Copy HTML, SVG
- HTML export: download a self-contained `.html` file with Tailwind CDN
- PNG export: capture the page iframe as a PNG image
- Copy HTML: copy the raw stitched HTML to clipboard
- SVG export: convert the page to SVG for Figma import
- All exports operate on the currently selected page shape
- Show toast notification on successful copy/download

## Implementation

### Export utility functions

File: `packages/web/src/utils/export.ts`

```typescript
import { AVV_PAGE_TYPE, parseSections, type AVVPageProps } from "../canvas/shapes";
import type { Editor } from "tldraw";

/**
 * Get the stitched HTML for the selected page.
 */
function getPageHtml(editor: Editor): { title: string; html: string; css: string } | null {
  const selected = editor.getSelectedShapes();
  const pageShape = selected.find((s) => s.type === AVV_PAGE_TYPE);

  if (!pageShape) {
    // Try first page shape on canvas
    const allShapes = editor.getCurrentPageShapes();
    const firstPage = allShapes.find((s) => s.type === AVV_PAGE_TYPE);
    if (!firstPage) return null;

    const props = firstPage.props as AVVPageProps;
    const sections = parseSections(props.sectionsJson);
    return buildPageContent(props.title, sections);
  }

  const props = pageShape.props as AVVPageProps;
  const sections = parseSections(props.sectionsJson);
  return buildPageContent(props.title, sections);
}

function buildPageContent(title: string, sections: Array<{ order: number; html: string; css: string; status: string; name: string }>) {
  const readySections = sections
    .filter((s) => s.status === "ready" && s.html)
    .sort((a, b) => a.order - b.order);

  const html = readySections.map((s) =>
    `<!-- ${s.name} -->\n<section>${s.html}</section>`
  ).join("\n\n");

  const css = readySections
    .filter((s) => s.css)
    .map((s) => s.css)
    .join("\n");

  return { title, html, css };
}

/**
 * Download as standalone HTML file.
 */
export function exportAsHtml(editor: Editor): void {
  const page = getPageHtml(editor);
  if (!page) {
    alert("No page to export. Generate a page first.");
    return;
  }

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${page.title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
    ${page.css}
  </style>
</head>
<body>
${page.html}
</body>
</html>`;

  const blob = new Blob([fullHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(page.title)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Copy raw HTML to clipboard.
 */
export async function copyHtmlToClipboard(editor: Editor): Promise<boolean> {
  const page = getPageHtml(editor);
  if (!page) return false;

  try {
    await navigator.clipboard.writeText(page.html);
    return true;
  } catch {
    return false;
  }
}

/**
 * Export page as PNG screenshot.
 * Uses tldraw's built-in exportToBlob for the selected shape.
 */
export async function exportAsPng(editor: Editor): Promise<void> {
  const allShapes = editor.getCurrentPageShapes();
  const pageShape = allShapes.find((s) => s.type === AVV_PAGE_TYPE);
  if (!pageShape) {
    alert("No page to export.");
    return;
  }

  try {
    // Use tldraw's built-in export
    const shapeIds = [pageShape.id];
    const blob = await editor.toImage(shapeIds, {
      format: "png",
      background: true,
      padding: 0,
      scale: 2,
    });

    if (!blob) {
      alert("Failed to export PNG.");
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify((pageShape.props as AVVPageProps).title)}.png`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("[Export] PNG failed:", err);
    alert("PNG export failed. The page may still be generating.");
  }
}

/**
 * Export page as SVG (paste-able into Figma).
 */
export async function exportAsSvg(editor: Editor): Promise<void> {
  const allShapes = editor.getCurrentPageShapes();
  const pageShape = allShapes.find((s) => s.type === AVV_PAGE_TYPE);
  if (!pageShape) {
    alert("No page to export.");
    return;
  }

  try {
    const shapeIds = [pageShape.id];
    const blob = await editor.toImage(shapeIds, {
      format: "svg",
      background: true,
      padding: 0,
    });

    if (!blob) {
      alert("Failed to export SVG.");
      return;
    }

    // Copy SVG to clipboard for Figma paste
    const svgText = await blob.text();
    await navigator.clipboard.writeText(svgText);
    return;
  } catch (err) {
    console.error("[Export] SVG failed:", err);
    alert("SVG export failed.");
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    || "avv-export";
}
```

### Export menu in TopBar

File: `packages/web/src/components/layout/TopBar.tsx` — add export dropdown:

```typescript
import { useState, useRef, useEffect } from "react";
import type { Editor } from "tldraw";
import { exportAsHtml, exportAsPng, exportAsSvg, copyHtmlToClipboard } from "../../utils/export";

interface TopBarProps {
  isConnected: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  leftOpen: boolean;
  rightOpen: boolean;
  editor: Editor | null;
}

// Add export dropdown state and menu:
const [exportOpen, setExportOpen] = useState(false);
const [toast, setToast] = useState<string | null>(null);
const exportRef = useRef<HTMLDivElement>(null);

// Close on outside click
useEffect(() => {
  const handler = (e: MouseEvent) => {
    if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
      setExportOpen(false);
    }
  };
  document.addEventListener("mousedown", handler);
  return () => document.removeEventListener("mousedown", handler);
}, []);

const showToast = (msg: string) => {
  setToast(msg);
  setTimeout(() => setToast(null), 2000);
};

// In the JSX, add between connection indicator and panel toggles:
<div ref={exportRef} className="relative">
  <button
    onClick={() => setExportOpen(!exportOpen)}
    className="p-2 rounded text-stone-400 hover:text-stone-700 transition-colors"
    title="Export"
  >
    <span className="material-symbols-outlined text-lg">download</span>
  </button>

  {exportOpen && editor && (
    <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-xl border border-stone-200 py-1 z-50">
      <button
        onClick={() => { exportAsHtml(editor); setExportOpen(false); showToast("HTML downloaded"); }}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50 transition-colors"
      >
        <span className="material-symbols-outlined text-sm text-stone-400">code</span>
        <div>
          <p className="text-xs font-semibold text-stone-700">Download HTML</p>
          <p className="text-[10px] text-stone-400">Standalone .html file</p>
        </div>
      </button>
      <button
        onClick={async () => { await exportAsPng(editor); setExportOpen(false); showToast("PNG downloaded"); }}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50 transition-colors"
      >
        <span className="material-symbols-outlined text-sm text-stone-400">image</span>
        <div>
          <p className="text-xs font-semibold text-stone-700">Download PNG</p>
          <p className="text-[10px] text-stone-400">2x resolution screenshot</p>
        </div>
      </button>
      <div className="border-t border-stone-100 my-1" />
      <button
        onClick={async () => {
          const ok = await copyHtmlToClipboard(editor);
          setExportOpen(false);
          showToast(ok ? "HTML copied to clipboard" : "Copy failed");
        }}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50 transition-colors"
      >
        <span className="material-symbols-outlined text-sm text-stone-400">content_copy</span>
        <div>
          <p className="text-xs font-semibold text-stone-700">Copy HTML</p>
          <p className="text-[10px] text-stone-400">Raw HTML to clipboard</p>
        </div>
      </button>
      <button
        onClick={async () => { await exportAsSvg(editor); setExportOpen(false); showToast("SVG copied — paste in Figma"); }}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50 transition-colors"
      >
        <span className="material-symbols-outlined text-sm text-stone-400">design_services</span>
        <div>
          <p className="text-xs font-semibold text-stone-700">Copy SVG for Figma</p>
          <p className="text-[10px] text-stone-400">Paste directly into Figma</p>
        </div>
      </button>
    </div>
  )}
</div>

{/* Toast notification */}
{toast && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-800 text-white px-4 py-2 rounded-lg text-xs font-[Public_Sans] z-50 shadow-lg animate-fade-in">
    {toast}
  </div>
)}
```

### Pass editor to TopBar

File: `packages/web/src/App.tsx` — update TopBar props:

```typescript
<TopBar
  isConnected={isConnected}
  onToggleLeft={() => setLeftOpen(!leftOpen)}
  onToggleRight={() => setRightOpen(!rightOpen)}
  leftOpen={leftOpen}
  rightOpen={rightOpen}
  editor={editor}
/>
```

## Testing Strategy

```bash
# 1. Generate a page with all sections complete
# 2. Click download icon in TopBar → export menu appears

# Test HTML export:
# 3. Click "Download HTML" → .html file downloads
# 4. Open the file in a browser → page renders with Tailwind
# 5. All sections visible in order

# Test PNG export:
# 6. Click "Download PNG" → .png file downloads
# 7. Open PNG → 2x resolution screenshot of the page
# 8. Import into Figma → image appears

# Test Copy HTML:
# 9. Click "Copy HTML" → toast says "HTML copied"
# 10. Paste in a code editor → raw HTML appears

# Test SVG for Figma:
# 11. Click "Copy SVG for Figma" → toast says "SVG copied"
# 12. Open Figma → Ctrl+V → page appears as vector objects
```

## Out of Scope

- Export to React/Next.js components (V3)
- Figma plugin for proper node creation (V3)
- Penpot export via MCP (V3)
- Export with custom design tokens
- Batch export (multiple pages at once)

Sources:
- [Figma REST API](https://developers.figma.com/docs/rest-api/)
- [Figma Plugin API](https://www.figma.com/plugin-docs/api/figma/)
