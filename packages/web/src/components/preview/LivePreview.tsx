import { useState } from "react";

type Viewport = "mobile" | "tablet" | "desktop";

const VIEWPORTS: Record<Viewport, { width: string; label: string }> = {
  mobile: { width: "375px", label: "Mobile" },
  tablet: { width: "768px", label: "Tablet" },
  desktop: { width: "100%", label: "Desktop" },
};

interface LivePreviewProps {
  files: Map<string, string>;
  previewUrl: string | null;
}

export function LivePreview({ files, previewUrl }: LivePreviewProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [refreshKey, setRefreshKey] = useState(0);

  const hasContent = previewUrl || files.size > 0;

  if (!hasContent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-2xl text-neutral-800">{"\u25B6"}</div>
          <p className="text-xs text-neutral-600">No previewable content yet</p>
        </div>
      </div>
    );
  }

  const { width } = VIEWPORTS[viewport];

  return (
    <div className="flex-1 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-neutral-800">
        {(Object.entries(VIEWPORTS) as [Viewport, { width: string; label: string }][]).map(
          ([key, { label }]) => (
            <button
              key={key}
              onClick={() => setViewport(key)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                viewport === key
                  ? "bg-neutral-700 text-neutral-200"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {label}
            </button>
          ),
        )}
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="text-[10px] text-neutral-500 hover:text-neutral-300 ml-auto px-2 py-0.5 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Iframe */}
      <div className="flex-1 flex justify-center bg-neutral-900 overflow-auto p-2">
        <iframe
          key={refreshKey}
          src={previewUrl ?? undefined}
          className="bg-white rounded"
          style={{
            width,
            height: "100%",
            maxWidth: "100%",
            border: "none",
          }}
          sandbox="allow-scripts allow-same-origin"
          title="Preview"
        />
      </div>
    </div>
  );
}
