import type { ServerWebSocket } from "bun";
import type { ClientMessage } from "@avv/shared";
import { connectionStore, type WSData } from "./store";
import { sessionStore } from "./store";
<<<<<<< HEAD
import { orchestrate, cancelSession } from "./agents/orchestrator";
=======
import { orchestrate } from "./agents/orchestrator";
import { runUltraThinkFlow } from "./agents/ultrathink";

/** How long to wait for user answers before aborting (5 minutes) */
const ULTRATHINK_TIMEOUT_MS = 5 * 60 * 1000;

/** Pending answer resolvers per session */
const pendingAnswers = new Map<string, {
  answers: Map<string, string>;
  resolve: (answers: Map<string, string>) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();
>>>>>>> ba6676d (fix: address code review feedback across UltraThink and supporting modules [FAU-41])

function cleanupPendingAnswers(sessionId: string): void {
  const pending = pendingAnswers.get(sessionId);
  if (pending) {
    clearTimeout(pending.timer);
    pending.reject(new Error("UltraThink flow aborted: client disconnected or timed out"));
    pendingAnswers.delete(sessionId);
  }
}

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
      if (sessionId) {
        cleanupPendingAnswers(sessionId);
      }
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

<<<<<<< HEAD
      orchestrate({
        prompt: msg.prompt,
        mode: msg.mode,
        sessionId: session.id,
      }).catch((err) => {
        console.error("[Orchestrate] Fatal error:", err);
        connectionStore.send(ws, { type: "error", message: "Generation failed" });
      });
=======
      if (msg.mode === "ultrathink") {
        const answerPromise = new Promise<Map<string, string>>((resolve, reject) => {
          const timer = setTimeout(() => {
            pendingAnswers.delete(session.id);
            reject(new Error("UltraThink flow timed out waiting for answers"));
          }, ULTRATHINK_TIMEOUT_MS);

          pendingAnswers.set(session.id, {
            answers: new Map(),
            resolve,
            reject,
            timer,
          });
        });

        runUltraThinkFlow(session.id, msg.prompt, () => answerPromise)
          .then((enrichedPrompt) => {
            return orchestrate({ prompt: enrichedPrompt, mode: "ultrathink", sessionId: session.id });
          })
          .catch((err) => {
            console.error("[UltraThink] Failed:", err);
            // Clean up without rejecting — the promise may not have been awaited yet,
            // and rejecting it would create an unhandled promise rejection.
            const pending = pendingAnswers.get(session.id);
            if (pending) {
              clearTimeout(pending.timer);
              pendingAnswers.delete(session.id);
            }
            connectionStore.send(ws, { type: "error", message: "UltraThink flow failed" });
          });
      } else {
        orchestrate({
          prompt: msg.prompt,
          mode: msg.mode,
          sessionId: session.id,
        }).catch((err) => {
          console.error("[Orchestrate] Fatal error:", err);
          connectionStore.send(ws, { type: "error", message: "Generation failed" });
        });
      }
      break;
    }
    case "ultrathink:answer": {
      const pending = pendingAnswers.get(ws.data.sessionId ?? "");
      if (pending) {
        pending.answers.set(msg.questionId, msg.answer);
      }
      break;
    }
    case "ultrathink:confirm": {
      const pending = pendingAnswers.get(ws.data.sessionId ?? "");
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(pending.answers);
        pendingAnswers.delete(ws.data.sessionId ?? "");
      }
>>>>>>> ba6676d (fix: address code review feedback across UltraThink and supporting modules [FAU-41])
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
