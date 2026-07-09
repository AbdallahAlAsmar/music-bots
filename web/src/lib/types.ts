export type BotDto = {
  id: string;
  owner_id: string;
  guild_id: string;
  voice_channel_id: string | null;
  name: string | null;
  avatar: string | null;
  banner: string | null;
  language: "ar" | "en" | null;
  log_channel_id: string | null;
  status_text: string | null;
  status_type: "PLAYING" | "LISTENING" | "WATCHING" | "COMPETING" | null;
  online_status: "online" | "idle" | "dnd" | "invisible" | null;
  status: "active" | "paused" | "expired" | "suspended";
  runtime_state: string | null;
  last_error: string | null;
  last_ready_at: string | null;
  last_command_at: string | null;
  health_updated_at: string | null;
  created_at: string;
  display_name: string;
  discord_user_id: string | null;
};

export type SubscriptionDto = {
  px_id: string;
  plan_days: number;
  plan_label: string;
  start_date: string;
  end_date: string;
  active: boolean;
};

export type ChannelDto = {
  id: string;
  name: string;
  type: "voice" | "text";
};

export type GuildDto = {
  id: string;
  name: string;
  icon: string | null;
};

export type AccessDto = {
  user_id: string;
  role: "owner" | "admin" | "viewer";
  created_at: string;
  username?: string | null;
  avatar_url?: string | null;
};

export type AuthUser = {
  id: string;
  username: string;
};

export type PlayerTrack = {
  title: string;
  url: string;
  duration: string;
  thumbnail: string | null;
  requestedBy: string;
  sourceQuery?: string;
  artistName?: string;
  albumName?: string;
  durationSeconds?: number;
};

export type PlayerStateDto = {
  nowPlaying: PlayerTrack | null;
  queue: PlayerTrack[];
  volume: number;
  loop: "off" | "track" | "queue";
  isPaused: boolean;
  isConnected: boolean;
};

export type AdminBotRow = {
  bot: BotDto;
  subscription: SubscriptionDto | null;
};

export type AuditEntryDto = {
  id: string;
  bot_id: string;
  actor_id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};
