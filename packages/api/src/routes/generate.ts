import { Hono } from "hono";
import type { ApiResponse, GenerateRequest, Session } from "@avv/shared";
import { sessionStore } from "../store";
import { orchestrate } from "../agents/orchestrator";

export const generateRoute = new Hono();

generateRoute.post("/generate", async (c) => {
<<<<<<< HEAD
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
=======
  const body = await c.req.json<GenerateRequest>();

  if (!body.prompt || typeof body.prompt !== "string" || !body.mode) {
>>>>>>> c16e46e (fix: address review feedback across PR [FAU-42])
    return c.json(
      { success: false, error: "Invalid JSON body" } satisfies ApiResponse,
      400
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).prompt !== "string" ||
    typeof (body as Record<string, unknown>).mode !== "string"
  ) {
    return c.json(
      { success: false, error: "prompt (string) and mode (string) are required" } satisfies ApiResponse,
      400
    );
  }

  const { prompt, mode } = body as GenerateRequest;

  if (mode !== "simple" && mode !== "ultrathink") {
    return c.json(
      { success: false, error: "mode must be 'simple' or 'ultrathink'" } satisfies ApiResponse,
      400
    );
  }

  if (prompt.trim().length === 0) {
    return c.json(
      { success: false, error: "prompt must not be empty" } satisfies ApiResponse,
      400
    );
  }

  const session = sessionStore.create(prompt, mode);

  // Fire and forget — results stream via WebSocket
  orchestrate({
    prompt,
    mode,
    sessionId: session.id,
  }).catch((err) => {
    console.error("[Orchestrate] Fatal error:", err);
    sessionStore.update(session.id, { status: "error" });
  });

  const response: ApiResponse<Session> = { success: true, data: session };
  return c.json(response, 201);
});
