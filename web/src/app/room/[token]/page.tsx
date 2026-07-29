"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  fetchRoomPage,
  roomPlayerClear,
  roomPlayerPause,
  roomPlayerPlay,
  roomPlayerRemoveQueueItem,
  roomPlayerReorderQueue,
  roomPlayerResume,
  roomPlayerSeek,
  roomPlayerSetVolume,
  roomPlayerSkip,
  roomPlayerStop
} from "@/lib/api";
import { getDiscordAuthUrl, getStoredToken } from "@/lib/auth";
import type { PlayerStateDto, RoomActionDto, RoomSummaryDto } from "@/lib/types";
import { useLiveData } from "@/hooks/use-live-data";
import { ActionLog, PlayerPanel, type PlayerController } from "@/components/player-panel";
import { AlertIcon, ArrowRightIcon, DiscordIcon, MicIcon, MusicIcon, ZapIcon } from "@/components/icons";

export default function RoomPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [room, setRoom] = useState<RoomSummaryDto | null>(null);
  const [player, setPlayer] = useState<PlayerStateDto | null>(null);
  const [actions, setActions] = useState<RoomActionDto[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [inVoice, setInVoice] = useState(false);
  const [canControl, setCanControl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useLiveData(async () => {
    try {
      const result = await fetchRoomPage(token);
      setRoom(result.room);
      setPlayer(result.player);
      setActions(result.actions);
      setAuthenticated(result.authenticated);
      setInVoice(result.inVoice);
      setCanControl(result.canControl);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load room");
    }
  }, 4_000);

  const controller = useMemo<PlayerController>(
    () => ({
      play: (query) => roomPlayerPlay(token, query),
      pause: () => roomPlayerPause(token),
      resume: () => roomPlayerResume(token),
      skip: () => roomPlayerSkip(token),
      stop: () => roomPlayerStop(token),
      clear: () => roomPlayerClear(token),
      setVolume: (percent) => roomPlayerSetVolume(token, percent),
      seek: (positionMs) => roomPlayerSeek(token, positionMs),
      removeQueueItem: (index) => roomPlayerRemoveQueueItem(token, index),
      reorderQueue: (fromIndex, toIndex) => roomPlayerReorderQueue(token, fromIndex, toIndex)
    }),
    [token]
  );

  function signIn() {
    try {
      window.location.href = getDiscordAuthUrl(`/room/${token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discord OAuth is not configured");
    }
  }

  const disabledReason = !authenticated
    ? "Sign in with Discord to control music."
    : !inVoice
      ? `Join the assigned voice channel${room?.voiceChannelName ? ` (${room.voiceChannelName})` : ""} to unlock controls.`
      : !room?.isRunning
        ? "This bot is offline right now."
        : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <MusicIcon className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight text-white">PXVault</span>
          </a>
          <div className="flex items-center gap-2 sm:gap-3">
            <a href="/#pricing" className="btn-secondary hidden px-3 py-2 text-xs sm:inline-flex">
              Pricing
            </a>
            <a href="/" className="btn-primary px-3 py-2 text-xs sm:px-4 sm:text-sm">
              Get your own bots
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <section className="relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/15 via-slate-900/85 to-slate-950 p-5 sm:p-8">
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{ background: "radial-gradient(ellipse 70% 60% at 85% 0%, rgba(34,197,94,0.18), transparent 60%)" }}
            aria-hidden
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                <ZapIcon className="h-3.5 w-3.5" />
                Powered by PXVault
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Your music bots,
                <span className="block text-emerald-300">finally easy to manage.</span>
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-300 sm:text-base">
                This private music room is running on a <span className="font-medium text-white">PXVault</span> bot —
                Discord music bots you can buy, manage from a dashboard, and share with your community.
                Like what you hear? Get your own bots for your server.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a href="/" className="btn-primary">
                  Explore PXVault
                  <ArrowRightIcon className="h-4 w-4" />
                </a>
                <a href="/#pricing" className="btn-secondary">
                  View pricing
                </a>
                {!authenticated || !getStoredToken() ? (
                  <button className="btn-secondary" onClick={signIn}>
                    <DiscordIcon className="h-4 w-4" />
                    Sign in to control this room
                  </button>
                ) : null}
              </div>
            </div>

            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-950/60 p-4 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/80">Why PXVault</p>
              <ul className="mt-3 space-y-2.5 text-sm text-slate-300">
                <li className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  Private music bots for Discord communities
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  Web dashboard + room links like this one
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  Plans from a few bots to 100+ for your server
                </li>
              </ul>
              <a href="/#pricing" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-300 hover:text-emerald-200">
                See plans & pricing
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </section>

        <header className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white/5">
              {room?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={room.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <MusicIcon className="h-7 w-7 text-emerald-400" />
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-400/80">This room</p>
              <h2 className="text-2xl font-semibold text-white">{room?.displayName ?? "Music room"}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                <MicIcon className="h-4 w-4" />
                {room?.voiceChannelName ? `#${room.voiceChannelName}` : "Assigned voice channel"}
                <span className="text-slate-600">·</span>
                {room?.isRunning ? "Online" : "Offline"}
              </p>
            </div>
          </div>
          {!authenticated || !getStoredToken() ? (
            <button className="btn-primary shrink-0 self-start sm:self-auto" onClick={signIn}>
              <DiscordIcon className="h-4 w-4" />
              Sign in with Discord
            </button>
          ) : (
            <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-300">
              {inVoice ? "You are in the voice room — controls unlocked." : "Signed in. Join the voice channel to unlock controls."}
            </div>
          )}
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300/80">Step 1</p>
            <p className="mt-1 text-sm font-medium text-white">Join the voice channel</p>
            <p className="mt-1 text-xs text-slate-400">
              {room?.voiceChannelName ? `#${room.voiceChannelName}` : "Enter the bot’s assigned voice room"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300/80">Step 2</p>
            <p className="mt-1 text-sm font-medium text-white">Sign in with Discord</p>
            <p className="mt-1 text-xs text-slate-400">We only use Discord to confirm you are in the room.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300/80">Step 3</p>
            <p className="mt-1 text-sm font-medium text-white">Control playback</p>
            <p className="mt-1 text-xs text-slate-400">Search, seek, skip, and manage the queue from here.</p>
          </div>
        </div>

        {loadError ? (
          <div className="card flex items-start gap-2 p-4 text-sm text-amber-100">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{loadError}</p>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <PlayerPanel
            state={player}
            error={error}
            disabled={!canControl}
            disabledReason={disabledReason}
            controller={controller}
            onStateChange={setPlayer}
            onError={setError}
            compact
          />
          <div className="space-y-6">
            <section className="card p-5">
              <h3 className="text-lg font-semibold text-white">Queue</h3>
              <div className="scroll-thin mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                {player?.queue?.length ? (
                  player.queue.map((track, index) => (
                    <div key={`${track.url}-${index}`} className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5">
                      <p className="truncate text-sm font-medium text-white">{track.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{track.artistName ?? "Unknown artist"}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">Queue is empty.</p>
                )}
              </div>
            </section>
            <ActionLog actions={actions} />
          </div>
        </div>

        <section className="card relative overflow-hidden border-emerald-500/20 px-6 py-10 text-center sm:px-10">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 70% 90% at 50% 110%, rgba(34,197,94,0.16), transparent 70%)" }}
            aria-hidden
          />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">Want bots like this?</p>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Get PXVault for your Discord server</h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400 sm:text-base">
              Buy private music bots, manage them from the dashboard, and share room links with your members —
              the same experience you just tried.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <a href="/" className="btn-primary px-6 py-3">
                Visit PXVault
                <ArrowRightIcon className="h-4 w-4" />
              </a>
              <a href="/#pricing" className="btn-secondary px-6 py-3">
                See pricing
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
