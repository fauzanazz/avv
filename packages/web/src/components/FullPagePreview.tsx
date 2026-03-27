import { useMemo } from "react";
import type { Screen, DesignSystem } from "@avv/shared";
import type { Viewport } from "./layout/TopBar";

const TAILWIND_CDN = `<script src="https://cdn.tailwindcss.com"><\/script>`;

const VIEWPORT_WIDTHS: Record<Viewport, number> = {
  mobile: 375,
  tablet: 768,
  desktop: 1280,
};

interface FullPagePreviewProps {
  screen: Screen;
  designSystem: DesignSystem | null;
  viewport: Viewport;
}

export function FullPagePreview({ screen, designSystem, viewport }: FullPagePreviewProps) {
  const srcDoc = useMemo(() => {
    const componentsHtml = screen.components
      .sort((a, b) => a.order - b.order)
      .map((c) => {
        const variant = c.variants[0];
        if (!variant) return `<!-- ${c.name}: pending -->`;
        return `<!-- ${c.name} -->\n${variant.html}`;
      })
      .join("\n\n");

    const componentCss = screen.components
      .map((c) => c.variants[0]?.css || "")
      .filter(Boolean)
      .join("\n");

    const designSystemCss = designSystem?.css || "";

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${TAILWIND_CDN}
    <style>
      ${designSystemCss}
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; padding: 0; font-family: var(--font-body, system-ui, -apple-system, sans-serif); }
      ${componentCss}
    </style>
  </head>
  <body>${componentsHtml}</body>
</html>`;
  }, [screen.components, designSystem]);

  const viewportWidth = VIEWPORT_WIDTHS[viewport];

  const readyCount = screen.components.filter((c) => c.status === "ready").length;
  const totalCount = screen.components.length;
  const isBuilding = readyCount < totalCount;

  return (
    <div className="flex-1 flex flex-col bg-stone-50 min-w-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-stone-100 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-[Public_Sans] font-semibold text-stone-800">
            {screen.name}
          </h3>
          {isBuilding && (
            <span className="text-[10px] font-[Public_Sans] text-blue-500 uppercase tracking-widest animate-pulse">
              Building {readyCount}/{totalCount}...
            </span>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-auto p-6 flex justify-center">
        <div
          className="bg-white rounded-lg shadow-sm border border-stone-200 overflow-hidden shrink-0"
          style={{ width: viewportWidth, maxWidth: "100%" }}
        >
          <iframe
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            className="w-full border-none"
            style={{ height: "100vh", minHeight: 800, maxHeight: 4000 }}
            title={`Preview: ${screen.name}`}
          />
        </div>
      </div>
    </div>
  );
}
