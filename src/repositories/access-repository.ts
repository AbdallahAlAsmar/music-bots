import { supabase } from "../db/client.js";
import type { AccessRole, BotAccessEntity } from "../core/types.js";

export class AccessRepository {
  async grant(botId: string, userId: string, role: AccessRole): Promise<void> {
    const { error } = await supabase
      .from("bot_access")
      .upsert({ bot_id: botId, user_id: userId, role }, { onConflict: "bot_id,user_id" });
    if (error) {
      throw new Error(`Failed to grant access: ${error.message}`);
    }
  }

  async revoke(botId: string, userId: string): Promise<void> {
    const { error } = await supabase.from("bot_access").delete().eq("bot_id", botId).eq("user_id", userId);
    if (error) {
      throw new Error(`Failed to revoke access: ${error.message}`);
    }
  }

  async list(botId: string): Promise<BotAccessEntity[]> {
    const { data, error } = await supabase.from("bot_access").select("*").eq("bot_id", botId);
    if (error) {
      throw new Error(`Failed to list access: ${error.message}`);
    }
    return (data ?? []) as BotAccessEntity[];
  }

  async getRole(botId: string, userId: string): Promise<AccessRole | null> {
    const { data, error } = await supabase
      .from("bot_access")
      .select("role")
      .eq("bot_id", botId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to get role: ${error.message}`);
    }
    if (!data) {
      return null;
    }
    return data.role as AccessRole;
  }

  async isOwner(botId: string, userId: string): Promise<boolean> {
    const { data, error } = await supabase.from("bots").select("owner_id").eq("id", botId).maybeSingle();
    if (error) {
      throw new Error(`Failed to check bot owner: ${error.message}`);
    }
    return data?.owner_id === userId;
  }
}
