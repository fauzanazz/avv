import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import { cp, mkdir } from "fs/promises";

const PROJECTS_ROOT = join(homedir(), "avv-projects");
const TEMPLATE_DIR = join(import.meta.dir, "../../template");

/**
 * Scaffold a new Vite+React project for a conversation.
 * Copies the template and runs pnpm install.
 * Returns the project directory path.
 */
export async function scaffoldProject(conversationId: string): Promise<string> {
  const projectDir = join(PROJECTS_ROOT, conversationId);

  // If already scaffolded, return existing
  if (existsSync(join(projectDir, "package.json"))) {
    // Ensure deps are installed
    if (!existsSync(join(projectDir, "node_modules"))) {
      await installDeps(projectDir);
    }
    return projectDir;
  }

  // Create projects root if needed
  await mkdir(PROJECTS_ROOT, { recursive: true });

  // Copy template files
  await cp(TEMPLATE_DIR, projectDir, { recursive: true });

  // Install dependencies
  await installDeps(projectDir);

  console.log(`[Scaffolder] Project created at ${projectDir}`);
  return projectDir;
}

/**
 * Get the project directory for a conversation, or null if not scaffolded.
 */
export function getProjectDir(conversationId: string): string | null {
  const projectDir = join(PROJECTS_ROOT, conversationId);
  return existsSync(join(projectDir, "package.json")) ? projectDir : null;
}

async function installDeps(projectDir: string): Promise<void> {
  console.log(`[Scaffolder] Installing dependencies in ${projectDir}...`);

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

  console.log(`[Scaffolder] Dependencies installed`);
}
