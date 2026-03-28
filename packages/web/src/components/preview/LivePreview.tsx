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
    if (refreshTrigger === prevTriggerRef.current) return;
    prevTriggerRef.current = refreshTrigger;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setRefreshKey((k) => k + 1);
    }, 500);

    return () => clearTimeout(debounceRef.current);
  }, [refreshTrigger]);

  // Show progress UI while sandbox is still setting up
  const sandboxInProgress = sandboxProgress?.some(
    (s) => s.status === "running" || s.status === "pending",
  );

  if (sandboxInProgress && sandboxProgress) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="space-y-3 w-56">
          <p className="text-[11px] text-[var(--text-muted)] font-medium mb-4">Setting up preview</p>
          {sandboxProgress.map((s) => (
            <div key={s.step} className="flex items-center gap-2.5">
              <StepIndicator status={s.status} />
              <span
                className={`text-[11px] transition-colors ${
                  s.status === "running"
                    ? "text-[var(--text-secondary)]"
                    : s.status === "done"
                      ? "text-[var(--text-muted)]"
                      : s.status === "error"
                        ? "text-red-400"
                        : "text-[var(--text-muted)] opacity-40"
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
          <div className="text-2xl text-[var(--text-muted)] opacity-20">{"\u25B6"}</div>
          <p className="text-xs text-[var(--text-muted)]">Preview will appear here</p>
        </div>
      </div>
    );
  }

  const { width } = VIEWPORTS[viewport];

  return (
    <div className="flex-1 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--border-subtle)]">
        {(Object.entries(VIEWPORTS) as [Viewport, { width: string; label: string }][]).map(
          ([key, { label }]) => (
            <button
              key={key}
              onClick={() => setViewport(key)}
              className={`text-[10px] px-2 py-0.5 rounded-md transition-colors ${
                viewport === key
                  ? "bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-tertiary)]"
              }`}
            >
              {label}
            </button>
          ),
        )}
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-tertiary)] ml-auto px-2 py-0.5 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Iframe */}
      <div className="flex-1 flex justify-center bg-[var(--bg-secondary)] overflow-auto p-2">
        <iframe
          key={refreshKey}
          src={previewUrl ?? undefined}
          className="bg-white rounded-lg"
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
  const base = "w-3 h-3 flex-shrink-0";
  switch (status) {
    case "done":
      return (
        <svg className={`${base} text-emerald-400`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M4 8.5l2.5 2.5 5.5-5.5" />
        </svg>
      );
    case "running":
      return (
        <svg className={`${base} text-[var(--text-secondary)] animate-spin`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="8" cy="8" r="6" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
        </svg>
      );
    case "error":
      return (
        <svg className={`${base} text-red-400`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M5 5l6 6M11 5l-6 6" />
        </svg>
      );
    default:
      return <span className={`${base} inline-flex items-center justify-center text-[var(--text-muted)] opacity-30 text-[8px]`}>{"\u2022"}</span>;
  }
}
