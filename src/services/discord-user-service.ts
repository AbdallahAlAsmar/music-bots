import { supabase } from "../db/client.js";
import { env } from "../config/env.js";

type CachedUser = {
  user_id: string;
  username: string;
  global_name: string | null;
  avatar_url: string | null;
  updated_at: string;
};

type DiscordUserApi = {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
};

const STALE_MS = 24 * 60 * 60 * 1000;

export class DiscordUserService {
  private readonly inflight = new Map<string, Promise<CachedUser | null>>();

  async getUser(userId: string): Promise<CachedUser | null> {
    const normalized = userId.trim();
    if (!normalized) {
      return null;
    }

    const existing = this.inflight.get(normalized);
    if (existing) {
      return existing;
    }

    const work = this.resolveUser(normalized).finally(() => {
      this.inflight.delete(normalized);
    });
    this.inflight.set(normalized, work);
    return work;
  }

  async validateUserExists(userId: string): Promise<boolean> {
    return Boolean(await this.getUser(userId));
  }

  private async resolveUser(userId: string): Promise<CachedUser | null> {
    const { data: cached } = await supabase.from("discord_user_cache").select("*").eq("user_id", userId).maybeSingle<CachedUser>();
    if (cached) {
      const stale = Date.now() - new Date(cached.updated_at).getTime() > STALE_MS;
      if (!stale) {
        return cached;
      }
    }

    const remote = await this.fetchDiscordUser(userId);
    if (!remote) {
      return cached ?? null;
    }

    const avatarUrl = remote.avatar ? `https://cdn.discordapp.com/avatars/${remote.id}/${remote.avatar}.png?size=64` : null;
    const upserted: CachedUser = {
      user_id: remote.id,
      username: remote.username,
      global_name: remote.global_name,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString()
    };
    await supabase.from("discord_user_cache").upsert(upserted, { onConflict: "user_id" });
    return upserted;
  }

  private async fetchDiscordUser(userId: string): Promise<DiscordUserApi | null> {
    const response = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: { Authorization: `Bot ${env.controlBotToken}` }
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as DiscordUserApi;
  }
}
