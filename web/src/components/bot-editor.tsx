"use client";

import { useEffect, useState } from "react";
import {
  fetchAccess,
  fetchChannels,
  fetchInvite,
  grantAccess,
  revokeAccess,
  startBot,
  stopBot,
  updateBot
} from "@/lib/api";
import type { AccessDto, BotDto, ChannelDto, SubscriptionDto } from "@/lib/types";
import { botStatusTone, StatusBadge } from "@/components/status-badge";

type BotEditorProps = {
  initialBot: BotDto;
  initialSubscription: SubscriptionDto | null;
};

export function BotEditor({ initialBot, initialSubscription }: BotEditorProps) {
  const [bot, setBot] = useState(initialBot);
  const [subscription] = useState(initialSubscription);
  const [channels, setChannels] = useState<ChannelDto[]>([]);
  const [access, setAccess] = useState<AccessDto[]>([]);
  const [invite, setInvite] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [accessUserId, setAccessUserId] = useState("");
  const [accessRole, setAccessRole] = useState<"admin" | "viewer">("admin");

  const [form, setForm] = useState({
    name: bot.name ?? "",
    avatar: bot.avatar ?? "",
    banner: bot.banner ?? "",
    language: bot.language ?? "ar",
    voice_channel_id: bot.voice_channel_id ?? "",
    log_channel_id: bot.log_channel_id ?? "",
    status_type: bot.status_type ?? "PLAYING",
    status_text: bot.status_text ?? "",
    online_status: bot.online_status ?? "online"
  });

  useEffect(() => {
    void Promise.all([
      fetchChannels(bot.id).then((res) => setChannels(res.channels)),
      fetchAccess(bot.id).then((res) => setAccess(res.access)),
      fetchInvite(bot.id).then((res) => setInvite(res.invite)).catch(() => setInvite(null))
    ]).catch((err: Error) => setError(err.message));
  }, [bot.id]);

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
        status_type: form.status_type as BotDto["status_type"],
        status_text: form.status_text.trim() || null,
        online_status: form.online_status as BotDto["online_status"]
      });
      setBot(result.bot);
      setMessage("Bot settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleStartStop(action: "start" | "stop") {
    setError(null);
    setMessage(null);
    try {
      const result = action === "start" ? await startBot(bot.id) : await stopBot(bot.id);
      setBot(result.bot);
      setMessage(action === "start" ? "Bot started." : "Bot stopped.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function handleGrantAccess() {
    if (!accessUserId.trim()) {
      return;
    }
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

  const voiceChannels = channels.filter((channel) => channel.type === "voice");
  const textChannels = channels.filter((channel) => channel.type === "text");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-white">{bot.display_name}</h1>
          <p className="mt-1 text-sm text-zinc-400">Bot ID {bot.id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={bot.status} tone={botStatusTone(bot.status)} />
          {bot.runtime_state ? <StatusBadge label={bot.runtime_state} tone="blue" /> : null}
        </div>
      </div>

      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      {bot.last_error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Last error: {bot.last_error}
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title="Profile">
          <Field label="Name">
            <input
              className="field"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </Field>
          <Field label="Avatar URL">
            <input
              className="field"
              value={form.avatar}
              onChange={(e) => setForm((prev) => ({ ...prev, avatar: e.target.value }))}
            />
          </Field>
          <Field label="Banner URL">
            <input
              className="field"
              value={form.banner}
              onChange={(e) => setForm((prev) => ({ ...prev, banner: e.target.value }))}
            />
          </Field>
        </Panel>

        <Panel title="Presence">
          <Field label="Activity type">
            <select
              className="field"
              value={form.status_type}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  status_type: e.target.value as NonNullable<BotDto["status_type"]>
                }))
              }
            >
              {["PLAYING", "LISTENING", "WATCHING", "COMPETING"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status text">
            <input
              className="field"
              value={form.status_text}
              onChange={(e) => setForm((prev) => ({ ...prev, status_text: e.target.value }))}
            />
          </Field>
          <Field label="Online status">
            <select
              className="field"
              value={form.online_status}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  online_status: e.target.value as NonNullable<BotDto["online_status"]>
                }))
              }
            >
              {["online", "idle", "dnd", "invisible"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
        </Panel>

        <Panel title="Server">
          <Field label="Language">
            <select
              className="field"
              value={form.language}
              onChange={(e) => setForm((prev) => ({ ...prev, language: e.target.value as "ar" | "en" }))}
            >
              <option value="ar">Arabic</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label="Voice channel">
            <select
              className="field"
              value={form.voice_channel_id}
              onChange={(e) => setForm((prev) => ({ ...prev, voice_channel_id: e.target.value }))}
            >
              <option value="">Not set</option>
              {voiceChannels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Log channel">
            <select
              className="field"
              value={form.log_channel_id}
              onChange={(e) => setForm((prev) => ({ ...prev, log_channel_id: e.target.value }))}
            >
              <option value="">Disabled</option>
              {textChannels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </Field>
        </Panel>

        <Panel title="Controls">
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-primary" onClick={() => void handleStartStop("start")}>
              Start bot
            </button>
            <button type="button" className="btn-secondary" onClick={() => void handleStartStop("stop")}>
              Stop bot
            </button>
            <button type="button" className="btn-primary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
          {invite ? (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-zinc-400">Invite link</p>
              <div className="flex gap-2">
                <input className="field" readOnly value={invite} />
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => void navigator.clipboard.writeText(invite)}
                >
                  Copy
                </button>
              </div>
            </div>
          ) : null}
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title="Subscription">
          {subscription ? (
            <dl className="space-y-3 text-sm">
              <Row label="PX ID" value={subscription.px_id} />
              <Row label="Plan" value={subscription.plan_label} />
              <Row label="Ends" value={new Date(subscription.end_date).toLocaleString()} />
            </dl>
          ) : (
            <p className="text-sm text-zinc-400">No active subscription.</p>
          )}
        </Panel>

        <Panel title="Access">
          <div className="space-y-3">
            {access.length ? (
              access.map((row) => (
                <div key={row.user_id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-white">{row.user_id}</p>
                    <p className="text-zinc-400">{row.role}</p>
                  </div>
                  {row.role !== "owner" ? (
                    <button type="button" className="btn-secondary" onClick={() => void handleRevokeAccess(row.user_id)}>
                      Revoke
                    </button>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-400">No shared access entries.</p>
            )}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input
              className="field"
              placeholder="Discord user ID"
              value={accessUserId}
              onChange={(e) => setAccessUserId(e.target.value)}
            />
            <select className="field" value={accessRole} onChange={(e) => setAccessRole(e.target.value as "admin" | "viewer")}>
              <option value="admin">admin</option>
              <option value="viewer">viewer</option>
            </select>
            <button type="button" className="btn-primary" onClick={() => void handleGrantAccess()}>
              Grant
            </button>
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="mb-4 text-lg font-semibold text-white">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="font-medium text-white">{value}</dd>
    </div>
  );
}
