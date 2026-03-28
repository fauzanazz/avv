import { Sandbox } from "agentbox";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const AGENTBOX_URL = process.env.AGENTBOX_URL ?? "http://178.128.214.76:8080";
const TEMPLATE_DIR = join(import.meta.dir, "../../template");
const WORKSPACE = "/workspace/project";
const VITE_GUEST_PORT = 5173;

interface SandboxSession {
  sandbox: Sandbox;
  hostPort: number;
  conversationId: string;
}

const activeSandboxes = new Map<string, SandboxSession>();

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
 */
export async function createSandboxSession(
  conversationId: string,
): Promise<SandboxSession> {
  // Return existing if already running
  const existing = activeSandboxes.get(conversationId);
  if (existing) return existing;

  // Boot sandbox
  const sandbox = await Sandbox.create({
    url: AGENTBOX_URL,
    memory_mb: 2048,
    vcpus: 2,
    network: true,
    timeout: 3600,
    disk_size_mb: 2048,
  });

  try {
    // Ensure loopback is up (needed for Vite dev server)
    await sandbox.exec("ip link set lo up && ip addr add 127.0.0.1/8 dev lo 2>/dev/null; true");

    // Create project directory
    await sandbox.exec(`mkdir -p ${WORKSPACE}`);

    // Upload template files
    await uploadDirectory(sandbox, TEMPLATE_DIR, WORKSPACE);

    // Install dependencies
    const installResult = await sandbox.exec(
      `cd ${WORKSPACE} && npm install`,
      120, // 2 min timeout for install
    );
    if (installResult.exit_code !== 0) {
      throw new Error(`npm install failed: ${installResult.stderr}`);
    }

    // Start Vite dev server in background
    await sandbox.exec(
      `cd ${WORKSPACE} && npx vite --port ${VITE_GUEST_PORT} --host 0.0.0.0 &`,
      5,
    );

    // Wait a moment for Vite to start
    await new Promise((r) => setTimeout(r, 3000));

    // Set up port forwarding
    const forward = await sandbox.portForward(VITE_GUEST_PORT);

    const session: SandboxSession = {
      sandbox,
      hostPort: forward.host_port,
      conversationId,
    };
    activeSandboxes.set(conversationId, session);

    console.log(
      `[Sandbox] Created for ${conversationId} — preview at http://${forward.local_address}/`,
    );
    return session;
  } catch (err) {
    // Clean up on failure
    await sandbox.destroy().catch(() => {});
    throw err;
  }
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
    const relPath = relative(projectDir, localFilePath);
    const remotePath = `${WORKSPACE}/${relPath}`;

    // Ensure parent directory exists
    const remoteDir = remotePath.substring(0, remotePath.lastIndexOf("/"));
    await session.sandbox.exec(`mkdir -p ${remoteDir}`);

    // Upload file content
    const content = readFileSync(localFilePath);
    await session.sandbox.uploadContent(new Uint8Array(content), remotePath);
  } catch (err) {
    console.error(`[Sandbox] File sync failed for ${localFilePath}:`, err);
  }
}

/**
 * Get the preview URL for a sandbox session.
 */
export function getSandboxPreviewUrl(conversationId: string): string | null {
  const session = activeSandboxes.get(conversationId);
  if (!session) return null;
  return `http://${AGENTBOX_URL.replace(/^https?:\/\//, "").replace(/:\d+$/, "")}:${session.hostPort}/`;
}

/**
 * Destroy a sandbox session.
 */
export async function destroySandbox(conversationId: string): Promise<void> {
  const session = activeSandboxes.get(conversationId);
  if (!session) return;

  try {
    await session.sandbox.destroy();
  } catch (err) {
    console.error(`[Sandbox] Destroy failed for ${conversationId}:`, err);
  }
  activeSandboxes.delete(conversationId);
  console.log(`[Sandbox] Destroyed for ${conversationId}`);
}

/**
 * Destroy all active sandboxes. Call on API shutdown.
 */
export async function destroyAllSandboxes(): Promise<void> {
  const promises = Array.from(activeSandboxes.keys()).map(destroySandbox);
  await Promise.allSettled(promises);
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Recursively upload a local directory to the sandbox.
 */
async function uploadDirectory(
  sandbox: Sandbox,
  localDir: string,
  remoteDir: string,
): Promise<void> {
  const entries = readdirSync(localDir);

  for (const entry of entries) {
    // Skip node_modules and hidden files
    if (entry === "node_modules" || entry.startsWith(".")) continue;

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
