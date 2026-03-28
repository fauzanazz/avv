import type { ServerWebSocket } from "bun";
import type { ClientMessage, ServerMessage, FileEntry, SandboxStep, SandboxStepStatus } from "@avv/shared";
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
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { previewStore } from "./preview-store";
import { scaffoldProject, getProjectDir, getOrCreateProjectDir, cleanupTempDir } from "./chat/scaffolder";
import { startDevServer, stopDevServer, getDevServerPort } from "./chat/dev-server";
import {
  isAgentBoxAvailable,
  createSandboxSession,
  startViteInSandbox,
  syncFileToSandbox,
  destroySandbox,
  hasSandbox,
  checkSandboxHealth,
  execInSandbox,
  restoreSandboxFromStorage,
} from "./chat/sandbox-manager";
import { storage } from "./storage";

function makeSandboxProgressBroadcaster(conversationId: string) {
  return (step: SandboxStep, status: SandboxStepStatus, error?: string) => {
    connectionStore.broadcast(conversationId, {
      type: "sandbox:progress",
      conversationId,
      step,
      status,
      error,
    });
  };
}

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
      cleanupTempDir(msg.conversationId).catch(() => {});
      storage.delete(msg.conversationId).catch(() => {});
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

// ── Project File Scanner ────────────────────────────────────

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".cache", ".vite"]);

function scanProjectChanges(dir: string, since: number): string[] {
  const changed: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        changed.push(...scanProjectChanges(fullPath, since));
      } else {
        try {
          const stat = statSync(fullPath);
          if (stat.mtimeMs > since) changed.push(fullPath);
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore unreadable dirs */ }
  return changed;
}

// ── Sandbox Fallback Helper ─────────────────────────────────

async function syncFileWithFallback(
  cid: string,
  filePath: string,
  projectDir: string,
): Promise<void> {
  try {
    await syncFileToSandbox(cid, filePath, projectDir);
  } catch (err) {
    const healthy = await checkSandboxHealth(cid);
    if (!healthy) {
      console.log(`[Sandbox] Dead sandbox detected for ${cid}, falling back to local dev server`);
      await destroySandbox(cid);

      if (!getDevServerPort(cid)) {
        try { await startDevServer(cid, projectDir); } catch { /* non-fatal */ }
      }

      connectionStore.broadcast(cid, {
        type: "chat:error",
        conversationId: cid,
        error: "Sandbox disconnected — switched to local preview",
      });
      connectionStore.broadcast(cid, { type: "preview:ready", url: `/preview/${cid}/` });
    } else {
      // Sandbox is alive but sync failed (transient error) — retry once
      console.warn(`[Sandbox] Transient sync failure for ${filePath}:`, err);
      try {
        await syncFileToSandbox(cid, filePath, projectDir);
      } catch {
        console.error(`[Sandbox] Retry failed for ${filePath}, file out of sync`);
      }
    }
  }
}

// ── Bash Completion Handler ─────────────────────────────────

