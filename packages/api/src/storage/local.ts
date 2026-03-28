import { join } from "path";
import { homedir } from "os";
import { readFile, writeFile, unlink, readdir, stat, mkdir, rm } from "fs/promises";
import type { FileStorage } from "./types";

const PROJECTS_ROOT = join(homedir(), "avv-projects");

export class LocalStorage implements FileStorage {
  private dir(conversationId: string): string {
    return join(PROJECTS_ROOT, conversationId);
  }

  private path(conversationId: string, relativePath: string): string {
    return join(PROJECTS_ROOT, conversationId, relativePath);
  }

  async put(conversationId: string, relativePath: string, content: string | Uint8Array): Promise<void> {
    const fullPath = this.path(conversationId, relativePath);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, content);
  }

  async get(conversationId: string, relativePath: string): Promise<string | null> {
    try {
      return await readFile(this.path(conversationId, relativePath), "utf-8");
    } catch {
      return null;
    }
  }

  async getBuffer(conversationId: string, relativePath: string): Promise<Uint8Array | null> {
    try {
      const buf = await readFile(this.path(conversationId, relativePath));
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  async list(conversationId: string): Promise<string[]> {
    const root = this.dir(conversationId);
    const paths: string[] = [];

    async function walk(dir: string): Promise<void> {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".")) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else {
          // Convert to relative path
          paths.push(full.slice(root.length + 1));
        }
      }
    }

    await walk(root);
    return paths;
  }

  async delete(conversationId: string, relativePath?: string): Promise<void> {
    if (relativePath) {
      try {
        await unlink(this.path(conversationId, relativePath));
      } catch { /* ignore */ }
      return;
    }

    // Delete entire conversation directory
    try {
      await rm(this.dir(conversationId), { recursive: true, force: true });
    } catch { /* ignore */ }
  }

  async exists(conversationId: string, relativePath: string): Promise<boolean> {
    try {
      await stat(this.path(conversationId, relativePath));
      return true;
    } catch {
      return false;
    }
  }

  /** Get the absolute path for a conversation project directory. */
  getProjectRoot(conversationId: string): string {
    return this.dir(conversationId);
  }
}
