import type { ServerWebSocket } from "bun";
import type { ClientMessage, ServerMessage, FileEntry } from "@avv/shared";
import { connectionStore, type WSData } from "./store";
import {
  createConversation,
  getConversation,
  listConversations,
  deleteConversation,
  renameConversation,
  appendMessage,
  getMessages,
} from "./chat/conversation-manager";
import { runAgent, cancelAgent, isAgentRunning } from "./chat/agent";
import { runPromptBuilder, cancelPromptBuilder, isPromptBuilderRunning } from "./chat/prompt-builder";
import { savePrompt, getPrompt, updatePromptContent } from "./chat/prompt-manager";
import { setSetting } from "./chat/settings-manager";
import { connectGitHub, createRepo, getGitHubConfig } from "./github";
import { classifyMessage, type Route } from "./chat/router";
import type { MessageMetadata, ThinkingStep, ToolCall, AgentOutput } from "@avv/shared";
import { existsSync, readFileSync } from "fs";
import { basename, dirname } from "path";
import { previewStore } from "./preview-store";
import { scaffoldProject, getProjectDir as getScaffoldedDir } from "./chat/scaffolder";
import { startDevServer, stopDevServer, getDevServerPort } from "./chat/dev-server";
import {
  isAgentBoxAvailable,
  createSandboxSession,
  syncFileToSandbox,
  getSandboxPreviewUrl,
  destroySandbox,
} from "./chat/sandbox-manager";

export function createWSHandler() {
  return {
    open(ws: ServerWebSocket<WSData>) {
      const { conversationId } = ws.data;
      console.log(`[WS] Client connected (conversation: ${conversationId ?? "none"})`);

      if (conversationId) {
        connectionStore.add(conversationId, ws);
      }
    },

    message(ws: ServerWebSocket<WSData>, raw: string | Buffer) {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
      } catch {
        connectionStore.send(ws, { type: "error", message: "Invalid message format" });
        return;
      }

      try {
        handleClientMessage(ws, msg);
      } catch (err) {
        console.error("[WS] Handler error:", err);
        connectionStore.send(ws, { type: "error", message: "Internal server error" });
      }
    },

    close(ws: ServerWebSocket<WSData>) {
      console.log("[WS] Client disconnected");
      connectionStore.remove(ws);
    },
  };
}

