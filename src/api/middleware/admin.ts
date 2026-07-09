import { createMiddleware } from "hono/factory";
import { env } from "../../config/env.js";
import type { AuthVariables } from "./auth.js";

type CacheEntry = {
  allowed: boolean;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60_000;

export const adminMiddleware = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const user = c.get("user");
  if (!env.adminGuildId || !env.adminRoleId) {
    return c.json({ error: "Admin roles are not configured" }, 503);
  }

  const now = Date.now();
  const cached = cache.get(user.id);
  if (cached && cached.expiresAt > now) {
    if (!cached.allowed) {
      return c.json({ error: "Admin only" }, 403);
    }
    await next();
    return;
  }

  const response = await fetch(`https://discord.com/api/v10/guilds/${env.adminGuildId}/members/${user.id}`, {
    headers: { Authorization: `Bot ${env.controlBotToken}` }
  });
  if (!response.ok) {
    cache.set(user.id, { allowed: false, expiresAt: now + CACHE_TTL_MS });
    return c.json({ error: "Admin only" }, 403);
  }

  const member = (await response.json()) as { roles?: string[] };
  const allowed = Array.isArray(member.roles) && member.roles.includes(env.adminRoleId);
  cache.set(user.id, { allowed, expiresAt: now + CACHE_TTL_MS });
  if (!allowed) {
    return c.json({ error: "Admin only" }, 403);
  }
  await next();
});
