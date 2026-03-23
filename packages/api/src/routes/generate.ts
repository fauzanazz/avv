import { Hono } from "hono";
import type { ApiResponse, GenerateRequest, Session } from "@avv/shared";
import { sessionStore } from "../store";

export const generateRoute = new Hono();

generateRoute.post("/generate", async (c) => {
  const body = await c.req.json<GenerateRequest>();

  if (!body.prompt || !body.mode) {
    return c.json(
      { success: false, error: "prompt and mode are required" } satisfies ApiResponse,
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
  const response: ApiResponse<Session> = { success: true, data: session };
  return c.json(response, 201);
});
