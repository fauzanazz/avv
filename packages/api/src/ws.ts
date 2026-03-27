import type { ServerWebSocket } from "bun";
import type { ClientMessage } from "@avv/shared";
import { connectionStore, type WSData } from "./store";
import { sessionStore } from "./store";
import { projectStore } from "./store/project-store";
import { cancelSession } from "./agents/orchestrator";
import { startConversation, continueConversation, getConversation, deleteConversation } from "./agents/conversation";
import { generateDesignSystems } from "./agents/design-system-generator";
import { generateLayouts } from "./agents/layout-generator";
import { retryComponent } from "./agents/retrier";
import { iterateComponent } from "./agents/iterator";
import { fetchFigmaAsReference, importFigmaAsScreen } from "./agents/figma-fetcher";

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

function triggerDesignSystemGeneration(ws: ServerWebSocket<WSData>, sessionId: string, enrichedPrompt: string): void {
  const project = projectStore.getBySession(sessionId);
  if (!project) {
    const newProject = projectStore.create(sessionId, "Untitled Project");
    connectionStore.broadcast(sessionId, { type: "project:created", project: newProject });
  }

  generateDesignSystems({ prompt: enrichedPrompt, sessionId }).catch((err) => {
    console.error("[DesignSystem] Failed:", err);
    connectionStore.send(ws, { type: "error", message: "Design system generation failed" });
  });
}

