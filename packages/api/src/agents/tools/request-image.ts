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
