import type { ServerWebSocket } from "bun";
import type { ServerMessage } from "@avv/shared";

export interface WSData {
  sessionId: string | null;
}

class ConnectionStore {
  private connections = new Map<string, Set<ServerWebSocket<WSData>>>();

  add(sessionId: string, ws: ServerWebSocket<WSData>): void {
    if (!this.connections.has(sessionId)) {
      this.connections.set(sessionId, new Set());
    }
    this.connections.get(sessionId)!.add(ws);
  }

  remove(ws: ServerWebSocket<WSData>): void {
    for (const [sessionId, sockets] of this.connections) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        this.connections.delete(sessionId);
      }
    }
  }

  broadcast(sessionId: string, message: ServerMessage): void {
    const sockets = this.connections.get(sessionId);
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
