import { Hono } from "hono";
import { env } from "../../config/env.js";
import { authMiddleware, signAuthToken, verifyAuthToken, type AuthVariables } from "../middleware/auth.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";

export function createAuthRoutes(): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.post("/discord", rateLimitMiddleware(60, 60_000), async (c) => {
    if (!env.apiEnabled) {
      return c.json({ error: "API is not configured" }, 503);
    }

    const body = await c.req.json<{ code?: string }>().catch(() => ({ code: undefined }));
    const code = body.code?.trim();
    if (!code) {
      return c.json({ error: "Missing OAuth code" }, 400);
    }

    const params = new URLSearchParams({
      client_id: env.discordClientId,
      client_secret: env.discordClientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: env.discordRedirectUri
    });

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      return c.json({ error: "Discord token exchange failed", detail: detail.slice(0, 200) }, 401);
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      return c.json({ error: "Discord token exchange failed" }, 401);
    }

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    if (!userRes.ok) {
      return c.json({ error: "Failed to fetch Discord user" }, 401);
    }

    const user = (await userRes.json()) as { id: string; username: string; global_name?: string | null };
    const jwt = await signAuthToken(user.id, user.global_name ?? user.username);

    return c.json({
      token: jwt,
      user: {
        id: user.id,
        username: user.global_name ?? user.username
      }
    });
  });

  app.get("/me", authMiddleware, async (c) => {
    const user = c.get("user");
    return c.json({ user });
  });

  app.post("/refresh", authMiddleware, async (c) => {
    const user = c.get("user");
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      await verifyAuthToken(header.slice("Bearer ".length));
      const token = await signAuthToken(user.id, user.username);
      return c.json({ token, user });
    } catch {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  });

  return app;
}
