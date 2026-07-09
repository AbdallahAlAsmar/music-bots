import { clearSession, getStoredToken, getStoredUser, storeSession } from "./auth";
import type { AccessDto, AdminBotRow, AuditEntryDto, AuthUser, BotDto, ChannelDto, GuildDto, PlayerStateDto, SubscriptionDto } from "./types";

// Empty string = same-origin. Requests go to /api/* on this site and Next.js
// rewrites proxy them to the bot host (see next.config.ts), avoiding both
// CORS and the HTTPS-page-cannot-call-HTTP-API restriction.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
let refreshPromise: Promise<string | null> | null = null;

async function refreshSessionToken(): Promise<string | null> {
  const token = getStoredToken();
  const user = getStoredUser();
  if (!token || !user) {
    return null;
  }

  const response = await fetch(`${API_URL}/api/auth/refresh`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as { token: string; user: AuthUser };
  if (!payload?.token) {
    return null;
  }
  storeSession(payload.token, payload.user ?? user);
  return payload.token;
}

export async function ensureFreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshSessionToken().finally(() => {
      refreshPromise = null;
    });
  }
  const token = await refreshPromise;
  return Boolean(token);
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers
  });

  if (response.status === 401 && token) {
    const refreshed = await ensureFreshSession();
    if (refreshed) {
      const retryHeaders = new Headers(init.headers);
      retryHeaders.set("Content-Type", "application/json");
      const retryToken = getStoredToken();
      if (retryToken) {
        retryHeaders.set("Authorization", `Bearer ${retryToken}`);
      }
      const retry = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: retryHeaders
      });
      if (retry.ok) {
        return (await retry.json()) as T;
      }
      if (retry.status !== 401) {
        const retryPayload = await retry.json().catch(() => ({}));
        const retryMessage = typeof retryPayload.error === "string" ? retryPayload.error : "Request failed";
        throw new Error(retryMessage);
      }
    }
  }

  if (response.status === 401) {
    clearSession();
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
    throw new Error("Unauthorized");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "Request failed";
    throw new Error(message);
  }

  return payload as T;
}

export async function exchangeDiscordCode(code: string, state: string): Promise<{ token: string; user: AuthUser }> {
  return apiFetch("/api/auth/discord", {
    method: "POST",
    body: JSON.stringify({ code, state })
  });
}

export async function fetchMe(): Promise<{ user: AuthUser }> {
  return apiFetch("/api/auth/me");
}

export async function fetchBots(): Promise<{ bots: BotDto[] }> {
  return apiFetch("/api/bots");
}

export async function fetchBot(id: string): Promise<{
  bot: BotDto;
  subscription: SubscriptionDto | null;
  subscription_end: string | null;
}> {
  return apiFetch(`/api/bots/${id}`);
}

export async function updateBot(
  id: string,
  patch: Partial<
    Pick<
      BotDto,
      | "name"
      | "avatar"
      | "banner"
      | "language"
      | "log_channel_id"
      | "voice_channel_id"
      | "status_text"
      | "status_type"
      | "online_status"
    >
  >
): Promise<{ bot: BotDto }> {
  return apiFetch(`/api/bots/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}

export async function startBot(id: string): Promise<{ bot: BotDto }> {
  return apiFetch(`/api/bots/${id}/start`, { method: "POST" });
}

export async function stopBot(id: string): Promise<{ bot: BotDto }> {
  return apiFetch(`/api/bots/${id}/stop`, { method: "POST" });
}

export async function fetchChannels(id: string): Promise<{ channels: ChannelDto[] }> {
  return apiFetch(`/api/bots/${id}/channels`);
}

export async function fetchGuilds(id: string): Promise<{ guilds: GuildDto[] }> {
  return apiFetch(`/api/bots/${id}/guilds`);
}

export async function updateGuild(id: string, guildId: string): Promise<{ bot: BotDto }> {
  return apiFetch(`/api/bots/${id}/guild`, {
    method: "POST",
    body: JSON.stringify({ guild_id: guildId })
  });
}

export async function fetchInvite(id: string): Promise<{ invite: string }> {
  return apiFetch(`/api/bots/${id}/invite`);
}

export async function fetchAccess(id: string): Promise<{ access: AccessDto[] }> {
  return apiFetch(`/api/bots/${id}/access`);
}

export async function grantAccess(
  id: string,
  userId: string,
  role: "admin" | "viewer"
): Promise<{ access: AccessDto[] }> {
  return apiFetch(`/api/bots/${id}/access`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, role })
  });
}

export async function revokeAccess(id: string, userId: string): Promise<{ access: AccessDto[] }> {
  return apiFetch(`/api/bots/${id}/access/${userId}`, { method: "DELETE" });
}

export async function fetchPlayerState(id: string): Promise<{ player: PlayerStateDto }> {
  return apiFetch(`/api/bots/${id}/player`);
}

export async function playerPause(id: string): Promise<{ player: PlayerStateDto }> {
  return apiFetch(`/api/bots/${id}/player/pause`, { method: "POST" });
}

export async function playerResume(id: string): Promise<{ player: PlayerStateDto }> {
  return apiFetch(`/api/bots/${id}/player/resume`, { method: "POST" });
}

export async function playerSkip(id: string): Promise<{ player: PlayerStateDto }> {
  return apiFetch(`/api/bots/${id}/player/skip`, { method: "POST" });
}

export async function playerStop(id: string): Promise<{ player: PlayerStateDto }> {
  return apiFetch(`/api/bots/${id}/player/stop`, { method: "POST" });
}

export async function playerPlay(id: string, query: string): Promise<{ player: PlayerStateDto }> {
  return apiFetch(`/api/bots/${id}/player/play`, {
    method: "POST",
    body: JSON.stringify({ query })
  });
}

export async function playerSetVolume(id: string, percent: number): Promise<{ player: PlayerStateDto }> {
  return apiFetch(`/api/bots/${id}/player/volume`, {
    method: "PATCH",
    body: JSON.stringify({ percent })
  });
}

export async function uploadBotAsset(botId: string, file: File, kind: "avatar" | "banner"): Promise<{ url: string }> {
  const token = getStoredToken();
  if (!token) {
    throw new Error("Unauthorized");
  }
  const form = new FormData();
  form.append("file", file);
  form.append("bot_id", botId);
  form.append("kind", kind);

  const response = await fetch(`${API_URL}/api/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "Upload failed";
    throw new Error(message);
  }
  return payload as { url: string };
}

export async function fetchAdminHealth(): Promise<{ ok: boolean }> {
  return apiFetch("/api/admin/health");
}

export async function fetchAdminBots(): Promise<{ bots: AdminBotRow[] }> {
  return apiFetch("/api/admin/bots");
}

export async function adminAddBot(input: {
  token: string;
  owner_id: string;
  guild_id: string;
  plan_days: number;
  voice_channel_id?: string | null;
}): Promise<{ bot: BotDto; subscription: SubscriptionDto | null }> {
  return apiFetch("/api/admin/bots", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function adminRemoveBot(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/bots/${id}`, { method: "DELETE" });
}

export async function adminExtendBot(id: string, plan_days: number): Promise<{ subscription: SubscriptionDto }> {
  return apiFetch(`/api/admin/bots/${id}/extend`, {
    method: "POST",
    body: JSON.stringify({ plan_days })
  });
}

export async function fetchAudit(id: string): Promise<{ audit: AuditEntryDto[] }> {
  return apiFetch(`/api/bots/${id}/audit`);
}
