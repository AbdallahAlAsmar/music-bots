import { createMiddleware } from "hono/factory";
import { env } from "../../config/env.js";

export const corsMiddleware = createMiddleware(async (c, next) => {
  const origin = c.req.header("Origin");
  const allowed = env.webOrigin;

  if (origin === allowed) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
    c.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  }

  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }

  await next();
});
