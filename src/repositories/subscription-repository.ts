import { supabase } from "../db/client.js";
import type { SubscriptionEntity } from "../core/types.js";

export class SubscriptionRepository {
  async createForPlan(botId: string, days: number): Promise<SubscriptionEntity> {
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
    const { data, error } = await supabase
      .from("subscriptions")
      .insert({
        bot_id: botId,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        plan_days: days,
        active: true
      })
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(`Failed to create subscription: ${error?.message ?? "unknown"}`);
    }
    return data as SubscriptionEntity;
  }

  async getActiveByBotId(botId: string): Promise<SubscriptionEntity | null> {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("bot_id", botId)
      .eq("active", true)
      .order("end_date", { ascending: false })
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to fetch subscription: ${error.message}`);
    }
    return (data as SubscriptionEntity | null) ?? null;
  }

  async getExpiredActive(): Promise<SubscriptionEntity[]> {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("active", true)
      .lt("end_date", now);
    if (error) {
      throw new Error(`Failed to fetch expired subscriptions: ${error.message}`);
    }
    return (data ?? []) as SubscriptionEntity[];
  }

  async listActive(): Promise<SubscriptionEntity[]> {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("active", true)
      .order("end_date", { ascending: false });
    if (error) {
      throw new Error(`Failed to list active subscriptions: ${error.message}`);
    }
    return (data ?? []) as SubscriptionEntity[];
  }

  async deactivate(subscriptionId: string): Promise<void> {
    const { error } = await supabase.from("subscriptions").update({ active: false }).eq("id", subscriptionId);
    if (error) {
      throw new Error(`Failed to deactivate subscription: ${error.message}`);
    }
  }

  async extendActive(botId: string, days: number): Promise<SubscriptionEntity> {
    const active = await this.getActiveByBotId(botId);
    if (!active) {
      return this.createForPlan(botId, days);
    }

    const now = Date.now();
    const currentEnd = new Date(active.end_date).getTime();
    const base = Math.max(now, currentEnd);
    const nextEnd = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("subscriptions")
      .update({ end_date: nextEnd, plan_days: days, active: true })
      .eq("id", active.id)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(`Failed to extend subscription: ${error?.message ?? "unknown"}`);
    }

    return data as SubscriptionEntity;
  }
}
