import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { BotManager } from "../../manager/bot-manager.js";
import type { AccessRepository } from "../../repositories/access-repository.js";
import type { SubscriptionRepository } from "../../repositories/subscription-repository.js";
import type { ActivityKind } from "../../core/types.js";
import type { DiscordUserService } from "../../services/discord-user-service.js";
import { buildBotInviteLink } from "../../utils/discord-invite.js";
import { authMiddleware, type AuthVariables } from "../middleware/auth.js";
import { toBotDto, toPlayerStateDto, toSubscriptionDto } from "../serializers.js";

type BotRouteDeps = {
  manager: BotManager;
  subRepo: SubscriptionRepository;
  accessRepo: AccessRepository;
  discordUserService: DiscordUserService;
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
  const { manager, subRepo, accessRepo, discordUserService } = deps;
  const app = new Hono<{ Variables: AuthVariables }>();

  async function listAccessWithProfiles(botId: string) {
    const rows = await accessRepo.list(botId);
    const users = await Promise.all(rows.map((row) => discordUserService.getUser(row.user_id)));
    return rows.map((row, index) => ({
      user_id: row.user_id,
      role: row.role,
      created_at: row.created_at,
      username: users[index]?.global_name ?? users[index]?.username ?? null,
      avatar_url: users[index]?.avatar_url ?? null
    }));
  }

  app.use("*", authMiddleware);

  app.get("/", async (c) => {
    const user = c.get("user");
    const bots = await manager.getAccessibleBots(user.id);
    return c.json({ bots: bots.map(toBotDto) });
  });

  app.post("/bulk", async (c) => {
    const user = c.get("user");
    const body = await c.req.json<{
      bot_ids?: string[];
      patch?: {
        name?: string | null;
        avatar?: string | null;
        banner?: string | null;
        language?: "ar" | "en";
        log_channel_id?: string | null;
        voice_channel_id?: string | null;
        status_text?: string | null;
        status_type?: ActivityKind | null;
        online_status?: "online" | "idle" | "dnd" | "invisible" | null;
      };
      names?: Record<string, string>;
      grant_access?: { user_id: string; role: "admin" | "viewer" };
      action?: "start" | "stop";
    }>();

    const botIds = body.bot_ids ?? [];
    if (!botIds.length) {
      return c.json({ error: "bot_ids is required" }, 400);
    }

    try {
      const result: {
        updated: ReturnType<typeof toBotDto>[];
        failed: Array<{ bot_id: string; error: string }>;
        granted?: string[];
        grant_failed?: Array<{ bot_id: string; error: string }>;
        controlled?: string[];
        control_failed?: Array<{ bot_id: string; error: string }>;
      } = { updated: [], failed: [] };

      if (body.patch && Object.keys(body.patch).length > 0) {
        const bulk = await manager.bulkUpdateBotsForUser(user.id, botIds, body.patch, body.names);
        result.updated = bulk.updated.map(toBotDto);
        result.failed = bulk.failed;
      } else if (body.names && Object.keys(body.names).length > 0) {
        const bulk = await manager.bulkUpdateBotsForUser(user.id, botIds, {}, body.names);
        result.updated = bulk.updated.map(toBotDto);
        result.failed = bulk.failed;
      }

      if (body.grant_access?.user_id?.trim()) {
        const role = body.grant_access.role;
        if (role !== "admin" && role !== "viewer") {
          return c.json({ error: "grant_access.role must be admin or viewer" }, 400);
        }
        const targetUserId = body.grant_access.user_id.trim();
        const validUser = await discordUserService.validateUserExists(targetUserId);
        if (!validUser) {
          return c.json({ error: "Discord user not found. Please check the ID." }, 400);
        }
        const grant = await manager.bulkGrantAccessForUser(user.id, botIds, targetUserId, role);
        result.granted = grant.granted;
        result.grant_failed = grant.failed;
      }

      if (body.action === "start" || body.action === "stop") {
        const control = await manager.bulkControlBotsForUser(user.id, botIds, body.action);
        result.controlled = control.ok;
        result.control_failed = control.failed;
      }

      if (
        !result.updated.length &&
        !result.granted?.length &&
        !result.controlled?.length &&
        result.failed.length === 0 &&
        !result.grant_failed?.length &&
        !result.control_failed?.length
      ) {
        return c.json({ error: "Nothing to apply — provide patch, names, grant_access, or action" }, 400);
      }

      return c.json(result);
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
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

  app.get("/:id/player", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");
    try {
      const state = await manager.getMusicStateForUser(user.id, botId);
      return c.json({ player: toPlayerStateDto(state) });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.post("/:id/player/pause", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");
    try {
      const state = await manager.controlMusicForUser(user.id, botId, "pause");
      return c.json({ player: toPlayerStateDto(state) });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.post("/:id/player/resume", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");
    try {
      const state = await manager.controlMusicForUser(user.id, botId, "resume");
      return c.json({ player: toPlayerStateDto(state) });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.post("/:id/player/skip", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");
    try {
      const state = await manager.controlMusicForUser(user.id, botId, "skip");
      return c.json({ player: toPlayerStateDto(state) });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.post("/:id/player/play", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");
    const body = await c.req.json<{ query?: string }>();
    if (!body.query?.trim()) {
      return c.json({ error: "query is required" }, 400);
    }
    try {
      const state = await manager.controlMusicForUser(user.id, botId, "play", { query: body.query.trim() });
      return c.json({ player: toPlayerStateDto(state) });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.post("/:id/player/stop", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");
    try {
      const state = await manager.controlMusicForUser(user.id, botId, "stop");
      return c.json({ player: toPlayerStateDto(state) });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.patch("/:id/player/volume", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");
    const body = await c.req.json<{ percent?: number }>();
    if (!Number.isFinite(body.percent)) {
      return c.json({ error: "percent is required" }, 400);
    }
    try {
      const state = await manager.controlMusicForUser(user.id, botId, "volume", { volume: body.percent });
      return c.json({ player: toPlayerStateDto(state) });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.get("/:id/audit", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");
    try {
      const rows = await manager.listAuditForUser(user.id, botId, 50);
      return c.json({ audit: rows });
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

  app.get("/:id/guilds", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");

    try {
      const guilds = await manager.getBotGuilds(botId, user.id);
      return c.json({ guilds });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.post("/:id/guild", async (c) => {
    const user = c.get("user");
    const botId = c.req.param("id");
    const body = await c.req.json<{ guild_id?: string }>();

    if (!body.guild_id?.trim()) {
      return c.json({ error: "guild_id is required" }, 400);
    }

    try {
      await manager.updateBotGuildForUser(user.id, botId, body.guild_id.trim());
      const { bot } = await manager.botInfo(botId);
      return c.json({ bot: toBotDto(bot) });
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
      const access = await listAccessWithProfiles(botId);
      return c.json({ access });
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
    const targetUserId = body.user_id.trim();
    const validUser = await discordUserService.validateUserExists(targetUserId);
    if (!validUser) {
      return c.json({ error: "Discord user not found. Please check the ID." }, 400);
    }

    try {
      await manager.grantAccess(user.id, botId, targetUserId, body.role);
      const access = await listAccessWithProfiles(botId);
      return c.json({ access });
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
      const access = await listAccessWithProfiles(botId);
      return c.json({ access });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  return app;
}
