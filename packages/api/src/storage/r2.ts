import { S3Client } from "bun";
import type { FileStorage } from "./types";

export class R2Storage implements FileStorage {
  private client: S3Client;
  private credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    endpoint: string;
    bucket: string;
  };

  constructor() {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET ?? "avv-projects";

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "R2 storage requires R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY environment variables",
      );
    }

    this.credentials = { accessKeyId, secretAccessKey, endpoint, bucket };

    this.client = new S3Client({
      accessKeyId,
      secretAccessKey,
      endpoint,
      bucket,
    });
  }

  private key(conversationId: string, relativePath: string): string {
    return `${conversationId}/${relativePath}`;
  }

  async put(conversationId: string, relativePath: string, content: string | Uint8Array): Promise<void> {
    const file = this.client.file(this.key(conversationId, relativePath));
    await file.write(content);
  }

  async get(conversationId: string, relativePath: string): Promise<string | null> {
    try {
      const file = this.client.file(this.key(conversationId, relativePath));
      return await file.text();
    } catch {
      return null;
    }
  }

  async getBuffer(conversationId: string, relativePath: string): Promise<Uint8Array | null> {
    try {
      const file = this.client.file(this.key(conversationId, relativePath));
      return new Uint8Array(await file.arrayBuffer());
    } catch {
      return null;
    }
  }

  async list(conversationId: string): Promise<string[]> {
    const prefix = `${conversationId}/`;
    const paths: string[] = [];
    let startAfter: string | undefined;

    // Paginate through all objects with this prefix
    while (true) {
      const result = await S3Client.list(
        {
          prefix,
          maxKeys: 1000,
          ...(startAfter ? { startAfter } : {}),
        },
        this.credentials,
      );

      if (result.contents) {
        for (const obj of result.contents) {
          if (obj.key) {
            paths.push(obj.key.slice(prefix.length));
          }
        }
      }

      if (!result.isTruncated || !result.contents?.length) break;
      startAfter = result.contents.at(-1)?.key;
    }

    return paths;
  }

  async delete(conversationId: string, relativePath?: string): Promise<void> {
    if (relativePath) {
      await this.client.delete(this.key(conversationId, relativePath));
      return;
    }

    // Delete all files for conversation
    const files = await this.list(conversationId);
    await Promise.all(
      files.map((path) => this.client.delete(this.key(conversationId, path))),
    );
  }

  async exists(conversationId: string, relativePath: string): Promise<boolean> {
    try {
      const file = this.client.file(this.key(conversationId, relativePath));
      return await file.exists();
    } catch {
      return false;
    }
  }
}
