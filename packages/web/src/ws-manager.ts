import type { ServerMessage, ClientMessage } from "@avv/shared";

type MessageListener = (msg: ServerMessage) => void;
type StateListener = () => void;

interface WSState {
  isConnected: boolean;
  conversationId: string | null;
}

class WSManager {
  private ws: WebSocket | null = null;
  private url: string = "";
  private messageListeners = new Set<MessageListener>();
  private stateListeners = new Set<StateListener>();
  private state: WSState = { isConnected: false, conversationId: null };
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectMs = 3000;

  connect(url: string): void {
    if (this.ws && this.url === url) return;
    this.url = url;
    this.doConnect();
  }

  private doConnect(): void {
    this.clearReconnect();

    const wsUrl = this.state.conversationId
      ? `${this.url}?conversationId=${this.state.conversationId}`
      : this.url;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      this.setState({ isConnected: true });
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === "conversation:loaded") {
          this.setState({ conversationId: msg.conversation.id });
        }
        for (const listener of this.messageListeners) {
          listener(msg);
        }
      } catch (err) {
        console.error("[WS] Failed to parse message:", err);
      }
    };

    ws.onclose = () => {
      this.setState({ isConnected: false });
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };

    this.ws = ws;
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => this.doConnect(), this.reconnectMs);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setState(partial: Partial<WSState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.stateListeners) {
      listener();
    }
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn("[WS] Cannot send — not connected");
    }
  }

  getSnapshot = (): WSState => this.state;

  subscribeState = (listener: StateListener): (() => void) => {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  };

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }
}

function getDefaultWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export const wsManager = new WSManager();
wsManager.connect(getDefaultWsUrl());
