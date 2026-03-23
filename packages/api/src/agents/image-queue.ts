import type { ImageRequest, ImageResult } from "@avv/shared";

type ImageCallback = (result: ImageResult) => void;

/**
 * Simple in-memory queue for image generation requests.
 * Builder agents push requests; the image agent processes them.
 */
class ImageQueue {
<<<<<<< HEAD
  private queue: Array<{ request: ImageRequest; sessionId: string; callback: ImageCallback }> = [];
  private processing = false;
  private listeners = new Map<string, ImageCallback>();
  private pendingBySession = new Map<string, number>();
  private drainCallbacks = new Map<string, Array<() => void>>();

<<<<<<< HEAD
<<<<<<< HEAD
=======
  onResult: ImageCallback | null = null;

>>>>>>> 48465d1 (feat: implement async image generation subagent [FAU-38])
  push(request: ImageRequest, callback: ImageCallback): void {
    this.queue.push({ request, callback });
=======
  addListener(sessionId: string, callback: ImageCallback): void {
    this.listeners.set(sessionId, callback);
  }

  removeListener(sessionId: string): void {
    this.listeners.delete(sessionId);
  }

  push(request: ImageRequest, sessionId: string, callback: ImageCallback): void {
    this.pendingBySession.set(sessionId, (this.pendingBySession.get(sessionId) ?? 0) + 1);
    this.queue.push({ request, sessionId, callback });
>>>>>>> ba6676d (fix: address code review feedback across UltraThink and supporting modules [FAU-41])
=======
  private queue: Array<{ request: ImageRequest; callback: ImageCallback }> = [];
  private processing = false;

  onResult: ImageCallback | null = null;

  push(request: ImageRequest, callback: ImageCallback): void {
    this.queue.push({ request, callback });
>>>>>>> 60d7567 (feat: implement async image generation subagent [FAU-38])
    if (!this.processing) {
      this.processNext();
    }
  }

<<<<<<< HEAD
  /**
   * Returns a promise that resolves when all queued/in-flight items
   * for a session have been processed. Resolves immediately if none pending.
   */
  drain(sessionId: string): Promise<void> {
    if ((this.pendingBySession.get(sessionId) ?? 0) <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const callbacks = this.drainCallbacks.get(sessionId) ?? [];
      callbacks.push(resolve);
      this.drainCallbacks.set(sessionId, callbacks);
    });
  }

  private completePending(sessionId: string): void {
    const count = (this.pendingBySession.get(sessionId) ?? 1) - 1;
    if (count <= 0) {
      this.pendingBySession.delete(sessionId);
      const callbacks = this.drainCallbacks.get(sessionId);
      if (callbacks) {
        for (const cb of callbacks) cb();
        this.drainCallbacks.delete(sessionId);
      }
    } else {
      this.pendingBySession.set(sessionId, count);
    }
  }

=======
>>>>>>> 60d7567 (feat: implement async image generation subagent [FAU-38])
  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const item = this.queue.shift()!;

    try {
      const result = await generateImage(item.request);
      item.callback(result);
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
      this.onResult?.(result);
>>>>>>> 48465d1 (feat: implement async image generation subagent [FAU-38])
=======
      this.listeners.get(item.sessionId)?.(result);
>>>>>>> ba6676d (fix: address code review feedback across UltraThink and supporting modules [FAU-41])
=======
      this.onResult?.(result);
>>>>>>> 60d7567 (feat: implement async image generation subagent [FAU-38])
    } catch (err) {
      console.error(`[ImageQueue] Failed to generate image:`, err);
      const fallback: ImageResult = {
        requestId: item.request.requestId,
        componentId: item.request.componentId,
        dataUri: createPlaceholderSvg(item.request.width, item.request.height, item.request.description),
        width: item.request.width,
        height: item.request.height,
      };
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
      item.callback(fallback);
<<<<<<< HEAD
=======
      this.onResult?.(fallback);
>>>>>>> 48465d1 (feat: implement async image generation subagent [FAU-38])
=======
      try {
        item.callback(fallback);
      } catch (callbackErr) {
        console.error("[ImageQueue] Fallback callback error:", callbackErr);
      }
      this.listeners.get(item.sessionId)?.(fallback);
>>>>>>> ba6676d (fix: address code review feedback across UltraThink and supporting modules [FAU-41])
    }

    this.completePending(item.sessionId);
=======
      item.callback(fallback);
=======
      try {
        item.callback(fallback);
      } catch (cbErr) {
        console.error(`[ImageQueue] Fallback callback threw:`, cbErr);
      }
>>>>>>> c16e46e (fix: address review feedback across PR [FAU-42])
      this.onResult?.(fallback);
    }

>>>>>>> 60d7567 (feat: implement async image generation subagent [FAU-38])
    this.processNext();
  }
}

