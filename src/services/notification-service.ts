import { decrypt } from "../utils/crypto.js";
import { env } from "../config/env.js";
import { logger } from "../core/logger.js";
import { BotRepository } from "../repositories/bot-repository.js";

export class NotificationService {
  constructor(private readonly botRepo: BotRepository) {}

  async notifyRuntimeError(ownerId: string, botId: string, reason: string): Promise<void> {
    await this.notifyUser(ownerId, {
      content: `Your bot \`${botId}\` hit a runtime error:\n${reason}`
    });
  }

  async notifySubscriptionReminder(ownerId: string, pxId: string, threshold: string, endDate: string): Promise<void> {
    await this.notifyUser(ownerId, {
      content: `Subscription reminder for \`${pxId}\`: ${threshold} remaining.\nEnds at: ${new Date(endDate).toLocaleString()}`
    });
  }

  async notifySubscriptionExpired(ownerId: string, pxId: string): Promise<void> {
    await this.notifyUser(ownerId, {
      content: `Subscription \`${pxId}\` has expired. The bot is now locked until renewed.`
    });
  }

  async notifyUser(userId: string, payload: { content: string }): Promise<void> {
    const viaControlBot = await this.sendWithBotToken(env.controlBotToken, userId, payload.content);
    if (viaControlBot) {
      return;
    }

    const fallbackBot = (await this.botRepo.findOwnedOldestFirst(userId))[0];
    if (!fallbackBot) {
      logger.warn("Notification fallback bot unavailable", { userId });
      return;
    }
    try {
      const token = decrypt(fallbackBot.token, env.encryptionKey);
      const sent = await this.sendWithBotToken(token, userId, payload.content);
      if (!sent) {
        logger.warn("Notification DM failed via fallback bot", { userId, botId: fallbackBot.id });
      }
    } catch (error) {
      logger.warn("Notification fallback failed", { userId, error: (error as Error).message });
    }
  }

  private async sendWithBotToken(token: string, userId: string, content: string): Promise<boolean> {
    try {
      const channelRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ recipient_id: userId })
      });
      if (!channelRes.ok) {
        return false;
      }
      const channel = (await channelRes.json()) as { id?: string };
      if (!channel.id) {
        return false;
      }
      const msgRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ content })
      });
      return msgRes.ok;
    } catch {
      return false;
    }
  }
}
