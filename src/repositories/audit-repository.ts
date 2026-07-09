import { supabase } from "../db/client.js";

export type AuditEntry = {
  id: string;
  bot_id: string;
  actor_id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

export class AuditRepository {
  async create(input: { bot_id: string; actor_id: string; action: string; details?: Record<string, unknown> | null }): Promise<void> {
    const { error } = await supabase.from("audit_log").insert({
      bot_id: input.bot_id,
      actor_id: input.actor_id,
      action: input.action,
      details: input.details ?? null
    });
    if (error) {
      throw new Error(`Failed to create audit entry: ${error.message}`);
    }
  }

  async listByBotId(botId: string, limit = 50): Promise<AuditEntry[]> {
    const { data, error } = await supabase
      .from("audit_log")
      .select("*")
      .eq("bot_id", botId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      throw new Error(`Failed to list audit entries: ${error.message}`);
    }
    return (data ?? []) as AuditEntry[];
  }
}
