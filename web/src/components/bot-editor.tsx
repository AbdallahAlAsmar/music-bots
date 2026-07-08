"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  fetchAccess,
  fetchChannels,
  fetchGuilds,
  fetchInvite,
  grantAccess,
  revokeAccess,
  startBot,
  stopBot,
  updateBot,
  updateGuild
} from "@/lib/api";
import type { AccessDto, BotDto, ChannelDto, GuildDto, SubscriptionDto } from "@/lib/types";
import { effectiveBotStatus, runtimeTone, StatusBadge } from "@/components/status-badge";
import { Select } from "@/components/select";
import {
  AlertIcon,
  BotIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleIcon,
  ClockIcon,
  CopyIcon,
  CreditCardIcon,
  ImageIcon,
  LinkIcon,
  MicIcon,
  PlayIcon,
  SettingsIcon,
  ShieldIcon,
  SparklesIcon,
  StopIcon,
  UsersIcon
} from "@/components/icons";

type BotEditorProps = {
  initialBot: BotDto;
  initialSubscription: SubscriptionDto | null;
};

type Tab = "setup" | "profile" | "presence" | "access" | "billing";

const tabs: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "setup", label: "Setup", icon: SettingsIcon },
  { id: "profile", label: "Profile", icon: ImageIcon },
  { id: "presence", label: "Presence", icon: SparklesIcon },
  { id: "access", label: "Access", icon: UsersIcon },
  { id: "billing", label: "Subscription", icon: CreditCardIcon }
];

