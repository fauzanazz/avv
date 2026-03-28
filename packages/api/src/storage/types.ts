/**
 * Abstract file storage interface.
 * R2Storage for production, LocalStorage for development.
 */
export interface FileStorage {
  /** Upload a file. */
  put(conversationId: string, relativePath: string, content: string | Uint8Array): Promise<void>;

  /** Download a file as UTF-8 string. Returns null if not found. */
  get(conversationId: string, relativePath: string): Promise<string | null>;

  /** Download a file as raw bytes. Returns null if not found. */
  getBuffer(conversationId: string, relativePath: string): Promise<Uint8Array | null>;

  /** List all relative file paths for a conversation. */
  list(conversationId: string): Promise<string[]>;

  /** Delete a single file, or all files for a conversation if relativePath is omitted. */
  delete(conversationId: string, relativePath?: string): Promise<void>;

  /** Check if a file exists. */
  exists(conversationId: string, relativePath: string): Promise<boolean>;
}