async function handleClientMessage(
  ws: ServerWebSocket<WSData>,
  msg: ClientMessage,
): Promise<void> {
  switch (msg.type) {
    case "chat:send": {
      await handleChatSend(ws, msg.message, msg.conversationId);
      break;
    }

    case "chat:cancel": {
      const cid = ws.data.conversationId;
      if (cid) {
        cancelAgent(cid);
        cancelPromptBuilder(cid);
      }
      break;
    }

    case "conversation:list": {
      const conversations = listConversations();
      connectionStore.send(ws, { type: "conversations:list", conversations });
      break;
    }

    case "conversation:new": {
      const convo = createConversation();
      connectionStore.remove(ws);
      ws.data.conversationId = convo.id;
      connectionStore.add(convo.id, ws);
      connectionStore.send(ws, {
        type: "conversation:loaded",
        conversation: convo,
        messages: [],
      });
      break;
    }

    case "conversation:load": {
      const convo = getConversation(msg.conversationId);
      if (!convo) {
        connectionStore.send(ws, { type: "error", message: "Conversation not found" });
        break;
      }
      connectionStore.remove(ws);
      ws.data.conversationId = convo.id;
      connectionStore.add(convo.id, ws);
      const messages = getMessages(convo.id);
      connectionStore.send(ws, {
        type: "conversation:loaded",
        conversation: convo,
        messages,
      });

      // Restore file state from previewStore
      restoreFileState(ws, convo.id);
      break;
    }

    case "conversation:delete": {
      stopDevServer(msg.conversationId);
      destroySandbox(msg.conversationId).catch(() => {});
      deleteConversation(msg.conversationId);
      const conversations = listConversations();
      connectionStore.send(ws, { type: "conversations:list", conversations });
      break;
    }

    case "conversation:rename": {
      renameConversation(msg.conversationId, msg.title);
      break;
    }

    case "prompt:edit": {
      updatePromptContent(msg.promptId, msg.content);
      break;
    }

    case "prompt:approve": {
      const prompt = getPrompt(msg.promptId);
      if (!prompt) {
        connectionStore.send(ws, { type: "error", message: "Prompt not found" });
        break;
      }
      const cid = ws.data.conversationId;
      if (!cid) break;

      // Run code generation with the approved prompt
      handleCodeGeneration(ws, cid, prompt.content);
      break;
    }

    case "github:connect": {
      try {
        connectionStore.send(ws, {
          type: "github:status",
          status: "connecting",
        });
        const config = await connectGitHub(msg.token);
        connectionStore.send(ws, {
          type: "github:status",
          status: "done",
          repo: config.username ?? undefined,
        });
      } catch (err) {
        connectionStore.send(ws, {
          type: "github:status",
          status: "error",
          error: err instanceof Error ? err.message : "Connection failed",
        });
      }
      break;
    }

    case "github:push": {
      const cid = ws.data.conversationId;
      if (!cid) {
        connectionStore.send(ws, { type: "error", message: "No active conversation" });
        break;
      }

      try {
        connectionStore.broadcast(cid, { type: "github:status", status: "pushing" });

        // Get tracked files for this conversation from fileContents
        // For now, collect files from the last agent run's tool calls
        const ghConfig = getGitHubConfig();
        if (!ghConfig?.token) {
          connectionStore.broadcast(cid, {
            type: "github:status",
            status: "error",
            error: "GitHub not connected. Add your PAT in settings.",
          });
          break;
        }

        const repoName = msg.repo ?? `avv-project-${Date.now()}`;
        const repo = await createRepo(repoName);

        // Push any tracked file contents
        // The client sends fileContents via the push message
        // For now, create an empty initial commit — files will be pushed separately
        connectionStore.broadcast(cid, {
          type: "github:status",
          status: "done",
          repo: repo.htmlUrl,
        });
      } catch (err) {
        connectionStore.broadcast(cid, {
          type: "github:status",
          status: "error",
          error: err instanceof Error ? err.message : "Push failed",
        });
      }
      break;
    }

    case "settings:update": {
      setSetting(msg.key, msg.value);
      break;
    }
  }
}

// ── Chat Send Handler ────────────────────────────────────────

