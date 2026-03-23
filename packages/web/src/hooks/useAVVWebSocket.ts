import { useEffect, useRef, useCallback, useState } from "react";
import type { ServerMessage, ClientMessage } from "@avv/shared";

interface UseAVVWebSocketOptions {
  url?: string;
  onMessage: (msg: ServerMessage) => void;
  autoReconnect?: boolean;
  reconnectIntervalMs?: number;
}

interface UseAVVWebSocketReturn {
  send: (msg: ClientMessage) => void;
  isConnected: boolean;
  sessionId: string | null;
}

export function useAVVWebSocket({
  url = `ws://${window.location.hostname}:3001/ws`,
  onMessage,
  autoReconnect = true,
  reconnectIntervalMs = 3000,
}: UseAVVWebSocketOptions): UseAVVWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const wsUrl = sessionId ? `${url}?sessionId=${sessionId}` : url;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[WS] Connected");
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === "session:started") {
          setSessionId(msg.sessionId);
        }
        onMessageRef.current(msg);
      } catch (err) {
        console.error("[WS] Failed to parse message:", err);
      }
    };

    ws.onclose = () => {
      console.log("[WS] Disconnected");
      setIsConnected(false);
      if (autoReconnect) {
        setTimeout(connect, reconnectIntervalMs);
      }
    };

    ws.onerror = (err) => {
      console.error("[WS] Error:", err);
      ws.close();
    };

    wsRef.current = ws;
  }, [url, sessionId, autoReconnect, reconnectIntervalMs]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn("[WS] Cannot send — not connected");
    }
  }, []);

  return { send, isConnected, sessionId };
}
