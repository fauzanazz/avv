import type { Subprocess } from "bun";
import { createChildLogger } from "../logger";

const log = createChildLogger("dev-server");

interface DevServer {
  process: Subprocess;
  port: number;
  projectDir: string;
}

const activeServers = new Map<string, DevServer>();

/**
 * Start a Vite dev server for a project.
 * Returns the port the server is listening on, or -1 if blocked in production.
 */
export async function startDevServer(
  conversationId: string,
  projectDir: string,
): Promise<number> {
  if (process.env.NODE_ENV === "production") {
    log.warn("Local dev server disabled in production — use sandbox preview");
    return -1;
  }

  // If already running, return existing port
  const existing = activeServers.get(conversationId);
  if (existing) return existing.port;

  const port = await findFreePort();

  const proc = Bun.spawn(
    ["pnpm", "dev", "--port", String(port), "--host", "0.0.0.0", "--strictPort"],
    {
      cwd: projectDir,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, BROWSER: "none" },
    },
  );

  activeServers.set(conversationId, { process: proc, port, projectDir });

  // Wait for dev server to be ready
  await waitForServer(port, 30_000);

  log.info({ conversationId, port }, "Dev server started");
  return port;
}

/**
 * Stop a running dev server.
 */
export function stopDevServer(conversationId: string): void {
  const server = activeServers.get(conversationId);
  if (!server) return;

  server.process.kill();
  activeServers.delete(conversationId);
  log.info({ conversationId }, "Dev server stopped");
}

/**
 * Get the port of a running dev server, or null if not running.
 */
export function getDevServerPort(conversationId: string): number | null {
  return activeServers.get(conversationId)?.port ?? null;
}

/**
 * Get the project directory for a running dev server, or null.
 */
export function getDevServerProjectDir(conversationId: string): string | null {
  return activeServers.get(conversationId)?.projectDir ?? null;
}

/**
 * Stop all running dev servers. Call on API shutdown.
 */
export function stopAllDevServers(): void {
  for (const [cid, server] of activeServers) {
    server.process.kill();
    log.info({ conversationId: cid }, "Dev server stopped");
  }
  activeServers.clear();
}

// ── Helpers ──────────────────────────────────────────────────

async function findFreePort(): Promise<number> {
  // Use Bun's native TCP to find a free port
  // Pick a random port in the 3100-3999 range and verify it's free
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = 3100 + Math.floor(Math.random() * 900);
    try {
      const server = Bun.serve({
        port: candidate,
        fetch() { return new Response(); },
      });
      server.stop(true);
      return candidate;
    } catch {
      // Port in use, try another
    }
  }
  throw new Error("Could not find a free port in range 3100-3999");
}

async function waitForServer(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  const interval = 300;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok || res.status === 404) return; // Vite is up
    } catch {
      // Not ready yet
    }
    await Bun.sleep(interval);
  }

  log.warn({ port, timeoutMs }, "Timeout waiting for dev server");
}
