import { getSetting, setSetting } from "./chat/settings-manager";
import { dirname } from "path";

const DB_KEY_PREFIX = "tracked_files:";

/**
 * Tracks project files per conversation using relative paths.
 * Persisted to SQLite settings table so it survives server restarts.
 */
class PreviewStore {
  private cache = new Map<string, Set<string>>();

  /** Track a file by its relative path (e.g., "src/App.tsx"). */
  trackFile(conversationId: string, relativePath: string): void {
    if (!this.cache.has(conversationId)) {
      const saved = getSetting<string[]>(DB_KEY_PREFIX + conversationId);
      this.cache.set(conversationId, new Set(saved ?? []));
    }
    this.cache.get(conversationId)!.add(relativePath);

    setSetting(DB_KEY_PREFIX + conversationId, Array.from(this.cache.get(conversationId)!));
  }

  /** Get all tracked relative file paths for a conversation. */
  getTrackedFiles(conversationId: string): string[] {
    if (this.cache.has(conversationId)) {
      return Array.from(this.cache.get(conversationId)!);
    }
    const saved = getSetting<string[]>(DB_KEY_PREFIX + conversationId);
    if (saved) {
      this.cache.set(conversationId, new Set(saved));
      return saved;
    }
    return [];
  }

  /** Get the common project directory from tracked file paths. */
  getProjectDir(conversationId: string): string | null {
    const files = this.getTrackedFiles(conversationId);
    if (files.length === 0) return null;
    // Find common directory prefix
    const dirs = files.map((f) => dirname(f));
    let prefix = dirs[0];
    for (const d of dirs) {
      while (!d.startsWith(prefix)) {
        prefix = dirname(prefix);
      }
    }
    return prefix;
  }

  clear(conversationId: string): void {
    this.cache.delete(conversationId);
    setSetting(DB_KEY_PREFIX + conversationId, []);
  }
}

export const previewStore = new PreviewStore();