async function handleChatSend(
  ws: ServerWebSocket<WSData>,
  message: string,
  conversationId?: string,
): Promise<void> {
  // Get or create conversation
  let cid = conversationId ?? ws.data.conversationId;

  if (!cid || !getConversation(cid)) {
    // Auto-create conversation with first message as title
    const title = message.length > 50 ? message.slice(0, 50) + "..." : message;
    const convo = createConversation(title);
    cid = convo.id;

    // Re-associate connection
    connectionStore.remove(ws);
    ws.data.conversationId = cid;
    connectionStore.add(cid, ws);

    connectionStore.send(ws, {
      type: "conversation:loaded",
      conversation: convo,
      messages: [],
    });
  }

  // Don't allow concurrent agent runs on same conversation
  if (isAgentRunning(cid) || isPromptBuilderRunning(cid)) {
    connectionStore.send(ws, {
      type: "chat:error",
      conversationId: cid,
      error: "Agent is already running. Cancel it first.",
    });
    return;
  }

  // Persist user message
  appendMessage(cid, "user", message);

  // Classify and route
  const route: Route = classifyMessage(message);
  console.log(`[Router] "${message.slice(0, 60)}" → ${route}`);

  if (route === "build") {
    connectionStore.broadcast(cid, {
      type: "agent:activity",
      agent: "router",
      status: "Build request detected — activating prompt builder team",
    });
    await handlePromptBuild(ws, cid, message);
    return;
  }

  // Track metadata for the assistant message
  const thinkingSteps: ThinkingStep[] = [];
  const toolCalls: ToolCall[] = [];
  let assistantText = "";

  const onMessage = (serverMsg: ServerMessage) => {
    // Collect metadata
    if (serverMsg.type === "chat:thinking") {
      thinkingSteps.push({
        content: serverMsg.content,
        timestamp: Date.now(),
      });
    }
    if (serverMsg.type === "chat:tool_call") {
      const existing = toolCalls.find((t) => t.id === serverMsg.callId);
      // Resolve the actual tool name (user message replay sends empty tool name)
      const resolvedTool = serverMsg.tool || existing?.tool || "";

      if (existing) {
        existing.status = serverMsg.status;
        if (serverMsg.result) existing.result = serverMsg.result;
        if (resolvedTool && !existing.tool) existing.tool = resolvedTool;
        // Merge args if new ones come in
        if (Object.keys(serverMsg.args).length > 0) {
          existing.args = { ...existing.args, ...serverMsg.args };
        }
      } else {
        toolCalls.push({
          id: serverMsg.callId,
          tool: resolvedTool,
          args: serverMsg.args,
          result: serverMsg.result,
          status: serverMsg.status,
        });
      }

      // Emit file events when Write/Edit completes
      if (serverMsg.status === "completed" && (resolvedTool === "Write" || resolvedTool === "Edit")) {
        const tracked = toolCalls.find((t) => t.id === serverMsg.callId);
        const filePath = (tracked?.args?.file_path ?? serverMsg.args.file_path) as string | undefined;
        if (filePath && existsSync(filePath)) {
          try {
            const content = readFileSync(filePath, "utf-8");
            // Track for static serving
            previewStore.trackFile(cid!, filePath);
            connectionStore.broadcast(cid!, {
              type: "file:changed",
              path: filePath,
              content,
              action: resolvedTool === "Write" ? "created" : "updated",
            });
            // Send preview URL
            connectionStore.broadcast(cid!, {
              type: "preview:ready",
              url: `/preview/${cid}/index.html`,
            });
          } catch { /* ignore read errors */ }
        }
      }
    }
    if (serverMsg.type === "chat:text" && !("streaming" in serverMsg && serverMsg.streaming)) {
      assistantText += serverMsg.content;
    }

    // Forward to client
    connectionStore.broadcast(cid!, serverMsg);
  };

  try {
    const fullText = await runAgent({
      conversationId: cid,
      prompt: message,
      onMessage,
    });

    // Send file tree if any file events were emitted
    const trackedFiles = toolCalls
      .filter((t) => (t.tool === "Write" || t.tool === "Edit") && t.status === "completed")
      .map((t) => t.args.file_path as string)
      .filter(Boolean);

    if (trackedFiles.length > 0) {
      const tree = buildFileTree(trackedFiles);
      connectionStore.broadcast(cid, { type: "file:tree", files: tree });
    }

    // Persist assistant message with metadata
    const finalText = fullText || assistantText;
    if (finalText) {
      const metadata: MessageMetadata = {};
      if (thinkingSteps.length > 0) metadata.thinkingSteps = thinkingSteps;
      if (toolCalls.length > 0) metadata.toolCalls = toolCalls;

      appendMessage(
        cid,
        "assistant",
        finalText,
        Object.keys(metadata).length > 0 ? metadata : undefined,
      );
    }
  } catch (err) {
    console.error("[Chat] Agent failed:", err);
    connectionStore.broadcast(cid, {
      type: "chat:error",
      conversationId: cid,
      error: "Agent execution failed",
    });
  }
}

// ── Prompt Builder Handler ────────────────────────────────────

