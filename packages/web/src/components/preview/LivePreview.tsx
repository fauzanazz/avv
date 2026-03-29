import { useState, useEffect, useRef, useMemo } from "react";
import type { SandboxProgressStep } from "../../hooks/useChat";

type Viewport = "mobile" | "tablet" | "desktop";

const VIEWPORTS: Record<Viewport, { width: string; label: string }> = {
  mobile: { width: "375px", label: "Mobile" },
  tablet: { width: "768px", label: "Tablet" },
  desktop: { width: "100%", label: "Desktop" },
};

const VIEWPORT_ENTRIES = Object.entries(VIEWPORTS) as [Viewport, { width: string; label: string }][];

const STEP_LABELS: Record<string, string> = {
  boot: "Booting sandbox",
  upload: "Uploading template",
  install: "Installing dependencies",
  connect: "Connecting preview",
  vite: "Starting dev server",
};

const DEBOUNCE_MS = 500;

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

  // Debounced auto-refresh when files change
  useEffect(() => {
    if (refreshTrigger === prevTriggerRef.current) return;
    prevTriggerRef.current = refreshTrigger;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setRefreshKey((k) => k + 1);
    }, DEBOUNCE_MS);

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
                        ? "text-[var(--status-error)]"
                        : "text-[var(--text-muted)] opacity-40"
                }`}
              >
                {STEP_LABELS[s.step] ?? s.step}
              </span>
            </div>
          ))}
          {sandboxProgress.some((s) => s.status === "error") && (
            <p className="text-[10px] text-[var(--status-error)]/70 mt-2">
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
      <div className="flex-1 flex items-center justify-center preview-empty-bg">
        <div className="text-center space-y-4 max-w-xs animate-fade-up">
          <BrowserIllustration />
          <div className="space-y-1">
            <p className="text-sm font-medium text-[var(--text-secondary)]">Your app will appear here</p>
            <p className="text-xs text-[var(--text-muted)]">Send a message to start building</p>
          </div>
        </div>
      </div>
    );
  }

  const { width } = VIEWPORTS[viewport];

  return (
    <div className="flex-1 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--border-subtle)]">
        {VIEWPORT_ENTRIES.map(
          ([key, { label }]) => (
            <button
              key={key}
              onClick={() => setViewport(key)}
              className={`text-[10px] min-h-[44px] px-3 py-1 rounded-md transition-colors ${
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
          className="text-[10px] min-h-[44px] text-[var(--text-muted)] hover:text-[var(--text-tertiary)] ml-auto px-3 py-1 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Iframe */}
      <IframePreview width={width} refreshKey={refreshKey} previewUrl={previewUrl} />
    </div>
  );
}

function IframePreview({ width, refreshKey, previewUrl }: { width: string; refreshKey: number; previewUrl: string | null }) {
  const style = useMemo(() => ({
    width,
    height: "100%" as const,
    maxWidth: "100%" as const,
    border: "none" as const,
  }), [width]);

  if (!previewUrl) {
    return (
      <div className="flex-1 flex items-center justify-center preview-empty-bg">
        <div className="text-center space-y-3 max-w-xs">
          <BrowserIllustration />
          <div className="space-y-1">
            <p className="text-sm font-medium text-[var(--text-secondary)]">Preview loading...</p>
            <p className="text-xs text-[var(--text-muted)]">Files are ready — connecting preview</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex justify-center bg-[var(--bg-secondary)] overflow-auto p-2">
      <iframe
        key={refreshKey}
        src={previewUrl}
        className="bg-white rounded-lg"
        style={style}
        sandbox="allow-scripts allow-same-origin"
        title="Preview"
      />
    </div>
  );
}

function BrowserIllustration() {
  return (
    <div className="flex justify-center">
      <svg
        width="64"
        height="56"
        viewBox="0 0 64 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ opacity: 0.18 }}
      >
        {/* Window frame */}
        <rect x="1" y="1" width="62" height="54" rx="6" stroke="var(--text-muted)" strokeWidth="1.5" />
        {/* Top bar */}
        <line x1="1" y1="14" x2="63" y2="14" stroke="var(--text-muted)" strokeWidth="1.5" />
        {/* Traffic dots */}
        <circle cx="11" cy="7.5" r="2.5" fill="var(--text-muted)" />
        <circle cx="20" cy="7.5" r="2.5" fill="var(--text-muted)" />
        <circle cx="29" cy="7.5" r="2.5" fill="var(--text-muted)" />
        {/* URL bar */}
        <rect x="36" y="4" width="22" height="7" rx="3.5" fill="var(--text-muted)" fillOpacity="0.4" />
        {/* Content placeholder lines */}
        <rect x="8" y="22" width="28" height="3" rx="1.5" fill="var(--text-muted)" />
        <rect x="8" y="29" width="48" height="3" rx="1.5" fill="var(--text-muted)" fillOpacity="0.6" />
        <rect x="8" y="36" width="40" height="3" rx="1.5" fill="var(--text-muted)" fillOpacity="0.4" />
        <rect x="8" y="43" width="20" height="3" rx="1.5" fill="var(--text-muted)" fillOpacity="0.3" />
      </svg>
    </div>
  );
}

function StepIndicator({ status }: { status: string }) {
  const base = "w-3 h-3 flex-shrink-0";
  switch (status) {
    case "done":
      return (
        <svg className={`${base} text-[var(--status-success)]`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="M4 8.5l2.5 2.5 5.5-5.5" />
        </svg>
      );
    case "running":
      return (
        <svg className={`${base} text-[var(--text-secondary)] animate-spin`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="8" cy="8" r="6" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
        </svg>
      );
    case "error":
      return (
        <svg className={`${base} text-[var(--status-error)]`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="M5 5l6 6M11 5l-6 6" />
        </svg>
      );
    default:
      return <span className={`${base} inline-flex items-center justify-center text-[var(--text-muted)] opacity-30 text-[8px]`} aria-hidden="true">{"\u2022"}</span>;
  }
}
