# AVV Image Agent — Async Image Generation

## Context

The orchestrator (FAU-36) needs a non-blocking image generation agent. When a builder component needs images (hero backgrounds, product photos, icons), the image agent generates them asynchronously and patches the results into the canvas components without blocking other builders.

## Requirements

- Image generation subagent that runs asynchronously alongside builder agents
- Uses Claude API image generation (via the Agent SDK)
- Results are base64 data URIs patched into component HTML via WebSocket
- Non-blocking: other agents continue while images generate
- Queue-based: builders can request images, image agent processes them

## Implementation

### Image request types

File: `packages/shared/src/types/agent.ts` — append to existing file:

```typescript
/** Image generation request from a builder agent */
export interface ImageRequest {
  requestId: string;
  componentId: string;
  description: string;
  width: number;
  height: number;
  style: "photo" | "illustration" | "icon" | "abstract";
}

/** Image generation result */
export interface ImageResult {
  requestId: string;
  componentId: string;
  dataUri: string;
  width: number;
  height: number;
}
```

### Add image WebSocket message types

File: `packages/shared/src/types/ws.ts` — add to `ServerMessage` union:

```typescript
import type { ImageResult } from "./agent";

// Add to the existing ServerMessage union:
  | { type: "image:ready"; image: ImageResult }
  | { type: "image:generating"; requestId: string; componentId: string }
```

### Image queue

File: `packages/api/src/agents/image-queue.ts`

```typescript
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
      // Return a placeholder on error
      item.callback({
        requestId: item.request.requestId,
        componentId: item.request.componentId,
        dataUri: createPlaceholderSvg(item.request.width, item.request.height, item.request.description),
        width: item.request.width,
        height: item.request.height,
      });
    }

    // Process next in queue
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
    // Extract image content from the message
    const msgAny = message as any;
    if (msgAny.message?.content) {
      for (const block of msgAny.message.content) {
        if (block.type === "image") {
          imageDataUri = `data:${block.media_type};base64,${block.data}`;
        }
      }
    }
  }

  // If no image was generated, return a CSS gradient placeholder
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
function createPlaceholderSvg(width: number, height: number, description: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#e2e8f0"/>
        <stop offset="100%" style="stop-color:#cbd5e1"/>
      </linearGradient>
    </defs>
    <rect fill="url(#g)" width="${width}" height="${height}" rx="8"/>
    <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#64748b" font-family="system-ui" font-size="14">${description.slice(0, 40)}</text>
  </svg>`;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export const imageQueue = new ImageQueue();
```

### Image request MCP tool for builders

File: `packages/api/src/agents/tools/request-image.ts`

```typescript
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/**
 * MCP tool that builder agents call to request an image.
 * The image is generated asynchronously — the builder doesn't wait.
 * Instead, it uses a placeholder and the image is patched in later.
 */
export const requestImageTool = tool(
  "request_image",
  "Request an AI-generated image for this component. Returns immediately with a placeholder URL. The real image will be injected later.",
  {
    description: z.string().describe("Description of the image to generate"),
    width: z.number().default(400).describe("Image width in pixels"),
    height: z.number().default(300).describe("Image height in pixels"),
    style: z.enum(["photo", "illustration", "icon", "abstract"]).default("photo").describe("Image style"),
  },
  async (args) => {
    const requestId = crypto.randomUUID();

    // Return a placeholder immediately — the real image will be patched via WebSocket
    const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${args.width}" height="${args.height}" viewBox="0 0 ${args.width} ${args.height}"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#dbeafe"/><stop offset="100%" style="stop-color:#bfdbfe"/></linearGradient></defs><rect fill="url(#g)" width="${args.width}" height="${args.height}" rx="8"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#3b82f6" font-family="system-ui" font-size="12">Generating image...</text></svg>`;

    const placeholderUri = `data:image/svg+xml;base64,${btoa(placeholderSvg)}`;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            requestId,
            placeholderUrl: placeholderUri,
            description: args.description,
            width: args.width,
            height: args.height,
            style: args.style,
          }),
        },
      ],
    };
  }
);
```

### Wire image queue into orchestrator

File: `packages/api/src/agents/orchestrator.ts` — add after builder subagent dispatch (after Step 3):

```typescript
import { imageQueue } from "./image-queue";
import { requestImageTool } from "./tools/request-image";

// When building agent definitions, add request_image to builder tools:
// tools: ["submit_component", "request_image"],

// After all builders complete, process any pending image requests
// The image queue runs independently and broadcasts results:
imageQueue.onResult = (result) => {
  connectionStore.broadcast(sessionId, {
    type: "image:ready",
    image: result,
  });
};
```

### Update tools barrel export

File: `packages/api/src/agents/tools/index.ts` (replace existing)

```typescript
export { submitComponentTool } from "./submit-component";
export { requestImageTool } from "./request-image";
```

### Frontend: handle image:ready messages

File: `packages/web/src/canvas/hooks/useImagePatching.ts`

```typescript
import { useEffect } from "react";
import type { Editor } from "tldraw";
import type { ImageResult } from "@avv/shared";
import { AVV_COMPONENT_TYPE } from "../shapes";

/**
 * When the server sends an image:ready message, find the component
 * on the canvas and update its HTML to replace the placeholder
 * with the real image data URI.
 */
export function useImagePatching(editor: Editor | null, imageResult: ImageResult | null) {
  useEffect(() => {
    if (!editor || !imageResult) return;

    const shapes = editor.getCurrentPageShapes();
    for (const shape of shapes) {
      if (shape.type !== AVV_COMPONENT_TYPE) continue;

      const props = shape.props as any;
      if (props.agentId && props.html?.includes("Generating image...")) {
        // Replace placeholder SVGs with the real image
        const updatedHtml = props.html.replace(
          /data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+/g,
          imageResult.dataUri
        );

        if (updatedHtml !== props.html) {
          editor.updateShape({
            id: shape.id,
            type: AVV_COMPONENT_TYPE,
            props: { html: updatedHtml },
          });
        }
      }
    }
  }, [editor, imageResult]);
}
```

## Testing Strategy

```bash
# Start API
cd packages/api && bun run dev

# Test image generation in isolation:
# 1. Send a generate request with a prompt that implies images
#    e.g., "Landing page for a photography portfolio"
# 2. Monitor WebSocket for image:generating and image:ready messages
# 3. Verify placeholder SVGs appear first, then get replaced

# Test fallback:
# 1. Disconnect from internet or mock a failure
# 2. Verify SVG gradient placeholders appear instead of errors

# Type check
pnpm type-check
```

## Out of Scope

- Image caching or deduplication
- Image editing or cropping on canvas
- Multiple image providers (DALL-E, Stable Diffusion)
- Image upload from user's device
