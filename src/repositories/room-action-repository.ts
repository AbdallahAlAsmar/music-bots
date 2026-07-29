import { supabase } from "../db/client.js";

export type RoomActionSource = "discord" | "dashboard" | "room";

export type RoomActionEntity = {
  id: string;
  bot_id: string;
  actor_id: string;
  actor_tag: string;
  action: string;
  details: Record<string, unknown> | null;
  source: RoomActionSource;
  created_at: string;
};

export class RoomActionRepository {
  async create(input: {
    bot_id: string;
    actor_id: string;
    actor_tag: string;
    action: string;
    details?: Record<string, unknown> | null;
    source: RoomActionSource;
  }): Promise<void> {
    const { error } = await supabase.from("bot_room_actions").insert({
      bot_id: input.bot_id,
      actor_id: input.actor_id,
      actor_tag: input.actor_tag,
      action: input.action,
      details: input.details ?? null,
      source: input.source
    });
    if (error) {
      throw new Error(`Failed to create room action: ${error.message}`);
    }
  }

  async listByBotId(botId: string, limit = 30): Promise<RoomActionEntity[]> {
    const { data, error } = await supabase
      .from("bot_room_actions")
      .select("*")
      .eq("bot_id", botId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      throw new Error(`Failed to list room actions: ${error.message}`);
    }
    return (data ?? []) as RoomActionEntity[];
  }
}
