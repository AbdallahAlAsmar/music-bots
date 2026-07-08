export type BotState = "active" | "paused" | "expired" | "suspended";
export type AccessRole = "owner" | "admin" | "viewer";
export type ActivityKind = "PLAYING" | "LISTENING" | "WATCHING" | "COMPETING";
export type RuntimeState = "starting" | "ready" | "active" | "degraded" | "paused" | "stopped" | "suspended" | "error";

export interface BotEntity {
  id: string;
  token: string;
  owner_id: string;
  guild_id: string;
  voice_channel_id: string | null;
  name: string | null;
  avatar: string | null;
  banner: string | null;
  language: "ar" | "en" | null;
  log_channel_id: string | null;
  status_text: string | null;
  status_type: ActivityKind | null;
  online_status: "online" | "idle" | "dnd" | "invisible" | null;
  status: BotState;
  runtime_state: RuntimeState | null;
  last_error: string | null;
  last_ready_at: string | null;
  last_command_at: string | null;
  health_updated_at: string | null;
  created_at: string;
}

export interface SubscriptionEntity {
  id: string;
  bot_id: string;
  start_date: string;
  end_date: string;
  plan_days: number;
  active: boolean;
}

export interface BotAccessEntity {
  id: string;
  bot_id: string;
  user_id: string;
  role: AccessRole;
  created_at: string;
}
