export function ThinkingLive() {
  return (
    <div
      className="flex items-center gap-1.5 text-xs text-[var(--status-warning)] min-h-[44px] py-1"
      role="status"
      aria-label="Thinking"
    >
      {/* Brain/thought icon */}
      <svg
        className="w-3.5 h-3.5 flex-shrink-0 animate-pulse-soft"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 2a3 3 0 0 0-1 5.83V13a1 1 0 0 0 2 0V7.83A3 3 0 0 0 6 2z" />
        <path d="M10 2a3 3 0 0 1 1 5.83V13a1 1 0 0 1-2 0V7.83A3 3 0 0 1 10 2z" />
        <path d="M6 5a3 3 0 0 1 4 0" />
      </svg>
      <span className="animate-pulse-soft">Thinking...</span>
    </div>
  );
}
