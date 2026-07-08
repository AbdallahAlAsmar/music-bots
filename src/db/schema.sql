create extension if not exists "pgcrypto";

create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  owner_id text not null,
  guild_id text not null,
  voice_channel_id text,
  name text,
  avatar text,
  banner text,
  language text not null default 'ar' check (language in ('ar', 'en')),
  log_channel_id text,
  status_text text,
  status_type text check (status_type in ('PLAYING', 'LISTENING', 'WATCHING', 'COMPETING')),
  online_status text check (online_status in ('online', 'idle', 'dnd', 'invisible')),
  status text not null default 'active' check (status in ('active', 'paused', 'expired', 'suspended')),
  runtime_state text,
  last_error text,
  last_ready_at timestamptz,
  last_command_at timestamptz,
  health_updated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.bots add column if not exists banner text;
alter table public.bots add column if not exists language text not null default 'ar';
alter table public.bots add column if not exists log_channel_id text;
alter table public.bots add column if not exists runtime_state text;
alter table public.bots add column if not exists last_error text;
alter table public.bots add column if not exists last_ready_at timestamptz;
alter table public.bots add column if not exists last_command_at timestamptz;
alter table public.bots add column if not exists health_updated_at timestamptz;
alter table public.bots drop constraint if exists bots_status_check;
alter table public.bots add constraint bots_status_check check (status in ('active', 'paused', 'expired', 'suspended'));

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete cascade,
  start_date timestamptz not null default now(),
  end_date timestamptz not null,
  plan_days integer not null default 30,
  active boolean not null default true
);

alter table public.subscriptions add column if not exists plan_days integer not null default 30;

create table if not exists public.bot_access (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete cascade,
  user_id text not null,
  role text not null check (role in ('owner', 'admin', 'viewer')),
  created_at timestamptz not null default now(),
  unique (bot_id, user_id)
);

create index if not exists idx_bots_owner on public.bots(owner_id);
create index if not exists idx_subscriptions_bot on public.subscriptions(bot_id);
create index if not exists idx_subscriptions_active on public.subscriptions(active);
create index if not exists idx_bot_access_lookup on public.bot_access(bot_id, user_id);
