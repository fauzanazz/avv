import { Hono } from "hono";
import type { ApiResponse, GenerateRequest, Session } from "@avv/shared";
import { sessionStore } from "../store";
import { orchestrate } from "../agents/orchestrator";

export const generateRoute = new Hono();

generateRoute.post("/generate", async (c) => {
  const body = await c.req.json<GenerateRequest>();

  if (typeof body.prompt !== "string" || body.prompt.trim() === "") {
    return c.json(
      { success: false, error: "prompt must be a non-empty string" } satisfies ApiResponse,
      400
    );
  }

  if (body.mode !== "simple" && body.mode !== "ultrathink") {
    return c.json(
      { success: false, error: "mode must be 'simple' or 'ultrathink'" } satisfies ApiResponse,
      400
    );
  }

  const session = sessionStore.create(body.prompt, body.mode);

  // Fire and forget — results stream via WebSocket
  orchestrate({
    prompt: body.prompt,
    mode: body.mode,
    sessionId: session.id,
  }).catch((err) => {
    console.error("[Orchestrate] Fatal error:", err);
    sessionStore.update(session.id, { status: "error" });
  });

  const response: ApiResponse<Session> = { success: true, data: session };
  return c.json(response, 201);
});