function handleBashCompletion(
  cid: string,
  callId: string,
  toolCalls: ToolCall[],
  bashStartTimes: Map<string, number>,
  projectDir: string | null,
): void {
  const startTime = bashStartTimes.get(callId);
  bashStartTimes.delete(callId);

  if (!projectDir || !startTime) return;

  const sandboxActive = hasSandbox(cid);

  // Scan for files created/modified by the Bash command
  const changedFiles = scanProjectChanges(projectDir, startTime);
  const alreadyTracked = new Set(previewStore.getTrackedFiles(cid));

  for (const filePath of changedFiles) {
    try {
      const content = readFileSync(filePath, "utf-8");
      const relPath = relative(projectDir, filePath);
      const isNew = !alreadyTracked.has(relPath);
      previewStore.trackFile(cid, relPath);
      storage.put(cid, relPath, content).catch(() => {});
      connectionStore.broadcast(cid, {
        type: "file:changed",
        path: relPath,
        content,
        action: isNew ? "created" : "updated",
      });
      if (sandboxActive) {
        syncFileWithFallback(cid, filePath, projectDir).catch(() => {});
      }
    } catch { /* ignore binary files */ }
  }

  // Detect pnpm add → install in sandbox
  if (sandboxActive) {
    const tracked = toolCalls.find((t) => t.id === callId);
    const cmd = (tracked?.args?.command) as string | undefined;
    if (cmd) {
      const match = cmd.match(/\bpnpm\s+add\s+(.+)/);
      if (match) {
        // Extract only valid package tokens — filter out flags and shell operators
        const PKG_PATTERN = /^(@[\w.-]+\/)?[\w.-]+(@[^\s]*)?$/;
        const packages = match[1].trim().split(/\s+/).filter((t) => PKG_PATTERN.test(t));
        if (packages.length > 0) {
          const safeList = packages.join(" ");
          execInSandbox(cid, `cd /workspace/project && npm install ${safeList}`, 120).catch(() => {});
          console.log(`[Sandbox] Syncing pnpm add: npm install ${safeList}`);
        }
      }
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
  const bashStartTimes = new Map<string, number>();
  const projectDir = getProjectDir(cid);
  const sandboxActive = hasSandbox(cid);

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
        if (filePath && existsSync(filePath) && projectDir) {
          try {
            const content = readFileSync(filePath, "utf-8");
            const relPath = relative(projectDir, filePath);
            previewStore.trackFile(cid!, relPath);
            storage.put(cid!, relPath, content).catch(() => {});
            connectionStore.broadcast(cid!, {
              type: "file:changed",
              path: relPath,
              content,
              action: resolvedTool === "Write" ? "created" : "updated",
            });
            connectionStore.broadcast(cid!, {
              type: "preview:ready",
              url: `/preview/${cid}/`,
            });
            if (sandboxActive) {
              syncFileWithFallback(cid!, filePath, projectDir).catch(() => {});
            }
          } catch { /* ignore read errors */ }
        }
      }

      // Track Bash start times for file scanning
      if (resolvedTool === "Bash" && serverMsg.status === "running") {
        bashStartTimes.set(serverMsg.callId, Date.now());
      }

      // Handle Bash completion — scan for created files + pnpm add sync
      if (resolvedTool === "Bash" && serverMsg.status === "completed") {
        handleBashCompletion(cid!, serverMsg.callId, toolCalls, bashStartTimes, projectDir);
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

    // Send file tree from all tracked files (relative paths)
    const allTrackedFiles = previewStore.getTrackedFiles(cid);
    if (allTrackedFiles.length > 0) {
      const tree = buildFileTree(allTrackedFiles);
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
  // Always use proxy URL — never expose raw sandbox IPs or localhost ports
  let useSandbox = false;
  const previewUrl = `/preview/${cid}/`;

  if (await isAgentBoxAvailable()) {
    connectionStore.broadcast(cid, {
      type: "agent:activity",
      agent: "router",
      status: "Creating sandbox environment...",
    });

    try {
      await createSandboxSession(cid, makeSandboxProgressBroadcaster(cid));
      useSandbox = true;
      console.log(`[CodeGen] Using AgentBox sandbox for ${cid}`);
    } catch (err) {
      console.warn("[CodeGen] Sandbox creation failed, falling back to local:", err);
      useSandbox = false;
    }
  }

  if (!useSandbox) {
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
  const bashStartTimes = new Map<string, number>();

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

      // File tracking + sandbox sync for Write/Edit
      if (serverMsg.status === "completed" && (resolvedTool === "Write" || resolvedTool === "Edit")) {
        const tracked = toolCalls.find((t) => t.id === serverMsg.callId);
        const filePath = (tracked?.args?.file_path ?? serverMsg.args.file_path) as string | undefined;
        if (filePath && existsSync(filePath)) {
          try {
            const content = readFileSync(filePath, "utf-8");
            const relPath = relative(projectDir, filePath);
            previewStore.trackFile(cid, relPath);
            storage.put(cid, relPath, content).catch(() => {});
            connectionStore.broadcast(cid, {
              type: "file:changed",
              path: relPath,
              content,
              action: resolvedTool === "Write" ? "created" : "updated",
            });

            if (useSandbox) {
              syncFileWithFallback(cid, filePath, projectDir).catch(() => {});
            }
          } catch { /* ignore */ }
        }
      }

      // Track Bash start times for file scanning
      if (resolvedTool === "Bash" && serverMsg.status === "running") {
        bashStartTimes.set(serverMsg.callId, Date.now());
      }

      // Handle Bash completion — scan for created files + pnpm add sync
      if (resolvedTool === "Bash" && serverMsg.status === "completed") {
        handleBashCompletion(cid, serverMsg.callId, toolCalls, bashStartTimes, projectDir);
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

    // File tree from all tracked files (relative paths)
    const allTrackedFiles = previewStore.getTrackedFiles(cid);
    if (allTrackedFiles.length > 0) {
      connectionStore.broadcast(cid, { type: "file:tree", files: buildFileTree(allTrackedFiles) });
    }

    // Persist
    if (fullText) {
      const metadata: MessageMetadata = {};
      if (thinkingSteps.length > 0) metadata.thinkingSteps = thinkingSteps;
      if (toolCalls.length > 0) metadata.toolCalls = toolCalls;
      appendMessage(cid, "assistant", fullText, Object.keys(metadata).length > 0 ? metadata : undefined);
    }

    // Clean up ephemeral temp dir (no-op in dev)
    cleanupTempDir(cid).catch(() => {});
  } catch (err) {
    console.error("[CodeGen] Failed:", err);
    connectionStore.broadcast(cid, { type: "chat:error", conversationId: cid, error: "Code generation failed" });
  }
}

// ── File State Restore ───────────────────────────────────────

async function restoreFileState(ws: ServerWebSocket<WSData>, conversationId: string): Promise<void> {
  const trackedFiles = previewStore.getTrackedFiles(conversationId);
  if (trackedFiles.length === 0) return;

  // Send file contents from storage (relative paths)
  for (const relPath of trackedFiles) {
    try {
      const content = await storage.get(conversationId, relPath);
      if (content) {
        connectionStore.send(ws, {
          type: "file:changed",
          path: relPath,
          content,
          action: "created",
        });
      }
    } catch { /* ignore */ }
  }

  // Send file tree
  const tree = buildFileTree(trackedFiles);
  connectionStore.send(ws, { type: "file:tree", files: tree });

  // Restore preview — try sandbox first, fall back to local dev server
  let hasPreview = false;

  if (!hasSandbox(conversationId) && await isAgentBoxAvailable()) {
    try {
      const progress = makeSandboxProgressBroadcaster(conversationId);
      // Boot sandbox WITHOUT starting Vite — restore files first so Vite
      // builds its module graph from the complete file set, not the skeleton template.
      const session = await createSandboxSession(conversationId, progress, { startVite: false });
      await restoreSandboxFromStorage(conversationId);
      await startViteInSandbox(conversationId, progress);
      hasPreview = true;
      console.log(`[Restore] Sandbox recreated for ${conversationId} on port ${session.hostPort}`);
    } catch (err) {
      console.error(`[Restore] Sandbox creation failed for ${conversationId}:`, err);
      // Fall through to local dev server
    }
  } else if (hasSandbox(conversationId)) {
    hasPreview = true;
  }

  // Fall back to local dev server (dev mode only — gated in startDevServer)
  if (!hasPreview) {
    const projectDir = await getOrCreateProjectDir(conversationId);
    if (projectDir && !getDevServerPort(conversationId)) {
      try { await startDevServer(conversationId, projectDir); } catch { /* non-fatal */ }
    }
  }

  connectionStore.send(ws, {
    type: "preview:ready",
    url: `/preview/${conversationId}/`,
  });
}

// ── File Tree Builder ────────────────────────────────────────

function buildFileTree(filePaths: string[]): FileEntry[] {
  // Paths are already relative (e.g., "src/App.tsx")
  const dirMap = new Map<string, FileEntry>();
  const rootFiles: FileEntry[] = [];

  for (const relPath of filePaths) {
    const parts = relPath.split("/").filter(Boolean);

    if (parts.length === 1) {
      rootFiles.push({
        name: parts[0],
        path: relPath,
        isDirectory: false,
      });
    } else {
      let currentPath = "";
      let parentChildren = rootFiles;

      for (let i = 0; i < parts.length - 1; i++) {
        currentPath += (currentPath ? "/" : "") + parts[i];
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
        path: relPath,
        isDirectory: false,
      });
    }
  }

  return rootFiles;
}