function handleClientMessage(ws: ServerWebSocket<WSData>, msg: ClientMessage): void {
  switch (msg.type) {
    case "generate": {
      connectionStore.remove(ws);

      const session = sessionStore.create(msg.prompt, "simple");
      connectionStore.add(session.id, ws);
      ws.data.sessionId = session.id;

      connectionStore.send(ws, {
        type: "session:started",
        sessionId: session.id,
      });

      startConversation(session.id, msg.prompt, "simple").then((isReady) => {
        if (isReady) {
          const convo = getConversation(session.id);
          if (convo) triggerDesignSystemGeneration(ws, session.id, convo.enrichedPrompt);
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

      const existingConvo = getConversation(sid);
      if (existingConvo?.isReady) {
        triggerDesignSystemGeneration(ws, sid, existingConvo.enrichedPrompt);
        break;
      }

      continueConversation(sid, msg.message).then((isReady) => {
        if (isReady) {
          const convo = getConversation(sid);
          if (convo) triggerDesignSystemGeneration(ws, sid, convo.enrichedPrompt);
        }
      }).catch((err) => {
        console.error("[Conversation] Failed:", err);
        connectionStore.send(ws, { type: "error", message: "Chat failed" });
      });
      break;
    }

    case "select:designsystem": {
      const sid = ws.data.sessionId;
      if (!sid) break;

      const ds = projectStore.selectDesignSystem(sid, msg.designSystemId);
      if (!ds) {
        connectionStore.send(ws, { type: "error", message: "Design system not found" });
        break;
      }

      connectionStore.broadcast(sid, { type: "designsystem:selected", designSystem: ds });

      const convo = getConversation(sid);
      const prompt = convo?.enrichedPrompt || projectStore.getBySession(sid)?.screens[0]?.prompt || "";

      generateLayouts({ prompt, sessionId: sid, designSystem: ds }).catch((err) => {
        console.error("[Layout] Failed:", err);
        connectionStore.send(ws, { type: "error", message: "Layout generation failed" });
      });
      break;
    }

    case "update:designsystem": {
      const sid = ws.data.sessionId;
      if (!sid) break;

      const updated = projectStore.updateDesignSystemTokens(sid, msg.tokens);
      if (!updated) {
        connectionStore.send(ws, { type: "error", message: "No active design system" });
        break;
      }

      connectionStore.broadcast(sid, { type: "designsystem:updated", designSystem: updated });
      break;
    }

    case "select:layout": {
      const sid = ws.data.sessionId;
      if (!sid) break;

      const layout = projectStore.selectLayout(sid, msg.screenId, msg.layoutId);
      if (!layout) {
        connectionStore.send(ws, { type: "error", message: "Layout not found" });
        break;
      }

      connectionStore.broadcast(sid, { type: "layout:selected", screenId: msg.screenId, layoutId: msg.layoutId });

      const screen = projectStore.getScreen(sid, msg.screenId);
      if (screen) {
        connectionStore.broadcast(sid, {
          type: "screen:updated",
          screenId: msg.screenId,
          updates: { components: screen.components, status: "ready" },
        });
      }
      break;
    }

    case "add:screen": {
      const sid = ws.data.sessionId;
      if (!sid) break;

      const project = projectStore.getBySession(sid);
      if (!project?.designSystem) {
        connectionStore.send(ws, { type: "error", message: "Select a design system first" });
        break;
      }

      generateLayouts({
        prompt: msg.prompt,
        sessionId: sid,
        designSystem: project.designSystem,
      }).catch((err) => {
        console.error("[Layout] Failed:", err);
        connectionStore.send(ws, { type: "error", message: "Screen generation failed" });
      });
      break;
    }

    case "edit:screen": {
      const sid = ws.data.sessionId;
      if (!sid) break;

      const project = projectStore.getBySession(sid);
      const screen = projectStore.getScreen(sid, msg.screenId);
      if (!project?.designSystem || !screen) {
        connectionStore.send(ws, { type: "error", message: "Screen or design system not found" });
        break;
      }

      generateLayouts({
        prompt: `${screen.prompt}\n\nRefinement: ${msg.instruction}`,
        sessionId: sid,
        designSystem: project.designSystem,
        screenName: screen.name,
      }).catch((err) => {
        console.error("[Layout] Failed:", err);
        connectionStore.send(ws, { type: "error", message: "Screen edit failed" });
      });
      break;
    }

    case "regenerate:layouts": {
      const sid = ws.data.sessionId;
      if (!sid) break;

      const project = projectStore.getBySession(sid);
      const screen = projectStore.getScreen(sid, msg.screenId);
      if (!project?.designSystem || !screen) {
        connectionStore.send(ws, { type: "error", message: "Screen or design system not found" });
        break;
      }

      generateLayouts({
        prompt: screen.prompt,
        sessionId: sid,
        designSystem: project.designSystem,
        screenName: screen.name,
      }).catch((err) => {
        console.error("[Layout] Failed:", err);
        connectionStore.send(ws, { type: "error", message: "Layout regeneration failed" });
      });
      break;
    }

    case "regenerate:designsystem": {
      const sid = ws.data.sessionId;
      if (!sid) break;

      const convo = getConversation(sid);
      const prompt = convo?.enrichedPrompt || "";
      if (!prompt) {
        connectionStore.send(ws, { type: "error", message: "No design context available" });
        break;
      }

      generateDesignSystems({ prompt, sessionId: sid }).catch((err) => {
        console.error("[DesignSystem] Failed:", err);
        connectionStore.send(ws, { type: "error", message: "Design system regeneration failed" });
      });
      break;
    }

    case "retry": {
      const sid = ws.data.sessionId;
      if (!sid) break;
      retryComponent(sid, msg.sessionId, msg.componentId).catch((err) => {
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
        wsSessionId: sid,
        sessionId: msg.sessionId,
        componentId: msg.componentId,
        componentName: msg.componentName,
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

    case "figma:fetch": {
      const sid = ws.data.sessionId;
      if (!sid) {
        connectionStore.send(ws, { type: "error", message: "No active session" });
        break;
      }

      fetchFigmaAsReference({
        wsSessionId: sid,
        figmaUrl: msg.figmaUrl,
        nodeId: msg.nodeId,
      }).catch((err) => {
        console.error("[FigmaFetch] Failed:", err);
        connectionStore.send(ws, { type: "error", message: "Figma fetch failed" });
      });
      break;
    }

    case "figma:import": {
      const sid = ws.data.sessionId;
      if (!sid) {
        connectionStore.send(ws, { type: "error", message: "No active session" });
        break;
      }

      importFigmaAsScreen({
        wsSessionId: sid,
        figmaUrl: msg.figmaUrl,
        nodeId: msg.nodeId,
      }).catch((err) => {
        console.error("[FigmaImport] Failed:", err);
        connectionStore.send(ws, { type: "error", message: "Figma import failed" });
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
