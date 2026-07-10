"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { bulkUpdateBots, uploadBotAsset } from "@/lib/api";
import type { BotDto } from "@/lib/types";
import { useBots } from "@/components/bots-context";
import { Select } from "@/components/select";
import {
  AlertIcon,
  CheckCircleIcon,
  ImageIcon,
  PlayIcon,
  SparklesIcon,
  StopIcon,
  UsersIcon,
  XIcon
} from "@/components/icons";

type BulkTab = "profile" | "presence" | "setup" | "access" | "actions";

function buildSequentialNames(
  bots: BotDto[],
  baseName: string,
  pattern: string,
  start: number
): Record<string, string> {
  const names: Record<string, string> = {};
  bots.forEach((bot, index) => {
    const n = start + index;
    const name = pattern.replaceAll("{n}", String(n)).replaceAll("{name}", baseName.trim() || "Bot");
    names[bot.id] = name.slice(0, 32);
  });
  return names;
}

export function BulkBotPanel() {
  const { selectedBots, selectedIds, selectionMode, setSelectionMode, refreshBots } = useBots();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<BulkTab>("profile");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);

  const [avatar, setAvatar] = useState("");
  const [banner, setBanner] = useState("");
  const [useNumberedNames, setUseNumberedNames] = useState(false);
  const [nameBase, setNameBase] = useState("");
  const [namePattern, setNamePattern] = useState("{n}. {name}");
  const [nameStart, setNameStart] = useState(1);

  const [statusType, setStatusType] = useState<NonNullable<BotDto["status_type"]>>("PLAYING");
  const [statusText, setStatusText] = useState("");
  const [onlineStatus, setOnlineStatus] = useState<NonNullable<BotDto["online_status"]>>("online");

  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [logChannelId, setLogChannelId] = useState("");
  const [voiceChannelId, setVoiceChannelId] = useState("");

  const [accessUserId, setAccessUserId] = useState("");
  const [accessRole, setAccessRole] = useState<"admin" | "viewer">("admin");

  const count = selectedIds.size;
  const showTrigger = selectionMode && count > 0;

  const namePreview = useMemo(() => {
    if (!useNumberedNames) return [];
    return selectedBots.map((bot, index) => {
      const n = nameStart + index;
      return {
        id: bot.id,
        label: bot.display_name,
        next: namePattern.replaceAll("{n}", String(n)).replaceAll("{name}", nameBase.trim() || "Bot").slice(0, 32)
      };
    });
  }, [useNumberedNames, selectedBots, nameBase, namePattern, nameStart]);

  async function handleUpload(kind: "avatar" | "banner", file: File | null) {
    if (!file || !selectedBots[0]) return;
    setUploading(kind);
    setError(null);
    try {
      const result = await uploadBotAsset(selectedBots[0].id, file, kind);
      if (kind === "avatar") setAvatar(result.url);
      else setBanner(result.url);
      setMessage(`${kind === "avatar" ? "Avatar" : "Banner"} uploaded — ready to apply.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function applyBulk(extra?: { action?: "start" | "stop" }) {
    if (!count) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    const bot_ids = selectedBots.map((b) => b.id);
    const patch: Parameters<typeof bulkUpdateBots>[0]["patch"] = {};
    let names: Record<string, string> | undefined;

    if (tab === "profile" || tab === "presence" || tab === "setup") {
      if (tab === "profile") {
        if (avatar.trim()) patch.avatar = avatar.trim();
        if (banner.trim()) patch.banner = banner.trim();
        if (useNumberedNames) {
          names = buildSequentialNames(selectedBots, nameBase, namePattern, nameStart);
        }
      }
      if (tab === "presence") {
        patch.status_type = statusType;
        patch.status_text = statusText.trim() || null;
        patch.online_status = onlineStatus;
      }
      if (tab === "setup") {
        patch.language = language;
        patch.log_channel_id = logChannelId.trim() || null;
        if (voiceChannelId.trim()) patch.voice_channel_id = voiceChannelId.trim();
      }
    }

    try {
      const result = await bulkUpdateBots({
        bot_ids,
        ...(Object.keys(patch).length ? { patch } : {}),
        ...(names ? { names } : {}),
        ...(tab === "access" && accessUserId.trim()
          ? { grant_access: { user_id: accessUserId.trim(), role: accessRole } }
          : {}),
        ...(extra?.action ? { action: extra.action } : {})
      });

      const updated = result.updated.length;
      const failed = result.failed.length + (result.grant_failed?.length ?? 0) + (result.control_failed?.length ?? 0);
      const granted = result.granted?.length ?? 0;
      const controlled = result.controlled?.length ?? 0;

      const parts: string[] = [];
      if (updated) parts.push(`${updated} updated`);
      if (granted) parts.push(`${granted} granted access`);
      if (controlled) parts.push(`${controlled} ${extra?.action === "start" ? "started" : "stopped"}`);
      if (failed) parts.push(`${failed} failed`);

      setMessage(parts.length ? parts.join(", ") + "." : "Applied.");
      await refreshBots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AnimatePresence>
        {showTrigger && !open ? (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 cursor-pointer rounded-2xl border border-emerald-500/40 bg-emerald-500/20 px-5 py-3 text-sm font-semibold text-emerald-100 shadow-2xl shadow-black/40 backdrop-blur-xl transition-colors hover:bg-emerald-500/30"
          >
            Configure {count} bot{count === 1 ? "" : "s"}
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open && count > 0 ? (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-labelledby="bulk-panel-title"
              className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-h-[min(90vh,820px)] max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/50"
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <h2 id="bulk-panel-title" className="text-lg font-semibold text-white">
                    Bulk configure
                  </h2>
                  <p className="text-sm text-slate-400">
                    {count} bot{count === 1 ? "" : "s"} selected — changes apply to all at once
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                  aria-label="Close"
                >
                  <XIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-4" role="tablist">
                {(
                  [
                    ["profile", "Profile", ImageIcon],
                    ["presence", "Presence", SparklesIcon],
                    ["setup", "Setup", UsersIcon],
                    ["access", "Access", UsersIcon],
                    ["actions", "Actions", PlayIcon]
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={`inline-flex shrink-0 cursor-pointer items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                      tab === id ? "text-emerald-300" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>

              <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5">
                {message ? (
                  <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                    <CheckCircleIcon className="h-4 w-4 shrink-0" />
                    {message}
                  </div>
                ) : null}
                {error ? (
                  <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    <AlertIcon className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                ) : null}

                {tab === "profile" ? (
                  <div className="space-y-5">
                    <Field label="Avatar URL (all bots)">
                      <input className="field" value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://..." />
                      <label className="btn-secondary mt-2 block w-full cursor-pointer text-center">
                        {uploading === "avatar" ? "Uploading…" : "Upload avatar for all"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          onChange={(e) => void handleUpload("avatar", e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </Field>
                    <Field label="Banner URL (all bots)">
                      <input className="field" value={banner} onChange={(e) => setBanner(e.target.value)} placeholder="https://..." />
                      <label className="btn-secondary mt-2 block w-full cursor-pointer text-center">
                        {uploading === "banner" ? "Uploading…" : "Upload banner for all"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          onChange={(e) => void handleUpload("banner", e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </Field>
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={useNumberedNames}
                          onChange={(e) => setUseNumberedNames(e.target.checked)}
                          className="h-4 w-4 rounded border-white/20 bg-slate-900 text-emerald-500"
                        />
                        <span className="text-sm font-medium text-white">Numbered names (1, 2, 3…)</span>
                      </label>
                      {useNumberedNames ? (
                        <div className="mt-4 space-y-3">
                          <Field label="Base name">
                            <input className="field" value={nameBase} onChange={(e) => setNameBase(e.target.value)} placeholder="Music Bot" />
                          </Field>
                          <Field label="Pattern" hint="Use {n} for number and {name} for base name">
                            <input className="field" value={namePattern} onChange={(e) => setNamePattern(e.target.value)} />
                          </Field>
                          <Field label="Start number">
                            <input
                              type="number"
                              min={1}
                              className="field"
                              value={nameStart}
                              onChange={(e) => setNameStart(Math.max(1, Number(e.target.value) || 1))}
                            />
                          </Field>
                          <ul className="space-y-1.5 rounded-lg border border-white/10 bg-slate-950/60 p-3 text-sm">
                            {namePreview.map((row) => (
                              <li key={row.id} className="flex justify-between gap-3 text-slate-400">
                                <span className="truncate">{row.label}</span>
                                <span className="shrink-0 font-medium text-emerald-300">→ {row.next}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {tab === "presence" ? (
                  <div className="space-y-5">
                    <Field label="Activity type">
                      <Select
                        ariaLabel="Activity type"
                        value={statusType}
                        onChange={(v) => setStatusType(v as NonNullable<BotDto["status_type"]>)}
                        options={[
                          { value: "PLAYING", label: "Playing" },
                          { value: "LISTENING", label: "Listening to" },
                          { value: "WATCHING", label: "Watching" },
                          { value: "COMPETING", label: "Competing in" }
                        ]}
                      />
                    </Field>
                    <Field label="Status text">
                      <input className="field" value={statusText} onChange={(e) => setStatusText(e.target.value)} maxLength={128} />
                    </Field>
                    <Field label="Online status">
                      <Select
                        ariaLabel="Online status"
                        value={onlineStatus}
                        onChange={(v) => setOnlineStatus(v as NonNullable<BotDto["online_status"]>)}
                        options={[
                          { value: "online", label: "Online" },
                          { value: "idle", label: "Idle" },
                          { value: "dnd", label: "Do Not Disturb" },
                          { value: "invisible", label: "Invisible" }
                        ]}
                      />
                    </Field>
                  </div>
                ) : null}

                {tab === "setup" ? (
                  <div className="space-y-5">
                    <Field label="Language">
                      <Select
                        ariaLabel="Language"
                        value={language}
                        onChange={(v) => setLanguage(v as "ar" | "en")}
                        options={[
                          { value: "ar", label: "العربية (Arabic)" },
                          { value: "en", label: "English" }
                        ]}
                      />
                    </Field>
                    <Field label="Log channel ID" hint="Leave empty to disable on all bots">
                      <input className="field" value={logChannelId} onChange={(e) => setLogChannelId(e.target.value)} placeholder="Channel ID or leave empty" />
                    </Field>
                    <Field label="Voice channel ID" hint="Same channel ID on every selected bot (if applicable)">
                      <input className="field" value={voiceChannelId} onChange={(e) => setVoiceChannelId(e.target.value)} placeholder="Optional" />
                    </Field>
                  </div>
                ) : null}

                {tab === "access" ? (
                  <div className="space-y-5">
                    <Field label="Discord user ID" hint="Grant this user access on every selected bot you own">
                      <input className="field" value={accessUserId} onChange={(e) => setAccessUserId(e.target.value)} placeholder="User ID" />
                    </Field>
                    <Field label="Role">
                      <Select
                        ariaLabel="Role"
                        value={accessRole}
                        onChange={(v) => setAccessRole(v as "admin" | "viewer")}
                        options={[
                          { value: "admin", label: "Admin" },
                          { value: "viewer", label: "Viewer" }
                        ]}
                      />
                    </Field>
                  </div>
                ) : null}

                {tab === "actions" ? (
                  <div className="flex flex-wrap gap-3">
                    <button type="button" className="btn-primary" disabled={saving} onClick={() => void applyBulk({ action: "start" })}>
                      <PlayIcon className="h-4 w-4" />
                      Start all
                    </button>
                    <button type="button" className="btn-danger" disabled={saving} onClick={() => void applyBulk({ action: "stop" })}>
                      <StopIcon className="h-4 w-4" />
                      Stop all
                    </button>
                  </div>
                ) : null}
              </div>

              {tab !== "actions" ? (
                <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setSelectionMode(false);
                      setOpen(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="button" className="btn-primary" disabled={saving} onClick={() => void applyBulk()}>
                    {saving ? "Applying…" : `Apply to ${count} bot${count === 1 ? "" : "s"}`}
                  </button>
                </div>
              ) : null}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
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
