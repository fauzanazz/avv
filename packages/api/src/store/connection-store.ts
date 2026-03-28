import type { ServerWebSocket } from "bun";
import type { ServerMessage } from "@avv/shared";

export interface WSData {
  conversationId: string | null;
}

class ConnectionStore {
  private connections = new Map<string, Set<ServerWebSocket<WSData>>>();

  add(conversationId: string, ws: ServerWebSocket<WSData>): void {
    if (!this.connections.has(conversationId)) {
      this.connections.set(conversationId, new Set());
    }
    this.connections.get(conversationId)!.add(ws);
  }

  remove(ws: ServerWebSocket<WSData>): void {
    for (const [id, sockets] of this.connections) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        this.connections.delete(id);
      }
    }
  }

  broadcast(conversationId: string, message: ServerMessage): void {
    const sockets = this.connections.get(conversationId);
    if (!sockets) return;
    const payload = JSON.stringify(message);
    for (const ws of sockets) {
      ws.send(payload);
    }
  }

  send(ws: ServerWebSocket<WSData>, message: ServerMessage): void {
    ws.send(JSON.stringify(message));
  }
}

export const connectionStore = new ConnectionStore();
