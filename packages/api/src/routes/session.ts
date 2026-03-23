import { Hono } from "hono";
import type { ApiResponse, Session } from "@avv/shared";
import { sessionStore } from "../store";

export const sessionRoute = new Hono();

sessionRoute.get("/sessions", (c) => {
  const sessions = sessionStore.list();
  const response: ApiResponse<Session[]> = { success: true, data: sessions };
  return c.json(response);
});

sessionRoute.get("/sessions/:id", (c) => {
  const session = sessionStore.get(c.req.param("id"));
  if (!session) {
    return c.json({ success: false, error: "Session not found" } satisfies ApiResponse, 404);
  }
  return c.json({ success: true, data: session } satisfies ApiResponse<Session>);
});

sessionRoute.delete("/sessions/:id", (c) => {
  const deleted = sessionStore.delete(c.req.param("id"));
  if (!deleted) {
    return c.json({ success: false, error: "Session not found" } satisfies ApiResponse, 404);
  }
  return c.json({ success: true } satisfies ApiResponse);
});
