interface PageStatusBarProps {
  title: string;
  readyCount: number;
  totalCount: number;
  isGenerating: boolean;
  isAllReady: boolean;
}

export function PageStatusBar({ title, readyCount, totalCount, isGenerating, isAllReady }: PageStatusBarProps) {
  return (
    <div
      style={{
        padding: "8px 14px",
        fontSize: 12,
        fontWeight: 600,
        color: "#475569",
        background: "#f8fafc",
        borderBottom: "1px solid #e2e8f0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        height: 36,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {title}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, flexShrink: 0 }}>
        {isGenerating && (
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6", animation: "pulse 1.5s infinite" }} />
        )}
        <span style={{ color: isAllReady ? "#22c55e" : "#94a3b8" }}>
          {readyCount}/{totalCount} sections
        </span>
      </div>
    </div>
  );
}
