import { Hono } from "hono";
import type { ApiResponse } from "@avv/shared";

export const healthRoute = new Hono();

healthRoute.get("/health", (c) => {
  const response: ApiResponse<{ status: string }> = {
    ok: true,
    data: { status: "ok" },
  };
  return c.json(response);
});
