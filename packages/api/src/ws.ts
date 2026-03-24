import type { ServerWebSocket } from "bun";
import type { ClientMessage } from "@avv/shared";
import { connectionStore, type WSData } from "./store";

export function createWSHandler() {
  return {
    open(ws: ServerWebSocket<WSData>) {
      const { sessionId } = ws.data;
      console.log(`[WS] Client connected (session: ${sessionId ?? "none"})`);

      if (sessionId) {
        connectionStore.add(sessionId, ws);
        connectionStore.send(ws, {
          type: "session:started",
          sessionId,
        });
      }
    },

    message(ws: ServerWebSocket<WSData>, raw: string | Buffer) {
      try {
        const msg: ClientMessage = JSON.parse(
          typeof raw === "string" ? raw : raw.toString()
        );
        handleClientMessage(ws, msg);
      } catch {
        connectionStore.send(ws, {
          type: "error",
          message: "Invalid message format",
        });
      }
    },

    close(ws: ServerWebSocket<WSData>) {
      console.log("[WS] Client disconnected");
      connectionStore.remove(ws);
    },
  };
}

function handleClientMessage(ws: ServerWebSocket<WSData>, msg: ClientMessage): void {
  switch (msg.type) {
    case "generate":
      console.log(`[WS] Generate request: ${msg.prompt} (mode: ${msg.mode})`);
      break;
    case "iterate":
      console.log(`[WS] Iterate request: ${msg.componentId}`);
      break;
    case "cancel":
      console.log(`[WS] Cancel request: ${msg.sessionId}`);
      break;
  }
}
