import "./bootstrap-deps.js";
import dns from "node:dns";
import { env } from "./config/env.js";
import { logger } from "./core/logger.js";
import { BotRepository } from "./repositories/bot-repository.js";
import { SubscriptionRepository } from "./repositories/subscription-repository.js";
import { AccessRepository } from "./repositories/access-repository.js";
import { AuditRepository } from "./repositories/audit-repository.js";
import { BotManager } from "./manager/bot-manager.js";
import { ControlBot } from "./control/control-bot.js";
import { SubscriptionWorker } from "./workers/subscription-worker.js";
import { startApiServer } from "./api/server.js";
import { NotificationService } from "./services/notification-service.js";

dns.setDefaultResultOrder("ipv4first");

function isNonFatalTlsCertTimingError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "CERT_NOT_YET_VALID"
  );
}

process.on("unhandledRejection", (reason) => {
  if (isNonFatalTlsCertTimingError(reason)) {
    logger.warn("Ignored transient TLS certificate timing error", {
      code: (reason as { code?: string }).code,
      error: reason instanceof Error ? reason.message : String(reason)
    });
    return;
  }
  logger.error("Unhandled promise rejection", {
    error: reason instanceof Error ? reason.message : String(reason)
  });
});

process.on("uncaughtException", (error) => {
  if (isNonFatalTlsCertTimingError(error)) {
    logger.warn("Ignored transient uncaught TLS certificate timing error", {
      code: (error as { code?: string }).code,
      error: error.message
    });
    return;
  }
  logger.error("Uncaught exception", { error: error.message });
  process.exit(1);
});

async function main(): Promise<void> {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const botRepo = new BotRepository();
      const subRepo = new SubscriptionRepository();
      const accessRepo = new AccessRepository();
      const auditRepo = new AuditRepository();
      const notifications = new NotificationService(botRepo);

      const manager = new BotManager(botRepo, subRepo, accessRepo, notifications, auditRepo);
      await manager.bootstrap();
      logger.info("Manager bootstrap complete", { activeRuntimes: manager.size });

      startApiServer(manager, subRepo, accessRepo);

      const controlBot = new ControlBot(manager, subRepo);
      await controlBot.start();

      const worker = new SubscriptionWorker(manager, botRepo, subRepo, notifications);
      worker.start(env.subscriptionCheckIntervalMs);
      logger.info("Subscription worker started", { intervalMs: env.subscriptionCheckIntervalMs });
      return;
    } catch (error) {
      if (!isNonFatalTlsCertTimingError(error) || attempt === 10) {
        throw error;
      }
      logger.warn("Startup hit TLS certificate timing error, retrying", { attempt });
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

main().catch((error) => {
  logger.error("Fatal startup error", { error: (error as Error).message });
  process.exit(1);
});
