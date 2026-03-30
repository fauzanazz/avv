import { Sandbox } from "agentbox";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import type { SandboxStep, SandboxStepStatus } from "@avv/shared";
import { storage } from "../storage";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import { createChildLogger } from "../logger";

const log = createChildLogger("sandbox");

const AGENTBOX_URL = process.env.AGENTBOX_URL ?? "http://178.128.214.76:8080";
const TEMPLATE_DIR = join(import.meta.dir, "../../template");
const WORKSPACE = "/workspace/project";
const VITE_GUEST_PORT = 5173;

interface SandboxSession {
  sandbox: Sandbox;
  hostPort: number;
  conversationId: string;
  lastActivity: number;
}

const activeSandboxes = new Map<string, SandboxSession>();

// ── Persistence helpers ────────────────────────────────────────

function persistSandbox(conversationId: string, sandboxId: string, hostPort: number): void {
  try {
    db.insert(schema.sandboxes)
      .values({ conversationId, sandboxId, hostPort, createdAt: Date.now() })
      .onConflictDoUpdate({
        target: schema.sandboxes.conversationId,
        set: { sandboxId, hostPort, createdAt: Date.now() },
      })
      .run();
  } catch (err) {
    // FK constraint fails if conversation doesn't exist yet — non-fatal
    log.warn({ conversationId, err }, "Failed to persist sandbox");
  }
}

function unpersistSandbox(conversationId: string): void {
  db.delete(schema.sandboxes).where(eq(schema.sandboxes.conversationId, conversationId)).run();
}

/**
 * Reconcile persisted sandbox records with the AgentBox server on startup.
 * - Reconnects to sandboxes that are still alive
 * - Cleans up DB rows for dead sandboxes
 * - Destroys orphaned sandboxes on the server that have no DB record
 */
export async function reconcileSandboxes(): Promise<void> {
  if (!(await isAgentBoxAvailable())) {
    log.info("AgentBox not available — skipping reconciliation");
    return;
  }

  const persisted = db.select().from(schema.sandboxes).all();
  const remoteSandboxes = await Sandbox.list({ url: AGENTBOX_URL });
  const remoteIds = new Set(remoteSandboxes.map((s) => s.id));
  const persistedIds = new Set(persisted.map((r) => r.sandboxId));

  // Reconnect to persisted sandboxes that are still alive on the server
  let reconnected = 0;
  for (const row of persisted) {
    if (remoteIds.has(row.sandboxId)) {
      const sandbox = Sandbox.connect(row.sandboxId, { url: AGENTBOX_URL });
      try {
        const result = await sandbox.exec("echo ok", 5);
        if (result.exit_code === 0) {
          activeSandboxes.set(row.conversationId, {
            sandbox,
            hostPort: row.hostPort,
            conversationId: row.conversationId,
            lastActivity: Date.now(),
          });
          reconnected++;
          continue;
        }
      } catch { /* dead */ }
      // Sandbox exists but is unresponsive — destroy it
      await sandbox.destroy().catch(() => {});
    }
    // Dead or missing — clean up DB
    unpersistSandbox(row.conversationId);
  }

  // Destroy orphaned sandboxes (on server but not in our DB)
  let orphansDestroyed = 0;
  for (const remote of remoteSandboxes) {
    if (!persistedIds.has(remote.id)) {
      const orphan = Sandbox.connect(remote.id, { url: AGENTBOX_URL });
      await orphan.destroy().catch(() => {});
      orphansDestroyed++;
    }
  }

  log.info(
    { reconnected, staleCleaned: persisted.length - reconnected, orphansDestroyed },
    "Reconciliation complete",
  );
}

export type SandboxProgressCallback = (
  step: SandboxStep,
  status: SandboxStepStatus,
  error?: string,
) => void;

/**
 * Poll inside the guest until Vite responds on the expected port.
 */
async function waitForViteReady(sandbox: Sandbox, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // Use bash built-in /dev/tcp — no wget/curl dependency
      const result = await sandbox.exec(
        `bash -c 'echo > /dev/tcp/127.0.0.1/${VITE_GUEST_PORT}' 2>/dev/null && echo ok || echo fail`,
        5,
      );
      if (result.stdout.trim() === "ok") return;
    } catch {
      // exec timeout — Vite not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Vite dev server failed to become ready within ${timeoutMs / 1000}s`);
}

/**
 * Check if the AgentBox daemon is reachable.
 */
