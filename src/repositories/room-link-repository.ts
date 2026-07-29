import { randomBytes } from "node:crypto";
import { supabase } from "../db/client.js";

export type RoomLinkEntity = {
  id: string;
  bot_id: string;
  token: string;
  enabled: boolean;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
};

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export class RoomLinkRepository {
  async findActiveByBotId(botId: string): Promise<RoomLinkEntity | null> {
    const { data, error } = await supabase
      .from("bot_room_links")
      .select("*")
      .eq("bot_id", botId)
      .eq("enabled", true)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to find room link: ${error.message}`);
    }
    return (data as RoomLinkEntity | null) ?? null;
  }

  async findActiveByToken(token: string): Promise<RoomLinkEntity | null> {
    const normalized = token.trim();
    if (!normalized) {
      return null;
    }
    const { data, error } = await supabase
      .from("bot_room_links")
      .select("*")
      .eq("token", normalized)
      .eq("enabled", true)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to find room link by token: ${error.message}`);
    }
    return (data as RoomLinkEntity | null) ?? null;
  }

  async create(botId: string, createdBy: string): Promise<RoomLinkEntity> {
    await this.revokeActive(botId);
    const row = {
      bot_id: botId,
      token: generateToken(),
      enabled: true,
      created_by: createdBy,
      revoked_at: null
    };
    const { data, error } = await supabase.from("bot_room_links").insert(row).select("*").single();
    if (error) {
      throw new Error(`Failed to create room link: ${error.message}`);
    }
    return data as RoomLinkEntity;
  }

  async rotate(botId: string, createdBy: string): Promise<RoomLinkEntity> {
    return this.create(botId, createdBy);
  }

  async disable(botId: string): Promise<void> {
    await this.revokeActive(botId);
  }

  private async revokeActive(botId: string): Promise<void> {
    const { error } = await supabase
      .from("bot_room_links")
      .update({ enabled: false, revoked_at: new Date().toISOString() })
      .eq("bot_id", botId)
      .eq("enabled", true)
      .is("revoked_at", null);
    if (error) {
      throw new Error(`Failed to revoke room link: ${error.message}`);
    }
  }
}
