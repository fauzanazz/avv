import { dirname } from "path";
import { getSetting, setSetting } from "./chat/settings-manager";

const DB_KEY_PREFIX = "tracked_files:";

/**
 * Tracks project files per conversation. Persisted to SQLite settings table
 * so it survives server restarts.
 */
class PreviewStore {
  private cache = new Map<string, Set<string>>();

  trackFile(conversationId: string, filePath: string): void {
    if (!this.cache.has(conversationId)) {
      // Load from DB on first access
      const saved = getSetting<string[]>(DB_KEY_PREFIX + conversationId);
      this.cache.set(conversationId, new Set(saved ?? []));
    }
    this.cache.get(conversationId)!.add(filePath);

    // Persist to DB
    setSetting(DB_KEY_PREFIX + conversationId, Array.from(this.cache.get(conversationId)!));
  }

  getProjectDir(conversationId: string): string | null {
    const files = this.getTrackedFiles(conversationId);
    return this.findCommonDir(files);
  }

  getTrackedFiles(conversationId: string): string[] {
    if (this.cache.has(conversationId)) {
      return Array.from(this.cache.get(conversationId)!);
    }
    // Load from DB
    const saved = getSetting<string[]>(DB_KEY_PREFIX + conversationId);
    if (saved) {
      this.cache.set(conversationId, new Set(saved));
      return saved;
    }
    return [];
  }

  clear(conversationId: string): void {
    this.cache.delete(conversationId);
    setSetting(DB_KEY_PREFIX + conversationId, []);
  }

  private findCommonDir(paths: string[]): string | null {
    if (paths.length === 0) return null;
    if (paths.length === 1) return dirname(paths[0]);

    const dirs = paths.map((p) => dirname(p).split("/"));
    const common: string[] = [];

    for (let i = 0; i < dirs[0].length; i++) {
      const segment = dirs[0][i];
      if (dirs.every((d) => d[i] === segment)) {
        common.push(segment);
      } else {
        break;
      }
    }

    return common.length > 0 ? common.join("/") : null;
  }
}

export const previewStore = new PreviewStore();
