import type { ServerWebSocket } from "bun";
import type { ClientMessage } from "@avv/shared";
import { connectionStore, type WSData } from "./store";
import { sessionStore } from "./store";
import { orchestrate, cancelSession } from "./agents/orchestrator";
import { startConversation, continueConversation, getConversation, deleteConversation } from "./agents/conversation";
import { retrySection } from "./agents/retrier";
import { iterateComponent } from "./agents/iterator";

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
      const { sessionId } = ws.data;
      connectionStore.remove(ws);
      if (sessionId && !connectionStore.hasConnections(sessionId)) {
        deleteConversation(sessionId);
      }
    },
  };
}

function triggerGeneration(ws: ServerWebSocket<WSData>, sessionId: string, enrichedPrompt: string, mode: "simple" | "ultrathink"): void {
  deleteConversation(sessionId);
  orchestrate({ prompt: enrichedPrompt, mode, sessionId }).catch((err) => {
    console.error("[Orchestrate] Failed:", err);
    connectionStore.send(ws, { type: "error", message: "Generation failed" });
  });
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

      startConversation(session.id, msg.prompt, msg.mode).then((isReady) => {
        if (isReady) {
          const convo = getConversation(session.id);
          if (convo) triggerGeneration(ws, session.id, convo.enrichedPrompt, convo.mode);
        }
      }).catch((err) => {
        console.error("[Conversation] Failed:", err);
        connectionStore.send(ws, { type: "error", message: "Conversation failed" });
      });
      break;
    }
    case "chat": {
      const sid = ws.data.sessionId;
      if (!sid) break;

      // Short-circuit: if conversation is already READY, trigger generation directly
      const existingConvo = getConversation(sid);
      if (existingConvo?.isReady) {
        triggerGeneration(ws, sid, existingConvo.enrichedPrompt, existingConvo.mode);
        break;
      }

      continueConversation(sid, msg.message).then((isReady) => {
        if (isReady) {
          const convo = getConversation(sid);
          if (convo) triggerGeneration(ws, sid, convo.enrichedPrompt, convo.mode);
        }
      }).catch((err) => {
        console.error("[Conversation] Failed:", err);
        connectionStore.send(ws, { type: "error", message: "Chat failed" });
      });
      break;
    }
    case "retry": {
      const sid = ws.data.sessionId;
      if (!sid) break;
      retrySection(sid, msg.pageId, msg.sectionId).catch((err) => {
        console.error("[Retry] Failed:", err);
        connectionStore.send(ws, { type: "error", message: "Retry failed" });
      });
      break;
    }
    case "iterate": {
      const sid = ws.data.sessionId;
      if (!sid) {
        connectionStore.send(ws, { type: "error", message: "No active session" });
        break;
      }

      iterateComponent({
        sessionId: sid,
        pageId: msg.pageId,
        sectionId: msg.sectionId,
        sectionName: msg.sectionName,
        currentHtml: msg.currentHtml,
        currentCss: msg.currentCss,
        instruction: msg.instruction,
        iteration: msg.iteration,
      }).catch((err) => {
        console.error("[Iterate] Failed:", err);
        connectionStore.send(ws, { type: "error", message: "Iteration failed" });
      });
      break;
    }
    case "cancel": {
      const cancelSid = ws.data.sessionId;
      if (!cancelSid) {
        connectionStore.send(ws, { type: "error", message: "No active session" });
        break;
      }
      cancelSession(cancelSid);
      deleteConversation(cancelSid);
      sessionStore.update(cancelSid, { status: "error" });
      console.log(`[WS] Cancel request: ${cancelSid}`);
      break;
    }
  }
}