export async function isAgentBoxAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${AGENTBOX_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Create a sandbox, upload the template, install deps, start Vite dev server,
 * and set up port forwarding. Returns the host URL for preview.
 *
 * Each step reports progress via the optional `onProgress` callback so the
 * frontend can show a real-time loading screen.
 */
export async function createSandboxSession(
  conversationId: string,
  onProgress?: SandboxProgressCallback,
  options?: { startVite?: boolean },
): Promise<SandboxSession> {
  const startVite = options?.startVite ?? true;

  // Return existing if already running
  const existing = activeSandboxes.get(conversationId);
  if (existing) return existing;

  // Step 1: Boot sandbox
  onProgress?.("boot", "running");
  const sandbox = await Sandbox.create({
    url: AGENTBOX_URL,
    memory_mb: 2048,
    vcpus: 2,
    network: true,
    timeout: 3600,
    disk_size_mb: 2048,
  });

  try {
    await sandbox.exec("ip link set lo up && ip addr add 127.0.0.1/8 dev lo 2>/dev/null; true");
    await sandbox.exec(`mkdir -p ${WORKSPACE}`);
    onProgress?.("boot", "done");

    // Step 2: Upload template
    onProgress?.("upload", "running");
    await uploadDirectory(sandbox, TEMPLATE_DIR, WORKSPACE);
    onProgress?.("upload", "done");

    // Step 3: Install dependencies
    onProgress?.("install", "running");
    const installResult = await sandbox.exec(
      `cd ${WORKSPACE} && npm install`,
      120, // 2 min timeout for install
    );
    if (installResult.exit_code !== 0) {
      const errMsg = `npm install failed: ${installResult.stderr}`;
      onProgress?.("install", "error", errMsg);
      throw new Error(errMsg);
    }
    onProgress?.("install", "done");

    // Step 4: Port forwarding (before Vite so startViteInSandbox can use the session)
    onProgress?.("connect", "running");
    const forward = await sandbox.portForward(VITE_GUEST_PORT);
    onProgress?.("connect", "done");

    const session: SandboxSession = {
      sandbox,
      hostPort: forward.host_port,
      conversationId,
      lastActivity: Date.now(),
    };
    activeSandboxes.set(conversationId, session);
    persistSandbox(conversationId, sandbox.id, forward.host_port);

    // Step 5: Start Vite (skipped during restore — files are uploaded first)
    if (startVite) {
      await startViteInSandbox(conversationId, onProgress);
    }

    log.info(
      { conversationId, previewUrl: `http://${forward.local_address}/` },
      "Sandbox created",
    );
    return session;
  } catch (err) {
    // Clean up on failure
    activeSandboxes.delete(conversationId);
    unpersistSandbox(conversationId);
    await sandbox.destroy().catch(() => {});
    throw err;
  }
}

/**
 * Start (or restart) the Vite dev server inside a sandbox.
 * Call this after all project files are in place.
 */
export async function startViteInSandbox(
  conversationId: string,
  onProgress?: SandboxProgressCallback,
): Promise<void> {
  const session = activeSandboxes.get(conversationId);
  if (!session) throw new Error(`No sandbox session for ${conversationId}`);

  onProgress?.("vite", "running");
  await session.sandbox.exec(
    `cd ${WORKSPACE} && nohup npx vite --port ${VITE_GUEST_PORT} --host 0.0.0.0 > /tmp/vite.log 2>&1 &`,
    5,
  );
  try {
    await waitForViteReady(session.sandbox, 60000);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Vite startup failed";
    onProgress?.("vite", "error", errMsg);
    throw err;
  }
  onProgress?.("vite", "done");
}

/**
 * Sync a file to the sandbox. Call this after the agent writes/edits a file.
 */
export async function syncFileToSandbox(
  conversationId: string,
  localFilePath: string,
  projectDir: string,
): Promise<void> {
  const session = activeSandboxes.get(conversationId);
  if (!session) return;

  try {
    session.lastActivity = Date.now();
    const relPath = relative(projectDir, localFilePath);
    const remotePath = `${WORKSPACE}/${relPath}`;

    // Ensure parent directory exists
    const remoteDir = remotePath.substring(0, remotePath.lastIndexOf("/"));
    await session.sandbox.exec(`mkdir -p ${remoteDir}`);

    // Upload file content
    const content = readFileSync(localFilePath);
    await session.sandbox.uploadContent(new Uint8Array(content), remotePath);
  } catch (err) {
    log.error({ conversationId, localFilePath, err }, "File sync failed");
    throw err; // Re-throw so callers can detect failures and fall back
  }
}

/**
 * Get the preview URL for a sandbox session.
 */
export function getSandboxPreviewUrl(conversationId: string): string | null {
  const session = activeSandboxes.get(conversationId);
  if (!session) return null;
  const host = new URL(AGENTBOX_URL).hostname;
  return `http://${host}:${session.hostPort}/`;
}

/**
 * Destroy a sandbox session.
 */
export async function destroySandbox(conversationId: string): Promise<void> {
  const session = activeSandboxes.get(conversationId);
  if (!session) return;

  // Delete from map + DB first to prevent concurrent callers from acting on a stale session
  activeSandboxes.delete(conversationId);
  unpersistSandbox(conversationId);

  try {
    await session.sandbox.destroy();
  } catch (err) {
    log.error({ conversationId, err }, "Destroy failed");
  }
  log.info({ conversationId }, "Sandbox destroyed");
}

/**
 * Destroy all active sandboxes. Call on API shutdown.
 */
export async function destroyAllSandboxes(): Promise<void> {
  const promises = Array.from(activeSandboxes.keys()).map(destroySandbox);
  await Promise.allSettled(promises);
}

/**
 * Check if a sandbox exists for a conversation.
 */
export function hasSandbox(conversationId: string): boolean {
  return activeSandboxes.has(conversationId);
}

/**
 * Get the host port for proxy use.
 */
export function getSandboxHostPort(conversationId: string): number | null {
  return activeSandboxes.get(conversationId)?.hostPort ?? null;
}

/**
 * Touch sandbox activity timestamp.
 */
export function touchSandbox(conversationId: string): void {
  const session = activeSandboxes.get(conversationId);
  if (session) session.lastActivity = Date.now();
}

/**
 * Check if a sandbox is still responsive.
 */
export async function checkSandboxHealth(conversationId: string): Promise<boolean> {
  const session = activeSandboxes.get(conversationId);
  if (!session) return false;
  try {
    const result = await session.sandbox.exec("echo ok", 5);
    return result.exit_code === 0;
  } catch {
    return false;
  }
}

/**
 * Run a command inside the sandbox. Returns null if sandbox is dead.
 */
export async function execInSandbox(
  conversationId: string,
  command: string,
  timeout?: number,
): Promise<{ exit_code: number; stdout: string; stderr: string } | null> {
  const session = activeSandboxes.get(conversationId);
  if (!session) return null;
  try {
    session.lastActivity = Date.now();
    return await session.sandbox.exec(command, timeout);
  } catch (err) {
    log.error({ conversationId, err }, "Exec failed");
    return null;
  }
}

/**
 * Sync file content directly to the sandbox without reading from local disk.
 * Use this when you already have the content (e.g., from storage).
 */
export async function syncContentToSandbox(
  conversationId: string,
  relativePath: string,
  content: Uint8Array,
): Promise<void> {
  const session = activeSandboxes.get(conversationId);
  if (!session) return;

  try {
    session.lastActivity = Date.now();
    const remotePath = `${WORKSPACE}/${relativePath}`;
    const remoteDir = remotePath.substring(0, remotePath.lastIndexOf("/"));
    await session.sandbox.exec(`mkdir -p ${remoteDir}`);
    await session.sandbox.uploadContent(content, remotePath);
  } catch (err) {
    log.error({ conversationId, relativePath, err }, "Content sync failed");
    throw err;
  }
}

/**
 * Restore a sandbox from storage (R2). Downloads all files for the conversation
 * and uploads them to the sandbox. Use on conversation restore.
 */
export async function restoreSandboxFromStorage(conversationId: string): Promise<void> {
  const session = activeSandboxes.get(conversationId);
  if (!session) return;

  const files = await storage.list(conversationId);
  log.info({ conversationId, fileCount: files.length }, "Restoring files from storage");

  await Promise.all(
    files.map(async (relativePath) => {
      const content = await storage.getBuffer(conversationId, relativePath);
      if (!content) return;
      await syncContentToSandbox(conversationId, relativePath, content);
    }),
  );
}

// ── Idle Cleanup ───────────────────────────────────────────────

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic idle sandbox cleanup (every 60s).
 */
export function startIdleCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    const toDestroy: string[] = [];
    for (const [cid, session] of activeSandboxes) {
      if (now - session.lastActivity > IDLE_TIMEOUT_MS) {
        log.info({ conversationId: cid, idleMinutes: Math.round((now - session.lastActivity) / 60000) }, "Destroying idle sandbox");
        toDestroy.push(cid);
      }
    }
    if (toDestroy.length > 0) {
      Promise.allSettled(toDestroy.map(destroySandbox));
    }
  }, 60_000);
}

