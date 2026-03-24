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

function getDefaultWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export function useAVVWebSocket({
  url = getDefaultWsUrl(),
  onMessage,
  autoReconnect = true,
  reconnectIntervalMs = 3000,
}: UseAVVWebSocketOptions): UseAVVWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const sid = sessionIdRef.current;
    const wsUrl = sid ? `${url}?sessionId=${sid}` : url;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[WS] Connected");
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === "session:started") {
          sessionIdRef.current = msg.sessionId;
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
      if (autoReconnect && !intentionalCloseRef.current) {
        reconnectTimerRef.current = setTimeout(connect, reconnectIntervalMs);
      }
    };

    ws.onerror = (err) => {
      console.error("[WS] Error:", err);
      ws.close();
    };

    wsRef.current = ws;
  }, [url, autoReconnect, reconnectIntervalMs]);

  useEffect(() => {
    intentionalCloseRef.current = false;
    connect();
    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
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