async function handlePromptBuild(
  _ws: ServerWebSocket<WSData>,
  cid: string,
  userRequest: string,
): Promise<void> {
  try {
    const result = await runPromptBuilder({
      conversationId: cid,
      userRequest,
      onMessage: (msg) => connectionStore.broadcast(cid, msg),
    });

    if (result.mergedPrompt) {
      // Convert agentsOutput record to AgentOutput array
      const agentsOutput: AgentOutput[] = Object.entries(result.agentsOutput).map(
        ([agent, output]) => ({
          agent: agent as AgentOutput["agent"],
          output,
          timestamp: Date.now(),
        }),
      );

      // Save prompt to DB
      const title = userRequest.length > 50
        ? userRequest.slice(0, 50) + "..."
        : userRequest;
      const prompt = savePrompt(cid, title, result.mergedPrompt, agentsOutput);

      // Persist as assistant message
      appendMessage(cid, "assistant", `Prompt ready for review (${Object.keys(result.agentsOutput).length} agents contributed)`);

      // Send prompt:complete to client
      connectionStore.broadcast(cid, {
        type: "prompt:complete",
        promptId: prompt.id,
        content: result.mergedPrompt,
        agentsOutput: result.agentsOutput,
      });
    }
  } catch (err) {
    console.error("[PromptBuilder] Failed:", err);
    connectionStore.broadcast(cid, {
      type: "chat:error",
      conversationId: cid,
      error: "Prompt builder failed",
    });
  }
}

// ── Code Generation Handler ──────────────────────────────────

const CODE_GEN_SYSTEM_PROMPT = `You are an expert frontend engineer. You are working inside a pre-scaffolded Vite + React + TypeScript project.

## Project Structure
The project is already set up at the current working directory with:
- React 19 + TypeScript
- Vite 6 (dev server is running — hot reload active)
- Tailwind CSS v4 (use @import "tailwindcss" in CSS, utility classes in JSX)
- Framer Motion (import { motion, AnimatePresence } from "framer-motion")
- Lucide React (import { IconName } from "lucide-react")

## Rules
- Write all components in the src/ directory
- Use TypeScript (.tsx) for all React components
- Use Tailwind CSS classes for all styling — avoid separate CSS files unless truly needed
- Use Framer Motion for animations and transitions
- Use Lucide React for icons
- Edit src/App.tsx as the main entry component
- Create subdirectories in src/ as needed (e.g., src/components/, src/sections/, src/lib/)
- Do NOT modify package.json, vite.config.ts, or tsconfig.json
- You MAY add dependencies via the Bash tool: pnpm add <package>
- The dev server is already running — just write files and they will hot-reload
- Generate clean, production-ready code based on the provided specification
- Write complete implementations, not stubs or placeholders`;