/**
 * Generate an image using Claude API via the Agent SDK.
 * The agent is instructed to produce an image, which comes back
 * as a base64-encoded content block.
 */
async function generateImage(request: ImageRequest): Promise<ImageResult> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  let imageDataUri = "";

  for await (const message of query({
    prompt: `Generate a ${request.style} image: "${request.description}".
Dimensions: ${request.width}x${request.height}px.
The image should be modern, clean, and suitable for a web UI component.
Respond with ONLY the image — no text explanation.`,
    options: {
      allowedTools: [],
      maxTurns: 1,
    },
  })) {
    const msgAny = message as any;
    if (msgAny.message?.content) {
      for (const block of msgAny.message.content) {
        if (block.type === "image") {
          imageDataUri = `data:${block.media_type};base64,${block.data}`;
        }
      }
    }
  }

  if (!imageDataUri) {
    imageDataUri = createPlaceholderSvg(request.width, request.height, request.description);
  }

  return {
    requestId: request.requestId,
    componentId: request.componentId,
    dataUri: imageDataUri,
    width: request.width,
    height: request.height,
  };
}

/**
 * Creates an SVG placeholder with a gradient and description text.
 * Used as fallback when image generation fails.
 */
<<<<<<< HEAD
<<<<<<< HEAD
function escapeSvgText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toBase64(str: string): string {
  return Buffer.from(str, "utf-8").toString("base64");
}

function createPlaceholderSvg(width: number, height: number, description: string): string {
  const safeDesc = escapeSvgText(description.slice(0, 40));
=======
function createPlaceholderSvg(width: number, height: number, description: string): string {
>>>>>>> 48465d1 (feat: implement async image generation subagent [FAU-38])
=======
function createPlaceholderSvg(width: number, height: number, description: string): string {
>>>>>>> 60d7567 (feat: implement async image generation subagent [FAU-38])
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#e2e8f0"/>
        <stop offset="100%" style="stop-color:#cbd5e1"/>
      </linearGradient>
    </defs>
    <rect fill="url(#g)" width="${width}" height="${height}" rx="8"/>
<<<<<<< HEAD
<<<<<<< HEAD
    <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#64748b" font-family="system-ui" font-size="14">${safeDesc}</text>
  </svg>`;

  return `data:image/svg+xml;base64,${toBase64(svg)}`;
=======
    <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#64748b" font-family="system-ui" font-size="14">${description.slice(0, 40)}</text>
  </svg>`;

<<<<<<< HEAD
  return `data:image/svg+xml;base64,${btoa(svg)}`;
>>>>>>> 48465d1 (feat: implement async image generation subagent [FAU-38])
=======
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
>>>>>>> ba6676d (fix: address code review feedback across UltraThink and supporting modules [FAU-41])
=======
    <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#64748b" font-family="system-ui" font-size="14">${description.slice(0, 40)}</text>
  </svg>`;

<<<<<<< HEAD
  return `data:image/svg+xml;base64,${btoa(svg)}`;
>>>>>>> 60d7567 (feat: implement async image generation subagent [FAU-38])
=======
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
>>>>>>> c16e46e (fix: address review feedback across PR [FAU-42])
}

export const imageQueue = new ImageQueue();
