import { Hono } from "hono";
import type { BotManager } from "../../manager/bot-manager.js";
import type { SubscriptionRepository } from "../../repositories/subscription-repository.js";
import { decrypt } from "../../utils/crypto.js";
import { env } from "../../config/env.js";
import { isPlanDays } from "../../utils/subscription-plan.js";
import { authMiddleware, type AuthVariables } from "../middleware/auth.js";
import { adminMiddleware } from "../middleware/admin.js";
import { toBotDto, toSubscriptionDto } from "../serializers.js";
import { DiscordUserService } from "../../services/discord-user-service.js";

type AdminRouteDeps = {
  manager: BotManager;
  subRepo: SubscriptionRepository;
};

export function createAdminRoutes(deps: AdminRouteDeps): Hono<{ Variables: AuthVariables }> {
  const { manager, subRepo } = deps;
  const app = new Hono<{ Variables: AuthVariables }>();
  const discordUsers = new DiscordUserService();
  app.use("*", authMiddleware);
  app.use("*", adminMiddleware);

  app.get("/health", async (c) => {
    const health = await manager.getHealthSnapshot();
    return c.json({ ok: true, health });
  });

  app.get("/bots", async (c) => {
    const rows = await manager.listBotsForAdmin();
    const subscriptions = await Promise.all(rows.map((row) => subRepo.getActiveByBotId(row.bot.id)));
    const ownerProfiles = await Promise.all(rows.map((row) => discordUsers.getUser(row.bot.owner_id)));
    const guildNames = await Promise.all(
      rows.map(async (row) => {
        try {
          const token = decrypt(row.bot.token, env.encryptionKey);
          const response = await fetch(`https://discord.com/api/v10/guilds/${row.bot.guild_id}`, {
            headers: { Authorization: `Bot ${token}` }
          });
          if (!response.ok) {
            return row.bot.guild_id;
          }
          const guild = (await response.json()) as { name?: string };
          return guild.name || row.bot.guild_id;
        } catch {
          return row.bot.guild_id;
        }
      })
    );
    return c.json({
      bots: rows.map((row, index) => ({
        bot: toBotDto(row.bot),
        subscription: subscriptions[index] ? toSubscriptionDto(subscriptions[index]!) : null,
        owner: {
          id: row.bot.owner_id,
          username: ownerProfiles[index]?.global_name ?? ownerProfiles[index]?.username ?? row.bot.owner_id
        },
        guild: {
          id: row.bot.guild_id,
          name: guildNames[index]
        }
      }))
    });
  });

  app.post("/bots", async (c) => {
    const body = await c.req.json<{
      token?: string;
      owner_id?: string;
      guild_id?: string;
      plan_days?: number;
      voice_channel_id?: string | null;
    }>();
    const planDays = Number(body.plan_days);
    if (!body.token?.trim() || !body.owner_id?.trim() || !body.guild_id?.trim() || !isPlanDays(planDays)) {
      return c.json({ error: "token, owner_id, guild_id and valid plan_days are required" }, 400);
    }

    const bot = await manager.addBot({
      token: body.token.trim(),
      ownerId: body.owner_id.trim(),
      guildId: body.guild_id.trim(),
      voiceChannelId: body.voice_channel_id?.trim() || null,
      planDays
    });
    const sub = await subRepo.getActiveByBotId(bot.id);
    return c.json({ bot: toBotDto(bot), subscription: sub ? toSubscriptionDto(sub) : null });
  });

  app.delete("/bots/:id", async (c) => {
    const botId = c.req.param("id");
    await manager.removeBot(botId);
    return c.json({ ok: true });
  });

  app.post("/bots/:id/extend", async (c) => {
    const botId = c.req.param("id");
    const body = await c.req.json<{ plan_days?: number }>();
    const planDays = Number(body.plan_days);
    if (!isPlanDays(planDays)) {
      return c.json({ error: "valid plan_days is required" }, 400);
    }
    const sub = await manager.extendSubscription(botId, planDays);
    return c.json({ subscription: toSubscriptionDto(sub) });
  });

  return app;
}
