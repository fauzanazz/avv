import type { ServerWebSocket } from "bun";
import type { ClientMessage } from "@avv/shared";
import { connectionStore, type WSData } from "./store";
import { sessionStore } from "./store";
import { orchestrate, cancelSession } from "./agents/orchestrator";

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
      let msg: ClientMessage;
      try {
        msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
      } catch {
        connectionStore.send(ws, {
          type: "error",
          message: "Invalid message format",
        });
        return;
      }

      try {
        handleClientMessage(ws, msg);
      } catch (err) {
        console.error("[WS] Handler error:", err);
        connectionStore.send(ws, {
          type: "error",
          message: "Internal server error",
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
    case "generate": {
      // Remove socket from old session before joining a new one
      connectionStore.remove(ws);

      const session = sessionStore.create(msg.prompt, msg.mode);
      connectionStore.add(session.id, ws);
      ws.data.sessionId = session.id;

      connectionStore.send(ws, {
        type: "session:started",
        sessionId: session.id,
      });

      orchestrate({
        prompt: msg.prompt,
        mode: msg.mode,
        sessionId: session.id,
      }).catch((err) => {
        console.error("[Orchestrate] Fatal error:", err);
        connectionStore.send(ws, { type: "error", message: "Generation failed" });
      });
      break;
    }
    case "iterate":
      console.log(`[WS] Iterate request: ${msg.componentId}`);
      break;
    case "cancel": {
      // Validate that the cancel request matches the socket's bound session
      if (ws.data.sessionId !== msg.sessionId) {
        connectionStore.send(ws, {
          type: "error",
          message: "Cannot cancel a session you are not connected to",
        });
        return;
      }
      cancelSession(msg.sessionId);
      console.log(`[WS] Cancel request: ${msg.sessionId}`);
      break;
    }
  }
}
