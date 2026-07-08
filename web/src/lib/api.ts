import { clearSession, getStoredToken } from "./auth";
import type { AccessDto, AuthUser, BotDto, ChannelDto, SubscriptionDto } from "./types";

// Empty string = same-origin. Requests go to /api/* on this site and Next.js
// rewrites proxy them to the bot host (see next.config.ts), avoiding both
// CORS and the HTTPS-page-cannot-call-HTTP-API restriction.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

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

export async function exchangeDiscordCode(code: string): Promise<{ token: string; user: AuthUser }> {
  return apiFetch("/api/auth/discord", {
    method: "POST",
    body: JSON.stringify({ code })
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
