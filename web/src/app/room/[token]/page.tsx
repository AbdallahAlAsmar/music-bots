"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  fetchRoomPage,
  roomPlayerClear,
  roomPlayerPause,
  roomPlayerPlay,
  roomPlayerResume,
  roomPlayerSetVolume,
  roomPlayerSkip,
  roomPlayerStop
} from "@/lib/api";
import { getDiscordAuthUrl, getStoredToken } from "@/lib/auth";
import type { PlayerStateDto, RoomActionDto, RoomSummaryDto } from "@/lib/types";
import { useLiveData } from "@/hooks/use-live-data";
import { ActionLog, PlayerPanel, type PlayerController } from "@/components/player-panel";
import { AlertIcon, DiscordIcon, MicIcon, MusicIcon } from "@/components/icons";

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
      setVolume: (percent) => roomPlayerSetVolume(token, percent)
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
    <div className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
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
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-400/80">PXVault Room</p>
              <h1 className="text-2xl font-semibold text-white">{room?.displayName ?? "Music room"}</h1>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-400">
                <MicIcon className="h-4 w-4" />
                {room?.voiceChannelName ? `#${room.voiceChannelName}` : "Assigned voice channel"}
                <span className="text-slate-600">·</span>
                {room?.isRunning ? "Online" : "Offline"}
              </p>
            </div>
          </div>
          {!authenticated || !getStoredToken() ? (
            <button className="btn-primary" onClick={signIn}>
              <DiscordIcon className="h-4 w-4" />
              Sign in with Discord
            </button>
          ) : (
            <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-300">
              {inVoice ? "You are in the voice room — controls unlocked." : "You are signed in. Join the voice channel to control."}
            </div>
          )}
        </header>

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
      </div>
    </div>
  );
}
