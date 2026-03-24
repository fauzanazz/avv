interface ComponentStatusOverlayProps {
  status: "pending" | "generating" | "ready" | "error";
}

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "#94a3b8" },
  generating: { label: "Generating", color: "#3b82f6" },
  ready: { label: "Ready", color: "#22c55e" },
  error: { label: "Error", color: "#ef4444" },
} as const;

function StatusIcon({ status }: { status: string }) {
  if (status === "generating") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation: "spin 1s linear infinite" }}>
        <circle cx="6" cy="6" r="5" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="20 10" strokeLinecap="round" />
      </svg>
    );
  }

  if (status === "error") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12">
        <circle cx="6" cy="6" r="5" fill="none" stroke="#ef4444" strokeWidth="1.5" />
        <line x1="6" y1="3" x2="6" y2="7" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="6" cy="9" r="0.75" fill="#ef4444" />
      </svg>
    );
  }

  const dotColor = status === "ready" ? "#22c55e" : "#cbd5e1";
  return (
    <div
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: dotColor,
      }}
    />
  );
}

export function ComponentStatusOverlay({ status }: ComponentStatusOverlayProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: config.color,
      }}
    >
      <StatusIcon status={status} />
      {config.label}
    </div>
  );
}
