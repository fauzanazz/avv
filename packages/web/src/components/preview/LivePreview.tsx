import { useState, useEffect, useRef } from "react";
import type { SandboxProgressStep } from "../../hooks/useChat";

type Viewport = "mobile" | "tablet" | "desktop";

const VIEWPORTS: Record<Viewport, { width: string; label: string }> = {
  mobile: { width: "375px", label: "Mobile" },
  tablet: { width: "768px", label: "Tablet" },
  desktop: { width: "100%", label: "Desktop" },
};

const STEP_LABELS: Record<string, string> = {
  boot: "Booting sandbox",
  upload: "Uploading template",
  install: "Installing dependencies",
  connect: "Connecting preview",
  vite: "Starting dev server",
};

interface LivePreviewProps {
  files: Map<string, string>;
  previewUrl: string | null;
  refreshTrigger?: number;
  sandboxProgress?: SandboxProgressStep[] | null;
}

export function LivePreview({ files, previewUrl, refreshTrigger = 0, sandboxProgress }: LivePreviewProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [refreshKey, setRefreshKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prevTriggerRef = useRef(refreshTrigger);

  // Debounced auto-refresh when files change (500ms)
  useEffect(() => {
    // Skip if trigger hasn't actually changed (covers mount + conversation switch reset)
    if (refreshTrigger === prevTriggerRef.current) return;
    prevTriggerRef.current = refreshTrigger;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setRefreshKey((k) => k + 1);
    }, 500);

    return () => clearTimeout(debounceRef.current);
  }, [refreshTrigger]);

  // Show progress UI while sandbox is still setting up (takes priority over iframe)
  const sandboxInProgress = sandboxProgress?.some(
    (s) => s.status === "running" || s.status === "pending",
  );

  if (sandboxInProgress && sandboxProgress) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="space-y-3 w-64">
          <p className="text-xs text-neutral-400 font-medium mb-4">Setting up preview</p>
          {sandboxProgress.map((s) => (
            <div key={s.step} className="flex items-center gap-2.5">
              <StepIndicator status={s.status} />
              <span
                className={`text-xs ${
                  s.status === "running"
                    ? "text-neutral-200"
                    : s.status === "done"
                      ? "text-neutral-500"
                      : s.status === "error"
                        ? "text-red-400"
                        : "text-neutral-600"
                }`}
              >
                {STEP_LABELS[s.step] ?? s.step}
              </span>
            </div>
          ))}
          {sandboxProgress.some((s) => s.status === "error") && (
            <p className="text-[10px] text-red-400/70 mt-2">
              {sandboxProgress.find((s) => s.status === "error")?.error}
            </p>
          )}
        </div>
      </div>
    );
  }

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

function StepIndicator({ status }: { status: string }) {
  switch (status) {
    case "done":
      return <span className="text-green-400 text-xs w-4 text-center">{"\u2713"}</span>;
    case "running":
      return (
        <span className="text-neutral-300 text-xs w-4 text-center animate-spin inline-block">
          {"\u2699"}
        </span>
      );
    case "error":
      return <span className="text-red-400 text-xs w-4 text-center">{"\u2717"}</span>;
    default:
      return <span className="text-neutral-600 text-xs w-4 text-center">{"\u2022"}</span>;
  }
}
