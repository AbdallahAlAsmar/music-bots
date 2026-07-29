import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Context } from "hono";
import type { BotManager } from "../../manager/bot-manager.js";
import type { DiscordUserService } from "../../services/discord-user-service.js";
import { authMiddleware, verifyAuthToken, type AuthVariables } from "../middleware/auth.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";
import { toPlayerStateDto } from "../serializers.js";

type RoomRouteDeps = {
  manager: BotManager;
  discordUserService: DiscordUserService;
};

function mapError(error: unknown): { status: ContentfulStatusCode; message: string } {
  const message = error instanceof Error ? error.message : "Unknown error";
  if (message === "Room link not found" || message === "Bot not found") {
    return { status: 404, message };
  }
  if (message.includes("voice channel") || message.includes("permission") || message.includes("Permission")) {
    return { status: 403, message };
  }
  if (message.includes("runtime is not running")) {
    return { status: 409, message };
  }
  return { status: 400, message };
}

async function enrichActions(
  actions: Array<{
    id: string;
    bot_id: string;
    actor_id: string;
    actor_tag: string;
    action: string;
    details: Record<string, unknown> | null;
    source: string;
    created_at: string;
  }>,
  discordUserService: DiscordUserService
) {
  const users = await Promise.all(actions.map((row) => discordUserService.getUser(row.actor_id)));
  return actions.map((row, index) => ({
    id: row.id,
    bot_id: row.bot_id,
    actor_id: row.actor_id,
    actor_tag: row.actor_tag,
    action: row.action,
    details: row.details,
    source: row.source,
    created_at: row.created_at,
    username: users[index]?.global_name ?? users[index]?.username ?? row.actor_tag,
    avatar_url: users[index]?.avatar_url ?? null
  }));
}

export function createRoomRoutes(deps: RoomRouteDeps): Hono<{ Variables: AuthVariables }> {
  const { manager, discordUserService } = deps;
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use("*", rateLimitMiddleware(90, 60_000));

  app.get("/:token", async (c) => {
    const token = c.req.param("token");
    try {
      const header = c.req.header("Authorization");
      if (!header?.startsWith("Bearer ")) {
        const { summary } = await manager.resolveRoomByToken(token);
        return c.json({
          room: summary,
          authenticated: false,
          inVoice: false,
          canControl: false,
          player: null,
          actions: []
        });
      }

      try {
        const user = await verifyAuthToken(header.slice("Bearer ".length));
        const state = await manager.getRoomStateForUser(token, user.id);
        return c.json({
          room: state.summary,
          authenticated: true,
          inVoice: state.inVoice,
          canControl: state.canControl,
          player: state.player ? toPlayerStateDto(state.player) : null,
          actions: await enrichActions(state.actions, discordUserService),
          user: { id: user.id, username: user.username }
        });
      } catch {
        const { summary } = await manager.resolveRoomByToken(token);
        return c.json({
          room: summary,
          authenticated: false,
          inVoice: false,
          canControl: false,
          player: null,
          actions: []
        });
      }
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  app.get("/:token/actions", authMiddleware, async (c) => {
    const token = c.req.param("token");
    try {
      const actions = await manager.listRoomActionsByToken(token, 30);
      return c.json({ actions: await enrichActions(actions, discordUserService) });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  });

  async function controlMusic(
    c: Context<{ Variables: AuthVariables }>,
    action: "pause" | "resume" | "skip" | "stop" | "play" | "volume" | "clear" | "seek" | "remove" | "reorder",
    payload?: { query?: string; volume?: number; positionMs?: number; index?: number; fromIndex?: number; toIndex?: number }
  ) {
    const user = c.get("user");
    const token = c.req.param("token");
    if (!token) {
      return c.json({ error: "token is required" }, 400);
    }
    try {
      const player = await manager.controlMusicForRoom(token, user.id, user.username, action, payload);
      return c.json({ player: toPlayerStateDto(player) });
    } catch (error) {
      const mapped = mapError(error);
      return c.json({ error: mapped.message }, mapped.status);
    }
  }

  app.post("/:token/player/pause", authMiddleware, rateLimitMiddleware(30, 60_000), (c) => controlMusic(c, "pause"));
  app.post("/:token/player/resume", authMiddleware, rateLimitMiddleware(30, 60_000), (c) => controlMusic(c, "resume"));
  app.post("/:token/player/skip", authMiddleware, rateLimitMiddleware(30, 60_000), (c) => controlMusic(c, "skip"));
  app.post("/:token/player/stop", authMiddleware, rateLimitMiddleware(20, 60_000), (c) => controlMusic(c, "stop"));
  app.post("/:token/player/clear", authMiddleware, rateLimitMiddleware(20, 60_000), (c) => controlMusic(c, "clear"));
  app.post("/:token/player/play", authMiddleware, rateLimitMiddleware(40, 60_000), async (c) => {
    const body = await c.req.json<{ query?: string }>();
    if (!body.query?.trim()) {
      return c.json({ error: "query is required" }, 400);
    }
    return controlMusic(c, "play", { query: body.query.trim() });
  });
  app.patch("/:token/player/volume", authMiddleware, rateLimitMiddleware(40, 60_000), async (c) => {
    const body = await c.req.json<{ percent?: number }>();
    if (!Number.isFinite(body.percent)) {
      return c.json({ error: "percent is required" }, 400);
    }
    return controlMusic(c, "volume", { volume: body.percent });
  });
  app.patch("/:token/player/seek", authMiddleware, rateLimitMiddleware(40, 60_000), async (c) => {
    const body = await c.req.json<{ position_ms?: number }>();
    if (!Number.isFinite(body.position_ms)) {
      return c.json({ error: "position_ms is required" }, 400);
    }
    return controlMusic(c, "seek", { positionMs: body.position_ms });
  });
  app.post("/:token/player/queue/remove", authMiddleware, rateLimitMiddleware(40, 60_000), async (c) => {
    const body = await c.req.json<{ index?: number }>();
    if (!Number.isFinite(body.index)) {
      return c.json({ error: "index is required" }, 400);
    }
    return controlMusic(c, "remove", { index: body.index });
  });
  app.post("/:token/player/queue/reorder", authMiddleware, rateLimitMiddleware(40, 60_000), async (c) => {
    const body = await c.req.json<{ from_index?: number; to_index?: number }>();
    if (!Number.isFinite(body.from_index) || !Number.isFinite(body.to_index)) {
      return c.json({ error: "from_index and to_index are required" }, 400);
    }
    return controlMusic(c, "reorder", { fromIndex: body.from_index, toIndex: body.to_index });
  });

  return app;
}