export function BotEditor({ initialBot, initialSubscription }: BotEditorProps) {
  const [bot, setBot] = useState(initialBot);
  const [subscription] = useState(initialSubscription);
  const [channels, setChannels] = useState<ChannelDto[]>([]);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [guilds, setGuilds] = useState<GuildDto[]>([]);
  const [pendingGuildId, setPendingGuildId] = useState<string | null>(null);
  const [movingGuild, setMovingGuild] = useState(false);
  const [access, setAccess] = useState<AccessDto[]>([]);
  const [invite, setInvite] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<"start" | "stop" | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<Tab>("setup");
  const [accessUserId, setAccessUserId] = useState("");
  const [accessRole, setAccessRole] = useState<"admin" | "viewer">("admin");

  const initialForm = useMemo(
    () => ({
      name: bot.name ?? "",
      avatar: bot.avatar ?? "",
      banner: bot.banner ?? "",
      language: bot.language ?? "ar",
      voice_channel_id: bot.voice_channel_id ?? "",
      log_channel_id: bot.log_channel_id ?? "",
      status_type: bot.status_type ?? "PLAYING",
      status_text: bot.status_text ?? "",
      online_status: bot.online_status ?? "online"
    }),
    [bot]
  );

  const [form, setForm] = useState(initialForm);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);

  useEffect(() => {
    void fetchChannels(bot.id)
      .then((res) => {
        setChannels(res.channels);
        setChannelsError(null);
      })
      .catch((err: Error) => setChannelsError(err.message));
  }, [bot.id, bot.guild_id]);

  useEffect(() => {
    void fetchAccess(bot.id)
      .then((res) => setAccess(res.access))
      .catch(() => undefined);
    void fetchInvite(bot.id)
      .then((res) => setInvite(res.invite))
      .catch(() => setInvite(null));
    void fetchGuilds(bot.id)
      .then((res) => setGuilds(res.guilds))
      .catch(() => setGuilds([]));
  }, [bot.id]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await updateBot(bot.id, {
        name: form.name.trim() || null,
        avatar: form.avatar.trim() || null,
        banner: form.banner.trim() || null,
        language: form.language as "ar" | "en",
        voice_channel_id: form.voice_channel_id || null,
        log_channel_id: form.log_channel_id || null,
        status_type: form.status_type as NonNullable<BotDto["status_type"]>,
        status_text: form.status_text.trim() || null,
        online_status: form.online_status as NonNullable<BotDto["online_status"]>
      });
      setBot(result.bot);
      setMessage("Changes saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setForm(initialForm);
  }

  async function handleStartStop(action: "start" | "stop") {
    setBusyAction(action);
    setError(null);
    setMessage(null);
    try {
      const result = action === "start" ? await startBot(bot.id) : await stopBot(bot.id);
      setBot(result.bot);
      setMessage(action === "start" ? "Bot started." : "Bot stopped.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleGrantAccess() {
    if (!accessUserId.trim()) return;
    setError(null);
    try {
      const result = await grantAccess(bot.id, accessUserId.trim(), accessRole);
      setAccess(result.access);
      setAccessUserId("");
      setMessage("Access granted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grant access");
    }
  }

  async function handleRevokeAccess(userId: string) {
    setError(null);
    try {
      const result = await revokeAccess(bot.id, userId);
      setAccess(result.access);
      setMessage("Access revoked.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke access");
    }
  }

  async function handleCopyInvite() {
    if (!invite) return;
    await navigator.clipboard.writeText(invite);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleMoveGuild() {
    if (!pendingGuildId || pendingGuildId === bot.guild_id) return;
    setMovingGuild(true);
    setError(null);
    setMessage(null);
    try {
      const result = await updateGuild(bot.id, pendingGuildId);
      setBot(result.bot);
      // Channels from the old server no longer apply
      setChannels([]);
      setForm((prev) => ({ ...prev, voice_channel_id: "", log_channel_id: "" }));
      setPendingGuildId(null);
      const guildName = guilds.find((guild) => guild.id === result.bot.guild_id)?.name;
      setMessage(guildName ? `Bot moved to ${guildName}. Pick a new voice channel.` : "Server changed. Pick a new voice channel.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change server");
    } finally {
      setMovingGuild(false);
    }
  }

  const voiceChannels = channels.filter((channel) => channel.type === "voice");
  const textChannels = channels.filter((channel) => channel.type === "text");

  const setupSteps = [
    { done: Boolean(bot.name?.trim()), label: "Give your bot a name", goto: "profile" as Tab },
    { done: Boolean(bot.voice_channel_id), label: "Assign a voice channel", goto: "setup" as Tab },
    { done: bot.status === "active", label: "Start the bot", goto: "setup" as Tab }
  ];
  const setupDone = setupSteps.filter((s) => s.done).length;
  const setupComplete = setupDone === setupSteps.length;

  const isRunning = bot.status === "active";
  const status = effectiveBotStatus(bot);

  const currentGuild = guilds.find((guild) => guild.id === bot.guild_id);
  const selectedGuildId = pendingGuildId ?? bot.guild_id;
  const guildChanged = selectedGuildId !== bot.guild_id;

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="card overflow-hidden">
        {bot.banner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bot.banner} alt="" className="h-28 w-full object-cover" />
        ) : (
          <div className="h-20 bg-gradient-to-r from-emerald-500/15 via-slate-900 to-slate-900" />
        )}
        <div className="flex flex-wrap items-end justify-between gap-4 px-6 pb-5">
          <div className="flex items-end gap-4">
            <div className="-mt-8 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-slate-900 bg-slate-800">
              {bot.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bot.avatar} alt={`${bot.display_name} avatar`} className="h-full w-full object-cover" />
              ) : (
                <BotIcon className="h-8 w-8 text-emerald-400" />
              )}
            </div>
            <div className="pb-1">
              <h2 className="text-2xl font-bold tracking-tight text-white">{bot.display_name}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusBadge label={status.label} tone={status.tone} pulse={status.pulse} />
                {bot.runtime_state ? (
                  <StatusBadge label={`runtime: ${bot.runtime_state}`} tone={runtimeTone(bot.runtime_state)} />
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex gap-2 pb-1">
            {isRunning ? (
              <button
                type="button"
                className="btn-danger"
                disabled={busyAction !== null}
                onClick={() => void handleStartStop("stop")}
              >
                <StopIcon className="h-4 w-4" />
                {busyAction === "stop" ? "Stopping..." : "Stop bot"}
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary"
                disabled={busyAction !== null}
                onClick={() => void handleStartStop("start")}
              >
                <PlayIcon className="h-4 w-4" />
                {busyAction === "start" ? "Starting..." : "Start bot"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Alerts */}
      <div aria-live="polite">
        <AnimatePresence>
          {message ? (
            <motion.div
              key="message"
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.25 }}
            >
              <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                <CheckCircleIcon className="h-4 w-4 shrink-0" />
                {message}
              </div>
            </motion.div>
          ) : null}
          {error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.25 }}
            >
              <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                <AlertIcon className="h-4 w-4 shrink-0" />
                {error}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {bot.last_error ? (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <AlertIcon className="h-4 w-4 shrink-0" />
            Last runtime error: {bot.last_error}
          </div>
        ) : null}
      </div>

      {/* Setup progress */}
      {!setupComplete ? (
        <div className="card mt-4 border-emerald-500/20 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-white">Finish setting up</h3>
              <p className="mt-0.5 text-sm text-slate-400">
                {setupDone} of {setupSteps.length} steps complete
              </p>
            </div>
            <div className="h-2 w-40 overflow-hidden rounded-full bg-white/5">
              <motion.div
                className="h-full rounded-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: `${(setupDone / setupSteps.length) * 100}%` }}
                transition={{ duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] }}
              />
            </div>
          </div>
          <ul className="mt-4 space-y-2.5">
            {setupSteps.map((step) => (
              <li key={step.label}>
                <button
                  type="button"
                  onClick={() => setTab(step.goto)}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-200 ${
                    step.done ? "text-slate-500" : "text-slate-200 hover:bg-white/5"
                  }`}
                >
                  {step.done ? (
                    <CheckCircleIcon className="h-4.5 w-4.5 shrink-0 text-emerald-400" />
                  ) : (
                    <CircleIcon className="h-4.5 w-4.5 shrink-0 text-slate-600" />
                  )}
                  <span className={step.done ? "line-through" : ""}>{step.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-white/10" role="tablist" aria-label="Bot settings">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`relative inline-flex shrink-0 cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium transition-colors duration-200 ${
              tab === t.id ? "text-emerald-300" : "text-slate-400 hover:text-white"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {tab === t.id ? (
              <motion.span
                layoutId="editor-tab-underline"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-emerald-400"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            ) : null}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
      {/* Tab: Setup (server) */}
      {tab === "setup" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel
            title="Discord server"
            description="The server this bot operates in. Moving it resets channel assignments."
          >
            <Field label="Server">
              <Select
                ariaLabel="Discord server"
                value={selectedGuildId}
                onChange={(guildId) => setPendingGuildId(guildId === bot.guild_id ? null : guildId)}
                placeholder={guilds.length ? "Select a server" : "Loading servers..."}
                options={guilds.map((guild) => ({
                  value: guild.id,
                  label: guild.name,
                  icon: guild.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={guild.icon} alt="" className="h-5 w-5 rounded-md" />
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10 text-[10px] font-bold text-slate-300">
                      {guild.name.charAt(0).toUpperCase()}
                    </span>
                  )
                }))}
              />
            </Field>
            <AnimatePresence>
              {guildChanged ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                    <p className="text-sm text-amber-100">
                      Moving the bot restarts it, and its voice and log channels will need to be picked again in the
                      new server.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className="btn-primary px-4 py-2"
                        disabled={movingGuild}
                        onClick={() => void handleMoveGuild()}
                      >
                        {movingGuild ? "Moving..." : "Move bot to this server"}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary px-4 py-2"
                        disabled={movingGuild}
                        onClick={() => setPendingGuildId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
            {!guildChanged && currentGuild ? (
              <p className="text-xs text-slate-500">
                Channels below are loaded from <span className="text-slate-300">{currentGuild.name}</span>.
              </p>
            ) : null}
          </Panel>

          <Panel title="Voice & channels" description="Where your bot lives and logs.">
            {channelsError ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                <p className="flex items-center gap-2 font-medium">
                  <AlertIcon className="h-4 w-4" />
                  Could not load channels
                </p>
                <p className="mt-1 text-amber-100/80">
                  Make sure the bot is invited to your server first{invite ? " — use the invite link on this page" : ""}.
                </p>
              </div>
            ) : null}
            <Field label="Voice channel" hint="Members must join this channel to use music commands.">
              <Select
                ariaLabel="Voice channel"
                value={form.voice_channel_id}
                onChange={(value) => setForm((prev) => ({ ...prev, voice_channel_id: value }))}
                leadingIcon={<MicIcon className="h-4 w-4" />}
                placeholder="Not set"
                options={[
                  { value: "", label: "Not set" },
                  ...voiceChannels.map((channel) => ({ value: channel.id, label: channel.name }))
                ]}
              />
            </Field>
            <Field label="Log channel" hint="Optional. Bot activity logs are posted here.">
              <Select
                ariaLabel="Log channel"
                value={form.log_channel_id}
                onChange={(value) => setForm((prev) => ({ ...prev, log_channel_id: value }))}
                placeholder="Disabled"
                options={[
                  { value: "", label: "Disabled" },
                  ...textChannels.map((channel) => ({ value: channel.id, label: `#${channel.name}` }))
                ]}
              />
            </Field>
            <Field label="Bot language">
              <Select
                ariaLabel="Bot language"
                value={form.language}
                onChange={(value) => setForm((prev) => ({ ...prev, language: value as "ar" | "en" }))}
                options={[
                  { value: "ar", label: "العربية (Arabic)" },
                  { value: "en", label: "English" }
                ]}
              />
            </Field>
          </Panel>

          <Panel title="Invite link" description="Add this bot to your Discord server.">
            {invite ? (
              <>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <LinkIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input className="field truncate pl-10" readOnly value={invite} aria-label="Bot invite link" />
                  </div>
                  <button type="button" className="btn-secondary shrink-0" onClick={() => void handleCopyInvite()}>
                    {copied ? <CheckIcon className="h-4 w-4 text-emerald-400" /> : <CopyIcon className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <a href={invite} target="_blank" rel="noreferrer" className="btn-primary w-full">
                  Open invite in Discord
                </a>
              </>
            ) : (
              <p className="text-sm text-slate-400">Invite link is unavailable for this bot.</p>
            )}
          </Panel>
        </div>
      ) : null}

      {/* Tab: Profile */}
      {tab === "profile" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Identity" description="How your bot appears in Discord.">
            <Field label="Bot name">
              <input
                className="field"
                value={form.name}
                maxLength={32}
                placeholder="e.g. Party Mix"
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </Field>
            <Field label="Avatar URL" hint="Square image, at least 128×128.">
              <input
                className="field"
                value={form.avatar}
                placeholder="https://..."
                onChange={(e) => setForm((prev) => ({ ...prev, avatar: e.target.value }))}
              />
            </Field>
            <Field label="Banner URL" hint="Optional. Shown on the bot's Discord profile.">
              <input
                className="field"
                value={form.banner}
                placeholder="https://..."
                onChange={(e) => setForm((prev) => ({ ...prev, banner: e.target.value }))}
              />
            </Field>
            <p className="text-xs text-slate-500">
              Note: Discord rate-limits name and avatar changes to a couple per hour.
            </p>
          </Panel>

          <Panel title="Preview">
            <div className="overflow-hidden rounded-xl border border-white/10">
              {form.banner ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.banner} alt="Banner preview" className="h-24 w-full object-cover" />
              ) : (
                <div className="h-16 bg-gradient-to-r from-emerald-500/20 to-slate-800" />
              )}
              <div className="bg-slate-950/60 px-4 pb-4">
                <div className="-mt-7 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-4 border-slate-950 bg-slate-800">
                  {form.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.avatar} alt="Avatar preview" className="h-full w-full object-cover" />
                  ) : (
                    <BotIcon className="h-6 w-6 text-emerald-400" />
                  )}
                </div>
                <p className="mt-2 font-semibold text-white">{form.name.trim() || "Unnamed Bot"}</p>
                <p className="text-xs text-slate-500">
                  {form.status_text.trim()
                    ? `${form.status_type.toLowerCase()} ${form.status_text.trim()}`
                    : "No status set"}
                </p>
              </div>
            </div>
          </Panel>
        </div>
      ) : null}

      {/* Tab: Presence */}
      {tab === "presence" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Activity status" description="What the bot shows under its name in the member list.">
            <Field label="Activity type">
              <Select
                ariaLabel="Activity type"
                value={form.status_type}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    status_type: value as NonNullable<BotDto["status_type"]>
                  }))
                }
                options={[
                  { value: "PLAYING", label: "Playing" },
                  { value: "LISTENING", label: "Listening to" },
                  { value: "WATCHING", label: "Watching" },
                  { value: "COMPETING", label: "Competing in" }
                ]}
              />
            </Field>
            <Field label="Status text">
              <input
                className="field"
                value={form.status_text}
                maxLength={128}
                placeholder="e.g. your favorite tracks"
                onChange={(e) => setForm((prev) => ({ ...prev, status_text: e.target.value }))}
              />
            </Field>
            <Field label="Online status">
              <Select
                ariaLabel="Online status"
                value={form.online_status}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    online_status: value as NonNullable<BotDto["online_status"]>
                  }))
                }
                options={[
                  { value: "online", label: "Online", icon: <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> },
                  { value: "idle", label: "Idle", icon: <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> },
                  { value: "dnd", label: "Do Not Disturb", icon: <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> },
                  { value: "invisible", label: "Invisible", icon: <span className="h-2.5 w-2.5 rounded-full bg-slate-600" /> }
                ]}
              />
            </Field>
          </Panel>

          <Panel title="Preview">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3.5">
              <div className="relative">
                <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-slate-800">
                  {form.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <BotIcon className="h-5 w-5 text-emerald-400" />
                  )}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-slate-950 ${
                    form.online_status === "online"
                      ? "bg-emerald-400"
                      : form.online_status === "idle"
                        ? "bg-amber-400"
                        : form.online_status === "dnd"
                          ? "bg-rose-500"
                          : "bg-slate-600"
                  }`}
                />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{form.name.trim() || "Unnamed Bot"}</p>
                <p className="truncate text-xs text-slate-400">
                  {form.status_text.trim()
                    ? `${
                        form.status_type === "PLAYING"
                          ? "Playing"
                          : form.status_type === "LISTENING"
                            ? "Listening to"
                            : form.status_type === "WATCHING"
                              ? "Watching"
                              : "Competing in"
                      } ${form.status_text.trim()}`
                    : "Online"}
                </p>
              </div>
            </div>
          </Panel>
        </div>
      ) : null}

      {/* Tab: Access */}
      {tab === "access" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Team members" description="People who can view or manage this bot.">
            {access.length ? (
              <ul className="space-y-2">
                {access.map((row) => (
                  <li
                    key={row.user_id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5">
                        {row.role === "owner" ? (
                          <ShieldIcon className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <UsersIcon className="h-4 w-4 text-slate-400" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm text-white">{row.user_id}</p>
                        <p className="text-xs capitalize text-slate-500">{row.role}</p>
                      </div>
                    </div>
                    {row.role !== "owner" ? (
                      <button
                        type="button"
                        className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors duration-200 hover:bg-rose-500/10"
                        onClick={() => void handleRevokeAccess(row.user_id)}
                      >
                        Revoke
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">Only you have access to this bot.</p>
            )}
          </Panel>

          <Panel title="Invite a member" description="Grant access by Discord user ID.">
            <Field label="Discord user ID" hint="Right-click a user in Discord → Copy User ID (Developer Mode).">
              <input
                className="field"
                placeholder="e.g. 720115877873451048"
                value={accessUserId}
                onChange={(e) => setAccessUserId(e.target.value)}
              />
            </Field>
            <Field label="Role">
              <Select
                ariaLabel="Role"
                value={accessRole}
                onChange={(value) => setAccessRole(value as "admin" | "viewer")}
                options={[
                  { value: "admin", label: "Admin — can edit and control the bot" },
                  { value: "viewer", label: "Viewer — read-only access" }
                ]}
              />
            </Field>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={!accessUserId.trim()}
              onClick={() => void handleGrantAccess()}
            >
              Grant access
            </button>
          </Panel>
        </div>
      ) : null}

      {/* Tab: Billing */}
      {tab === "billing" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Subscription">
            {subscription ? (
              <dl className="divide-y divide-white/5">
                <Row label="Subscription ID" value={subscription.px_id} mono />
                <Row label="Plan" value={subscription.plan_label} />
                <Row label="Started" value={new Date(subscription.start_date).toLocaleDateString()} />
                <Row label="Renews / ends" value={new Date(subscription.end_date).toLocaleString()} />
              </dl>
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                <p className="flex items-center gap-2 font-medium">
                  <AlertIcon className="h-4 w-4" />
                  No active subscription
                </p>
                <p className="mt-1 text-amber-100/80">Contact a platform admin to renew this bot.</p>
              </div>
            )}
          </Panel>

          {subscription ? (
            <Panel title="Time remaining">
              <TimeRemaining endDate={subscription.end_date} />
            </Panel>
          ) : null}
        </div>
      ) : null}
        </motion.div>
      </AnimatePresence>

      {/* Sticky save bar */}
      <AnimatePresence>
        {dirty ? (
          <motion.div
            className="fixed inset-x-4 bottom-4 z-50"
            initial={{ opacity: 0, y: 72 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 72 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          >
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/95 px-5 py-3.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
              <p className="text-sm text-slate-300">You have unsaved changes</p>
              <div className="flex shrink-0 gap-2">
                <button type="button" className="btn-secondary px-4 py-2" onClick={handleDiscard} disabled={saving}>
                  Discard
                </button>
                <button type="button" className="btn-primary px-4 py-2" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function TimeRemaining({ endDate }: { endDate: string }) {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  const msLeft = Math.max(0, end - now);
  const days = Math.floor(msLeft / 86_400_000);
  const hours = Math.floor((msLeft % 86_400_000) / 3_600_000);
  const expired = msLeft === 0;

  return (
    <div className="flex items-center gap-4">
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-xl ${
          expired ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"
        }`}
      >
        <ClockIcon className="h-6 w-6" />
      </span>
      <div>
        {expired ? (
          <p className="text-lg font-bold text-rose-300">Expired</p>
        ) : (
          <p className="text-lg font-bold text-white">
            {days}d {hours}h
          </p>
        )}
        <p className="text-xs text-slate-500">until subscription {expired ? "ended" : "ends"}</p>
      </div>
    </div>
  );
}

function Panel({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-6">
      <h3 className="font-semibold text-white">{title}</h3>
      {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className={`text-sm font-medium text-white ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
