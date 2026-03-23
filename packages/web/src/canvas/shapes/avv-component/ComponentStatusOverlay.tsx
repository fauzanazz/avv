interface ComponentStatusOverlayProps {
  status: "pending" | "generating" | "ready" | "error";
}

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "#94a3b8", dot: "#cbd5e1" },
  generating: { label: "Generating", color: "#3b82f6", dot: "#3b82f6" },
  ready: { label: "Ready", color: "#22c55e", dot: "#22c55e" },
  error: { label: "Error", color: "#ef4444", dot: "#ef4444" },
} as const;

export function ComponentStatusOverlay({ status }: ComponentStatusOverlayProps) {
  const config = STATUS_CONFIG[status];

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
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: config.dot,
          animation: status === "generating" ? "pulse 1.5s infinite" : "none",
        }}
      />
      {config.label}
    </div>
  );
}
