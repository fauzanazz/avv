import type { AgentLogEntry } from "../hooks/useAgentLogs";

interface StatusBarProps {
  logs: AgentLogEntry[];
  isConnected: boolean;
  sessionId: string | null;
}

export function StatusBar({ logs, isConnected, sessionId }: StatusBarProps) {
  const lastLog = logs[logs.length - 1];

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 z-50">
      <div className="flex items-center gap-2">
        <span>{isConnected ? "Connected" : "Disconnected"}</span>
        {sessionId && <span>| Session: {sessionId.slice(0, 8)}...</span>}
      </div>

      {lastLog && (
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-600">[{lastLog.agentId}]</span>
          <span>{lastLog.message}</span>
        </div>
      )}
    </div>
  );
}
