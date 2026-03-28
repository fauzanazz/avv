import { useRef, useCallback, useEffect, useSyncExternalStore } from "react";
import type { ServerMessage, ClientMessage } from "@avv/shared";
import { wsManager } from "../ws-manager";

interface UseAVVWebSocketOptions {
  onMessage: (msg: ServerMessage) => void;
}

interface UseAVVWebSocketReturn {
  send: (msg: ClientMessage) => void;
  isConnected: boolean;
  conversationId: string | null;
}

export function useAVVWebSocket({
  onMessage,
}: UseAVVWebSocketOptions): UseAVVWebSocketReturn {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    return wsManager.onMessage((msg) => onMessageRef.current(msg));
  }, []);

  const { isConnected, conversationId } = useSyncExternalStore(
    wsManager.subscribeState,
    wsManager.getSnapshot,
  );

  const send = useCallback((msg: ClientMessage) => {
    wsManager.send(msg);
  }, []);

  return { send, isConnected, conversationId };
}
