import { join } from "path";
import { homedir, tmpdir } from "os";
import { existsSync } from "fs";
import { cp, mkdir, readdir, readFile, rm } from "fs/promises";
import { storage, isProduction } from "../storage";
import { createChildLogger } from "../logger";

const log = createChildLogger("scaffolder");

const LOCAL_PROJECTS_ROOT = join(homedir(), "avv-projects");
const TEMP_PROJECTS_ROOT = join(tmpdir(), "avv");
const TEMPLATE_DIR = join(import.meta.dir, "../../template");

const SKIP = new Set(["node_modules", ".git", "dist", ".cache", ".vite"]);

/**
 * Get the project root directory for a conversation.
 * Production: /tmp/avv/{id}/, Development: ~/avv-projects/{id}/
 */
function getProjectRoot(conversationId: string): string {
  return isProduction
    ? join(TEMP_PROJECTS_ROOT, conversationId)
    : join(LOCAL_PROJECTS_ROOT, conversationId);
}

/**
 * Scaffold a new Vite+React project for a conversation.
 * Copies the template, installs deps, and uploads to storage.
 * Returns the project directory path.
 */
export async function scaffoldProject(conversationId: string): Promise<string> {
  const projectDir = getProjectRoot(conversationId);

  // If already scaffolded locally, return existing
  if (existsSync(join(projectDir, "package.json"))) {
    if (!existsSync(join(projectDir, "node_modules"))) {
      await installDeps(projectDir);
    }
    return projectDir;
  }

  // Create project dir
  await mkdir(projectDir, { recursive: true });

  // Copy template files
  await cp(TEMPLATE_DIR, projectDir, { recursive: true });

  // Install dependencies
  await installDeps(projectDir);

  // Upload all project files to storage
  await uploadProjectToStorage(conversationId, projectDir);

  log.info({ conversationId, projectDir }, "Project created");
  return projectDir;
}

/**
 * Get or create a project directory. In production, downloads from R2 if
 * no local temp dir exists. In dev, returns the local project dir.
 * Returns null if no project exists in storage or locally.
 */
export async function getOrCreateProjectDir(conversationId: string): Promise<string | null> {
  const projectDir = getProjectRoot(conversationId);

  // Already exists locally (dev mode or mid-session in prod)
  if (existsSync(join(projectDir, "package.json"))) {
    if (!existsSync(join(projectDir, "node_modules"))) {
      await installDeps(projectDir);
    }
    return projectDir;
  }

  // Try to restore from storage
  const files = await storage.list(conversationId);
  if (files.length === 0) return null;

  await mkdir(projectDir, { recursive: true });

  // Download all files from storage
  await Promise.all(
    files.map(async (relativePath) => {
      const content = await storage.getBuffer(conversationId, relativePath);
      if (!content) return;
      const fullPath = join(projectDir, relativePath);
      const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
      await mkdir(dir, { recursive: true });
      await Bun.write(fullPath, content);
    }),
  );

  // Install dependencies
  await installDeps(projectDir);

  log.info({ conversationId, projectDir }, "Project restored from storage");
  return projectDir;
}

/**
 * Get the local project directory if it exists, or null.
 */
export function getProjectDir(conversationId: string): string | null {
  const projectDir = getProjectRoot(conversationId);
  return existsSync(join(projectDir, "package.json")) ? projectDir : null;
}

/**
 * Upload all project files (excluding node_modules etc.) to storage.
 */
export async function uploadProjectToStorage(
  conversationId: string,
  projectDir: string,
): Promise<void> {
  const files = await walkDir(projectDir);
  await Promise.all(
    files.map(async (relativePath) => {
      const content = await readFile(join(projectDir, relativePath));
      await storage.put(conversationId, relativePath, new Uint8Array(content));
    }),
  );
  log.info({ conversationId, fileCount: files.length }, "Uploaded files to storage");
}

/**
 * Clean up the ephemeral temp directory for a conversation (production only).
 */
export async function cleanupTempDir(conversationId: string): Promise<void> {
  if (!isProduction) return;
  const projectDir = join(TEMP_PROJECTS_ROOT, conversationId);
  try {
    await rm(projectDir, { recursive: true, force: true });
    log.info({ conversationId }, "Cleaned up temp dir");
  } catch { /* ignore */ }
}

// ── Helpers ──────────────────────────────────────────────────

async function installDeps(projectDir: string): Promise<void> {
  log.info({ projectDir }, "Installing dependencies");

  const proc = Bun.spawn(["pnpm", "install"], {
    cwd: projectDir,
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`pnpm install failed (exit ${exitCode}): ${stderr}`);
  }

  log.info("Dependencies installed");
}

async function walkDir(dir: string, root?: string): Promise<string[]> {
  const base = root ?? dir;
  const paths: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return paths;
  }

  for (const entry of entries) {
    if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await walkDir(full, base)));
    } else {
      paths.push(full.slice(base.length + 1));
    }
  }

  return paths;
}
