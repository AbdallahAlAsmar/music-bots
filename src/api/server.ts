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
import { createAdminRoutes } from "./routes/admin.js";
import { createLicenseRoutes } from "./routes/licenses.js";
import { createUploadRoutes } from "./routes/upload.js";
import { DiscordUserService } from "../services/discord-user-service.js";

export function createApiApp(
  manager: BotManager,
  subRepo: SubscriptionRepository,
  accessRepo: AccessRepository
): Hono {
  const app = new Hono();
  const discordUserService = new DiscordUserService();

  app.use("*", corsMiddleware);

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      apiEnabled: env.apiEnabled,
      activeRuntimes: manager.size
    })
  );

  app.route("/api/auth", createAuthRoutes());
  app.route("/api/upload", createUploadRoutes());
  app.route("/api/admin", createAdminRoutes({ manager, subRepo }));
  app.route(
    "/api/bots",
    createBotRoutes({ manager, subRepo, accessRepo, discordUserService }).use("*", rateLimitMiddleware(120, 60_000))
  );

  // PX License endpoints (/, /validate, /check, /health) share this port so
  // the standalone PX-Licence Express server no longer needs to bind one.
  app.route("/", createLicenseRoutes());

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
    // Still start the HTTP server: the PX License endpoints live on this
    // port and must stay reachable even when the dashboard API is off.
    logger.info("Web dashboard API disabled (set DISCORD_CLIENT_ID and JWT_SECRET to enable)");
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
