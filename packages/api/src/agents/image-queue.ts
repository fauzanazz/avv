import type { ImageRequest, ImageResult } from "@avv/shared";

type ImageCallback = (result: ImageResult) => void;

/**
 * Simple in-memory queue for image generation requests.
 * Builder agents push requests; the image agent processes them.
 */
class ImageQueue {
  private queue: Array<{ request: ImageRequest; callback: ImageCallback }> = [];
  private processing = false;

  push(request: ImageRequest, callback: ImageCallback): void {
    this.queue.push({ request, callback });
    if (!this.processing) {
      this.processNext();
    }
  }

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
    } catch (err) {
      console.error(`[ImageQueue] Failed to generate image:`, err);
      const fallback: ImageResult = {
        requestId: item.request.requestId,
        componentId: item.request.componentId,
        dataUri: createPlaceholderSvg(item.request.width, item.request.height, item.request.description),
        width: item.request.width,
        height: item.request.height,
      };
      try {
        item.callback(fallback);
      } catch (cbErr) {
        console.error(`[ImageQueue] Fallback callback threw:`, cbErr);
      }
    }

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
function escapeSvgText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createPlaceholderSvg(width: number, height: number, description: string): string {
  const safeDesc = escapeSvgText(description.slice(0, 40));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#e2e8f0"/>
        <stop offset="100%" style="stop-color:#cbd5e1"/>
      </linearGradient>
    </defs>
    <rect fill="url(#g)" width="${width}" height="${height}" rx="8"/>
    <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#64748b" font-family="system-ui" font-size="14">${safeDesc}</text>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
}

export const imageQueue = new ImageQueue();