async function handleCodeGeneration(
  ws: ServerWebSocket<WSData>,
  cid: string,
  prompt: string,
): Promise<void> {
  if (isAgentRunning(cid)) {
    connectionStore.send(ws, {
      type: "chat:error",
      conversationId: cid,
      error: "Agent is already running",
    });
    return;
  }

  // ── Scaffold project (always local — agent writes here) ────
  connectionStore.broadcast(cid, {
    type: "agent:activity",
    agent: "router",
    status: "Scaffolding Vite + React project...",
  });

  let projectDir: string;
  try {
    projectDir = await scaffoldProject(cid);
  } catch (err) {
    console.error("[CodeGen] Scaffold failed:", err);
    connectionStore.broadcast(cid, {
      type: "chat:error",
      conversationId: cid,
      error: `Project scaffolding failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    });
    return;
  }

  // ── Try AgentBox sandbox for preview, fall back to local dev server ──
  let useSandbox = false;
  let previewUrl = `/preview/${cid}/`;

  if (await isAgentBoxAvailable()) {
    connectionStore.broadcast(cid, {
      type: "agent:activity",
      agent: "router",
      status: "Creating sandbox environment...",
    });

    try {
      await createSandboxSession(cid);
      useSandbox = true;
      previewUrl = getSandboxPreviewUrl(cid) ?? `/preview/${cid}/`;
      console.log(`[CodeGen] Using AgentBox sandbox for ${cid}`);
    } catch (err) {
      console.warn("[CodeGen] Sandbox creation failed, falling back to local:", err);
      useSandbox = false;
    }
  }

  if (!useSandbox) {
    // Fall back to local Vite dev server
    connectionStore.broadcast(cid, {
      type: "agent:activity",
      agent: "router",
      status: "Starting local Vite dev server...",
    });

    try {
      await startDevServer(cid, projectDir);
    } catch (err) {
      console.error("[CodeGen] Dev server start failed:", err);
    }

    previewUrl = getDevServerPort(cid)
      ? `http://localhost:${getDevServerPort(cid)}/`
      : `/preview/${cid}/`;
  }

  connectionStore.broadcast(cid, { type: "preview:ready", url: previewUrl });

  connectionStore.broadcast(cid, {
    type: "agent:activity",
    agent: "router",
    status: "Generating code from approved prompt",
  });

  // ── Run code generation agent ───────────────────────────────
  const thinkingSteps: ThinkingStep[] = [];
  const toolCalls: ToolCall[] = [];

  const onMessage = (serverMsg: ServerMessage) => {
    if (serverMsg.type === "chat:thinking") {
      thinkingSteps.push({ content: serverMsg.content, timestamp: Date.now() });
    }
    if (serverMsg.type === "chat:tool_call") {
      const existing = toolCalls.find((t) => t.id === serverMsg.callId);
      const resolvedTool = serverMsg.tool || existing?.tool || "";

      if (existing) {
        existing.status = serverMsg.status;
        if (serverMsg.result) existing.result = serverMsg.result;
        if (resolvedTool && !existing.tool) existing.tool = resolvedTool;
        if (Object.keys(serverMsg.args).length > 0) existing.args = { ...existing.args, ...serverMsg.args };
      } else {
        toolCalls.push({
          id: serverMsg.callId,
          tool: resolvedTool,
          args: serverMsg.args,
          result: serverMsg.result,
          status: serverMsg.status,
        });
      }

      // File tracking + sandbox sync
      if (serverMsg.status === "completed" && (resolvedTool === "Write" || resolvedTool === "Edit")) {
        const tracked = toolCalls.find((t) => t.id === serverMsg.callId);
        const filePath = (tracked?.args?.file_path ?? serverMsg.args.file_path) as string | undefined;
        if (filePath && existsSync(filePath)) {
          try {
            const content = readFileSync(filePath, "utf-8");
            previewStore.trackFile(cid, filePath);
            connectionStore.broadcast(cid, {
              type: "file:changed",
              path: filePath,
              content,
              action: resolvedTool === "Write" ? "created" : "updated",
            });

            // Sync to sandbox if active
            if (useSandbox) {
              syncFileToSandbox(cid, filePath, projectDir).catch(() => {});
            }
          } catch { /* ignore */ }
        }
      }
    }

    connectionStore.broadcast(cid, serverMsg);
  };

  try {
    const fullText = await runAgent({
      conversationId: cid,
      prompt,
      systemPrompt: CODE_GEN_SYSTEM_PROMPT,
      onMessage,
      cwd: projectDir,
    });

    // File tree
    const trackedFiles = toolCalls
      .filter((t) => (t.tool === "Write" || t.tool === "Edit") && t.status === "completed")
      .map((t) => t.args.file_path as string)
      .filter(Boolean);
    if (trackedFiles.length > 0) {
      connectionStore.broadcast(cid, { type: "file:tree", files: buildFileTree(trackedFiles) });
    }

    // Persist
    if (fullText) {
      const metadata: MessageMetadata = {};
      if (thinkingSteps.length > 0) metadata.thinkingSteps = thinkingSteps;
      if (toolCalls.length > 0) metadata.toolCalls = toolCalls;
      appendMessage(cid, "assistant", fullText, Object.keys(metadata).length > 0 ? metadata : undefined);
    }
  } catch (err) {
    console.error("[CodeGen] Failed:", err);
    connectionStore.broadcast(cid, { type: "chat:error", conversationId: cid, error: "Code generation failed" });
  }
}

// ── File State Restore ───────────────────────────────────────

async function restoreFileState(ws: ServerWebSocket<WSData>, conversationId: string): Promise<void> {
  const trackedFiles = previewStore.getTrackedFiles(conversationId);
  if (trackedFiles.length === 0) return;

  // Send file contents for each tracked file
  for (const filePath of trackedFiles) {
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf-8");
        connectionStore.send(ws, {
          type: "file:changed",
          path: filePath,
          content,
          action: "created",
        });
      } catch { /* ignore */ }
    }
  }

  // Send file tree
  const tree = buildFileTree(trackedFiles);
  connectionStore.send(ws, { type: "file:tree", files: tree });

  // Restore preview — try sandbox first, fall back to local dev server
  const projectDir = getScaffoldedDir(conversationId);
  let previewUrl: string | null = null;

  if (projectDir) {
    // Try sandbox if available and no active session exists
    if (!getSandboxPreviewUrl(conversationId) && await isAgentBoxAvailable()) {
      try {
        const session = await createSandboxSession(conversationId);
        // Re-upload all tracked files to the fresh sandbox
        for (const filePath of trackedFiles) {
          if (existsSync(filePath)) {
            await syncFileToSandbox(conversationId, filePath, projectDir).catch(() => {});
          }
        }
        previewUrl = getSandboxPreviewUrl(conversationId);
        console.log(`[Restore] Sandbox recreated for ${conversationId} on port ${session.hostPort}`);
      } catch {
        // Sandbox unavailable, fall through to local
      }
    } else if (getSandboxPreviewUrl(conversationId)) {
      previewUrl = getSandboxPreviewUrl(conversationId);
    }

    // Fall back to local dev server
    if (!previewUrl) {
      if (!getDevServerPort(conversationId)) {
        try {
          await startDevServer(conversationId, projectDir);
        } catch {
          // Non-fatal
        }
      }
      const devPort = getDevServerPort(conversationId);
      previewUrl = devPort
        ? `http://localhost:${devPort}/`
        : `/preview/${conversationId}/`;
    }
  }

  if (previewUrl) {
    connectionStore.send(ws, {
      type: "preview:ready",
      url: previewUrl,
    });
  }
}

