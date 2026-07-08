import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { BotManager } from "../../manager/bot-manager.js";
import type { AccessRepository } from "../../repositories/access-repository.js";
import type { SubscriptionRepository } from "../../repositories/subscription-repository.js";
import type { ActivityKind } from "../../core/types.js";
import { buildBotInviteLink } from "../../utils/discord-invite.js";
import { authMiddleware, type AuthVariables } from "../middleware/auth.js";
import { toBotDto, toSubscriptionDto } from "../serializers.js";

type BotRouteDeps = {
  manager: BotManager;
  subRepo: SubscriptionRepository;
  accessRepo: AccessRepository;
};

function mapError(error: unknown): { status: ContentfulStatusCode; message: string } {
  const message = error instanceof Error ? error.message : "Unknown error";
  if (message === "Bot not found" || message.includes("No bot found")) {
    return { status: 404, message };
  }
  if (message.includes("permission") || message.includes("Permission")) {
    return { status: 403, message };
  }
  if (message.includes("subscription")) {
    return { status: 400, message };
  }
  return { status: 400, message };
}

export function createBotRoutes(deps: BotRouteDeps): Hono<{ Variables: AuthVariables }> {
  const { manager, subRepo, accessRepo } = deps;
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use("*", authMiddleware);

  app.get("/", async (c) => {
    const user = c.get("user");
    const bots = await manager.getAccessibleBots(user.id);
    return c.json({ bots: bots.map(toBotDto) });
  });

  app.get("/:id", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");

    try {
      await manager.assertViewPermission(botId, user.id);
      const { bot, subscriptionEnd } = await manager.botInfo(botId);
      const sub = await subRepo.getActiveByBotId(botId);
      return c.json({
        bot: toBotDto(bot),
        subscription: sub ? toSubscriptionDto(sub) : null,
        subscription_end: subscriptionEnd
      });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.patch("/:id", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");
    const body = await c.req.json<{
      name?: string | null;
      avatar?: string | null;
      banner?: string | null;
      language?: "ar" | "en";
      log_channel_id?: string | null;
      voice_channel_id?: string | null;
      status_text?: string | null;
      status_type?: ActivityKind | null;
      online_status?: "online" | "idle" | "dnd" | "invisible" | null;
    }>();

    try {
      await manager.updateBotProfile(user.id, botId, body);
      const bot = await manager.botInfo(botId);
      return c.json({ bot: toBotDto(bot.bot) });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.post("/:id/start", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");

    try {
      await manager.resumeBotForUser(user.id, botId);
      const { bot } = await manager.botInfo(botId);
      return c.json({ bot: toBotDto(bot) });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.post("/:id/stop", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");

    try {
      await manager.pauseBotForUser(user.id, botId);
      const { bot } = await manager.botInfo(botId);
      return c.json({ bot: toBotDto(bot) });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.get("/:id/channels", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");

    try {
      const channels = await manager.getGuildChannels(botId, user.id);
      return c.json({ channels });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.get("/:id/invite", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");

    try {
      await manager.assertManagePermission(botId, user.id);
      const { bot } = await manager.botInfo(botId);
      const invite = buildBotInviteLink(bot);
      if (!invite) {
        return c.json({ error: "Could not generate invite link" }, 400);
      }
      return c.json({ invite });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.get("/:id/access", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");

    try {
      await manager.assertManagePermission(botId, user.id);
      const rows = await accessRepo.list(botId);
      return c.json({
        access: rows.map((row) => ({
          user_id: row.user_id,
          role: row.role,
          created_at: row.created_at
        }))
      });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.post("/:id/access", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");
    const body = await c.req.json<{ user_id?: string; role?: "admin" | "viewer" }>();

    if (!body.user_id?.trim() || (body.role !== "admin" && body.role !== "viewer")) {
      return c.json({ error: "user_id and role (admin|viewer) are required" }, 400);
    }

    try {
      await manager.grantAccess(user.id, botId, body.user_id.trim(), body.role);
      const rows = await accessRepo.list(botId);
      return c.json({
        access: rows.map((row) => ({
          user_id: row.user_id,
          role: row.role,
          created_at: row.created_at
        }))
      });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.delete("/:id/access/:userId", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");
    const targetUserId = c.req.param("userId");

    try {
      await manager.revokeAccess(user.id, botId, targetUserId);
      const rows = await accessRepo.list(botId);
      return c.json({
        access: rows.map((row) => ({
          user_id: row.user_id,
          role: row.role,
          created_at: row.created_at
        }))
      });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  return app;
}
