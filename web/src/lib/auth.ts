import type { AuthUser } from "./types";

const TOKEN_KEY = "bot_control_token";
const USER_KEY = "bot_control_user";
const OAUTH_STATE_KEY = "bot_control_oauth_state";
const STORAGE = () => (typeof window === "undefined" ? null : window.localStorage);

export function getStoredToken(): string | null {
  return STORAGE()?.getItem(TOKEN_KEY) ?? null;
}

export function getStoredUser(): AuthUser | null {
  const raw = STORAGE()?.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: AuthUser): void {
  STORAGE()?.setItem(TOKEN_KEY, token);
  STORAGE()?.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  STORAGE()?.removeItem(TOKEN_KEY);
  STORAGE()?.removeItem(USER_KEY);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join("")
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getTokenExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp !== "number") {
    return null;
  }
  return exp * 1000;
}

export function isTokenExpiringSoon(token: string, withinMs: number): boolean {
  const expiry = getTokenExpiryMs(token);
  if (!expiry) {
    return false;
  }
  return expiry - Date.now() <= withinMs;
}

export function getDiscordAuthUrl(): string {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error("Discord OAuth is not configured");
  }

  const state = crypto.getRandomValues(new Uint32Array(4)).join("-");
  STORAGE()?.setItem(OAUTH_STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "identify",
    state
  });

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

export function validateAndConsumeOAuthState(state: string | null): boolean {
  if (!state) return false;
  const expected = STORAGE()?.getItem(OAUTH_STATE_KEY);
  STORAGE()?.removeItem(OAUTH_STATE_KEY);
  return Boolean(expected && expected === state);
}