// ── File Tree Builder ────────────────────────────────────────

function buildFileTree(filePaths: string[]): FileEntry[] {
  // Group files by their directory structure
  const dirMap = new Map<string, FileEntry>();
  const rootFiles: FileEntry[] = [];

  // Find common prefix to make paths relative
  const commonPrefix = filePaths.length > 1
    ? findCommonPrefix(filePaths)
    : dirname(filePaths[0]) + "/";

  for (const fullPath of filePaths) {
    const relPath = fullPath.startsWith(commonPrefix)
      ? fullPath.slice(commonPrefix.length)
      : basename(fullPath);

    const parts = relPath.split("/").filter(Boolean);

    if (parts.length === 1) {
      rootFiles.push({
        name: parts[0],
        path: fullPath,
        isDirectory: false,
      });
    } else {
      // Ensure parent directories exist
      let currentPath = commonPrefix;
      let parentChildren = rootFiles;

      for (let i = 0; i < parts.length - 1; i++) {
        currentPath += parts[i] + "/";
        let dir = dirMap.get(currentPath);
        if (!dir) {
          dir = {
            name: parts[i],
            path: currentPath,
            isDirectory: true,
            children: [],
          };
          dirMap.set(currentPath, dir);
          parentChildren.push(dir);
        }
        parentChildren = dir.children!;
      }

      parentChildren.push({
        name: parts[parts.length - 1],
        path: fullPath,
        isDirectory: false,
      });
    }
  }

  return rootFiles;
}

function findCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return "";
  const parts = paths[0].split("/");
  let prefix = "";
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = prefix + parts[i] + "/";
    if (paths.every((p) => p.startsWith(candidate))) {
      prefix = candidate;
    } else {
      break;
    }
  }
  return prefix;
}
