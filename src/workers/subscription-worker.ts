import { BotManager } from "../manager/bot-manager.js";
import { BotRepository } from "../repositories/bot-repository.js";
import { SubscriptionRepository } from "../repositories/subscription-repository.js";
import { logger } from "../core/logger.js";
import { isTransientNetworkError } from "../utils/network-errors.js";

export class SubscriptionWorker {
  private readonly reminderThresholds = [
    { key: "7d", label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
    { key: "1d", label: "1 day", ms: 24 * 60 * 60 * 1000 },
    { key: "6h", label: "6 hours", ms: 6 * 60 * 60 * 1000 }
  ];
  private readonly sentReminderKeys = new Set<string>();
  private consecutiveTransientFailures = 0;
  private retryAfterAt = 0;

  constructor(
    private readonly manager: BotManager,
    private readonly botRepo: BotRepository,
    private readonly subRepo: SubscriptionRepository
  ) {}

  start(intervalMs: number): NodeJS.Timeout {
    return setInterval(async () => {
      const now = Date.now();
      if (now < this.retryAfterAt) {
        return;
      }

      try {
        const expired = await this.subRepo.getExpiredActive();
        for (const sub of expired) {
          await this.subRepo.deactivate(sub.id);
          await this.manager.stop(sub.bot_id);
          await this.botRepo.update(sub.bot_id, { status: "expired" });
          logger.warn("Subscription expired and bot locked", { botId: sub.bot_id, subscriptionId: sub.id });
        }

        const activeSubs = await this.subRepo.listActive();
        const now = Date.now();
        for (const sub of activeSubs) {
          const remainingMs = new Date(sub.end_date).getTime() - now;
          if (remainingMs <= 0) {
            continue;
          }

          const bot = await this.botRepo.findById(sub.bot_id);
          for (const threshold of this.reminderThresholds) {
            const reminderKey = `${sub.id}:${threshold.key}`;
            if (remainingMs > threshold.ms || this.sentReminderKeys.has(reminderKey)) {
              continue;
            }

            this.sentReminderKeys.add(reminderKey);
            logger.warn("Subscription reminder threshold reached", {
              botId: sub.bot_id,
              ownerId: bot?.owner_id ?? null,
              subscriptionId: sub.id,
              planDays: sub.plan_days,
              reminderThreshold: threshold.label,
              endDate: sub.end_date
            });
          }
        }
        this.consecutiveTransientFailures = 0;
        this.retryAfterAt = 0;
      } catch (error) {
        if (isTransientNetworkError(error)) {
          this.consecutiveTransientFailures += 1;
          const backoffMs = Math.min(40_000 * 2 ** (this.consecutiveTransientFailures - 1), 5 * 60 * 1000);
          this.retryAfterAt = Date.now() + backoffMs;
          logger.warn("Subscription worker hit transient network error; backing off", {
            error: (error as Error).message,
            consecutiveTransientFailures: this.consecutiveTransientFailures,
            backoffMs
          });
          return;
        }

        this.consecutiveTransientFailures = 0;
        this.retryAfterAt = 0;
        logger.error("Subscription worker cycle failed", { error: (error as Error).message });
      }
    }, intervalMs);
  }
}