/**
 * Stop idle cleanup. Call on API shutdown.
 */
export function stopIdleCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// ── Helpers ──────────────────────────────────────────────────

/** Extensions that are TypeScript compile artifacts — skip when source exists */
const COMPILED_EXTS = [".js", ".js.map", ".d.ts", ".d.ts.map"];

function isCompiledArtifact(entry: string, entries: string[]): boolean {
  for (const ext of COMPILED_EXTS) {
    if (!entry.endsWith(ext)) continue;
    const stem = entry.slice(0, -ext.length);
    // If a .ts or .tsx source file exists alongside, this is a compile artifact
    if (entries.includes(`${stem}.ts`) || entries.includes(`${stem}.tsx`)) return true;
  }
  return false;
}

async function uploadDirectory(
  sandbox: Sandbox,
  localDir: string,
  remoteDir: string,
): Promise<void> {
  const entries = readdirSync(localDir);

  for (const entry of entries) {
    // Skip node_modules, hidden files, and compiled artifacts alongside source
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    if (isCompiledArtifact(entry, entries)) continue;

    const localPath = join(localDir, entry);
    const remotePath = `${remoteDir}/${entry}`;
    const stat = statSync(localPath);

    if (stat.isDirectory()) {
      await sandbox.exec(`mkdir -p ${remotePath}`);
      await uploadDirectory(sandbox, localPath, remotePath);
    } else {
      const content = readFileSync(localPath);
      await sandbox.uploadContent(new Uint8Array(content), remotePath);
    }
  }
}
