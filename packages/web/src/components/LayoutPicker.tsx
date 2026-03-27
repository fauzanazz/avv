import { useMemo } from "react";
import type { LayoutOption, DesignSystem, ClientMessage } from "@avv/shared";

const TAILWIND_CDN = `<script src="https://cdn.tailwindcss.com"><\/script>`;

interface LayoutPickerProps {
  options: LayoutOption[];
  screenId: string;
  designSystem: DesignSystem | null;
  onSend: (msg: ClientMessage) => void;
}

function LayoutCard({
  layout,
  designSystemCss,
  onSelect,
}: {
  layout: LayoutOption;
  designSystemCss: string;
  onSelect: () => void;
}) {
  const srcDoc = useMemo(() => {
    const html = layout.components
      .sort((a, b) => a.order - b.order)
      .map((c) => {
        const variant = c.variants[0];
        return variant ? variant.html : "";
      })
      .join("\n");

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${TAILWIND_CDN}
    <style>
      ${designSystemCss}
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; transform: scale(0.25); transform-origin: top left; width: 400%; }
    </style>
  </head>
  <body>${html}</body>
</html>`;
  }, [layout, designSystemCss]);

  const readyCount = layout.components.filter((c) => c.status === "ready").length;
  const totalCount = layout.components.length;

  return (
    <button
      onClick={onSelect}
      className="bg-white rounded-xl border border-stone-200 overflow-hidden text-left hover:border-amber-400 hover:shadow-lg hover:shadow-amber-100/50 transition-all group flex flex-col"
    >
      {/* Preview thumbnail */}
      <div className="h-64 overflow-hidden bg-stone-100 relative">
        <iframe
          srcDoc={srcDoc}
          sandbox="allow-scripts"
          className="w-full h-[1024px] border-none pointer-events-none"
          style={{ transform: "scale(0.25)", transformOrigin: "top left", width: "400%" }}
          title={`Layout: ${layout.label}`}
        />
        {readyCount < totalCount && (
          <div className="absolute inset-0 bg-stone-900/30 flex items-center justify-center">
            <span className="text-white text-xs font-[Public_Sans] bg-stone-900/60 px-3 py-1 rounded-full">
              Building {readyCount}/{totalCount}...
            </span>
          </div>
        )}
      </div>

      {/* Label */}
      <div className="p-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-[Public_Sans] font-bold text-stone-800 group-hover:text-amber-800">
            {layout.label}
          </h3>
          <p className="text-[10px] text-stone-400 font-[Public_Sans] mt-0.5">
            {totalCount} components
          </p>
        </div>
        <span className="material-symbols-outlined text-stone-300 group-hover:text-amber-600 transition-colors">
          arrow_forward
        </span>
      </div>
    </button>
  );
}

export function LayoutPicker({ options, screenId, designSystem, onSend }: LayoutPickerProps) {
  const designSystemCss = designSystem?.css || "";

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-stone-50 overflow-auto">
      <div className="max-w-5xl w-full">
        <div className="text-center mb-8">
          <span className="material-symbols-outlined text-3xl text-amber-600 mb-2 block">dashboard</span>
          <h2 className="text-xl font-[Noto_Serif] font-bold italic text-stone-800">
            Choose a Layout
          </h2>
          <p className="text-sm text-stone-500 font-[Public_Sans] mt-1">
            Pick a page layout. You can generate new alternatives or refine after selecting.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {options.map((layout) => (
            <LayoutCard
              key={layout.id}
              layout={layout}
              designSystemCss={designSystemCss}
              onSelect={() =>
                onSend({ type: "select:layout", screenId, layoutId: layout.id })
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
