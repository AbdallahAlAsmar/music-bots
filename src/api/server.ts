import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "../config/env.js";
import { logger } from "../core/logger.js";
import type { BotManager } from "../manager/bot-manager.js";
import type { AccessRepository } from "../repositories/access-repository.js";
import type { SubscriptionRepository } from "../repositories/subscription-repository.js";
import { corsMiddleware } from "./middleware/cors.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createBotRoutes } from "./routes/bots.js";

export function createApiApp(
  manager: BotManager,
  subRepo: SubscriptionRepository,
  accessRepo: AccessRepository
): Hono {
  const app = new Hono();

  app.use("*", corsMiddleware);

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      apiEnabled: env.apiEnabled,
      activeRuntimes: manager.size
    })
  );

  app.route("/api/auth", createAuthRoutes());
  app.route(
    "/api/bots",
    createBotRoutes({ manager, subRepo, accessRepo }).use("*", rateLimitMiddleware(120, 60_000))
  );

  app.onError((error, c) => {
    logger.error("API error", { error: error.message, path: c.req.path });
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}

export function startApiServer(
  manager: BotManager,
  subRepo: SubscriptionRepository,
  accessRepo: AccessRepository
): void {
  if (!env.apiEnabled) {
    logger.info("Web API disabled (set DISCORD_CLIENT_ID and JWT_SECRET to enable)");
    return;
  }

  const app = createApiApp(manager, subRepo, accessRepo);

  serve(
    {
      fetch: app.fetch,
      port: env.apiPort
    },
    (info) => {
      logger.info("Web API listening", {
        port: info.port,
        origin: env.webOrigin,
        publicUrl: env.apiPublicUrl || `http://localhost:${info.port}`
      });
    }
  );
}
