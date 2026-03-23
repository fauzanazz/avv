import { useState, useCallback } from "react";
import type { ServerMessage } from "@avv/shared";

export interface AgentLogEntry {
  id: string;
  agentId: string;
  message: string;
  timestamp: Date;
}

interface UseAgentLogsReturn {
  logs: AgentLogEntry[];
  handleMessage: (msg: ServerMessage) => void;
  clearLogs: () => void;
}

export function useAgentLogs(): UseAgentLogsReturn {
  const [logs, setLogs] = useState<AgentLogEntry[]>([]);

  const handleMessage = useCallback((msg: ServerMessage) => {
    if (msg.type === "agent:log") {
      setLogs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          agentId: msg.agentId,
          message: msg.message,
          timestamp: new Date(),
        },
      ]);
    }
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, handleMessage, clearLogs };
}
