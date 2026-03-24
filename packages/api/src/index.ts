import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { validatePrompts } from "./agents/prompt-loader";
import { healthRoute } from "./routes/health";

// Validate all prompt templates exist before starting
validatePrompts();

const app = new Hono();

app.use("*", cors());
app.use("*", logger());

app.route("/api", healthRoute);

const port = Number(process.env.PORT) || 3001;
console.log(`AVV API running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
