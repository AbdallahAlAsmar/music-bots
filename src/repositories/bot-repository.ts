import { supabase } from "../db/client.js";
import type { BotEntity } from "../core/types.js";

export class BotRepository {
  async create(input: Omit<BotEntity, "id" | "created_at">): Promise<BotEntity> {
    const { data, error } = await supabase.from("bots").insert(input).select("*").single();
    if (error || !data) {
      throw new Error(`Failed to create bot: ${error?.message ?? "unknown"}`);
    }
    return data as BotEntity;
  }

  async findById(id: string): Promise<BotEntity | null> {
    const { data, error } = await supabase.from("bots").select("*").eq("id", id).maybeSingle();
    if (error) {
      throw new Error(`Failed to fetch bot: ${error.message}`);
    }
    return (data as BotEntity | null) ?? null;
  }

  async findAll(): Promise<BotEntity[]> {
    const { data, error } = await supabase.from("bots").select("*").order("created_at", { ascending: true });
    if (error) {
      throw new Error(`Failed to list bots: ${error.message}`);
    }
    return (data ?? []) as BotEntity[];
  }

  async findByOwner(ownerId: string): Promise<BotEntity[]> {
    const { data, error } = await supabase
      .from("bots")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false });
    if (error) {
      throw new Error(`Failed to list owner bots: ${error.message}`);
    }
    return (data ?? []) as BotEntity[];
  }

  async findOwnedOldestFirst(ownerId: string): Promise<BotEntity[]> {
    const { data, error } = await supabase
      .from("bots")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true });
    if (error) {
      throw new Error(`Failed to list owned bots: ${error.message}`);
    }
    return (data ?? []) as BotEntity[];
  }

  async update(id: string, patch: Partial<BotEntity>): Promise<void> {
    const { error } = await supabase.from("bots").update(patch).eq("id", id);
    if (error) {
      throw new Error(`Failed to update bot: ${error.message}`);
    }
  }

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("bots").delete().eq("id", id);
    if (error) {
      throw new Error(`Failed to delete bot: ${error.message}`);
    }
  }
}
