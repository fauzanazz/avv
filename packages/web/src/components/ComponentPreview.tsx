import { useMemo, useRef, useCallback } from "react";
import type { ViewerComponent, ComponentVariant } from "@avv/shared";

type Viewport = "mobile" | "tablet" | "desktop";

const VIEWPORT_WIDTHS: Record<Viewport, number> = {
  mobile: 375,
  tablet: 768,
  desktop: 1280,
};

const TAILWIND_CDN = `<script src="https://cdn.tailwindcss.com"><\/script>`;
const CSP = `<meta http-equiv="Content-Security-Policy" content="script-src https://cdn.tailwindcss.com 'unsafe-inline'; default-src 'none'; style-src 'unsafe-inline'; img-src * data:; font-src *;">`;

interface ComponentPreviewProps {
  component: ViewerComponent | null;
  viewport: Viewport;
  activeVariantId: string | null;
  onVariantSelect: (variantId: string) => void;
  onExportHtml: () => void;
  onCopyHtml: () => void;
}

export function ComponentPreview({
  component,
  viewport,
  activeVariantId,
  onVariantSelect,
  onExportHtml,
  onCopyHtml,
}: ComponentPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const activeVariant = component?.variants.find((v) => v.id === activeVariantId)
    ?? component?.variants[component.variants.length - 1]
    ?? null;

  const srcDoc = useMemo(() => {
    if (!activeVariant) return "";
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${CSP}
    ${TAILWIND_CDN}
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
      ${activeVariant.css}
    </style>
  </head>
  <body>${activeVariant.html}</body>
</html>`;
  }, [activeVariant]);

  const viewportWidth = VIEWPORT_WIDTHS[viewport];

  if (!component) {
    return (
      <div className="flex-1 flex items-center justify-center bg-stone-50">
        <div className="text-center space-y-3">
          <span className="material-symbols-outlined text-4xl text-stone-200">web</span>
          <p className="text-sm font-[Noto_Serif] italic text-stone-400">
            Select a component to preview
          </p>
        </div>
      </div>
    );
  }

  const statusLabel =
    component.status === "generating" ? "Generating..." :
    component.status === "pending" ? "Pending..." :
    component.status === "error" ? "Error" : null;

  return (
    <div className="flex-1 flex flex-col bg-stone-50 min-w-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-stone-100 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-sm font-[Public_Sans] font-semibold text-stone-800 truncate">
            {component.name}
          </h3>
          {statusLabel && (
            <span className="text-[10px] font-[Public_Sans] text-stone-400 uppercase tracking-widest shrink-0">
              {statusLabel}
            </span>
          )}
        </div>

        {component.variants.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onExportHtml}
              className="p-1.5 rounded text-stone-400 hover:text-stone-700 transition-colors"
              title="Download HTML"
            >
              <span className="material-symbols-outlined text-sm">download</span>
            </button>
            <button
              onClick={onCopyHtml}
              className="p-1.5 rounded text-stone-400 hover:text-stone-700 transition-colors"
              title="Copy HTML"
            >
              <span className="material-symbols-outlined text-sm">content_copy</span>
            </button>
          </div>
        )}
      </div>

      {/* Variant tabs */}
      {component.variants.length > 1 && (
        <div className="px-4 py-2 border-b border-stone-100 bg-white flex gap-1 shrink-0">
          {component.variants.map((v) => (
            <button
              key={v.id}
              onClick={() => onVariantSelect(v.id)}
              className={`px-3 py-1 rounded text-[11px] font-[Public_Sans] font-semibold transition-colors ${
                (activeVariantId === v.id || (!activeVariantId && v === component.variants[component.variants.length - 1]))
                  ? "bg-stone-900 text-white"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {/* Preview area */}
      <div className="flex-1 overflow-auto p-6 flex justify-center">
        {activeVariant ? (
          <div
            className="bg-white rounded-lg shadow-sm border border-stone-200 overflow-hidden shrink-0"
            style={{ width: viewportWidth, maxWidth: "100%" }}
          >
            <iframe
              ref={iframeRef}
              srcDoc={srcDoc}
              sandbox="allow-scripts"
              className="w-full border-none"
              style={{ height: "100vh", maxHeight: 2000 }}
              title={`Preview: ${component.name}`}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-stone-400 italic font-[Noto_Serif]">
              {component.status === "generating" ? "Generating component..." : "No preview available"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
