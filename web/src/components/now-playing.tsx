"use client";

import { useState } from "react";
import {
  fetchPlayerState,
  playerPause,
  playerPlay,
  playerResume,
  playerSetVolume,
  playerSkip,
  playerStop
} from "@/lib/api";
import type { PlayerStateDto } from "@/lib/types";
import { useLiveData } from "@/hooks/use-live-data";
import { Equalizer } from "@/components/motion-primitives";
import { AlertIcon, MusicIcon, PlayIcon, StopIcon } from "@/components/icons";

export function NowPlaying({ botId }: { botId: string }) {
  const [state, setState] = useState<PlayerStateDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadPlayer() {
    try {
      const result = await fetchPlayerState(botId);
      setState(result.player);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load player");
    }
  }

  useLiveData(async () => {
    await loadPlayer();
  }, 5_000);

  async function runAction(action: () => Promise<{ player: PlayerStateDto }>) {
    setBusy(true);
    try {
      const result = await action();
      setState(result.player);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  function playFromInput() {
    const value = query.trim();
    if (!value || busy) return;
    void runAction(() => playerPlay(botId, value));
    setQuery("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-5">
        <h3 className="text-lg font-semibold text-white">Now Playing</h3>
        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/60 p-4">
          {state?.nowPlaying ? (
            <div className="flex gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
                {state.nowPlaying.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={state.nowPlaying.thumbnail} alt="" className="h-full w-full object-cover" />
                ) : (
                  <MusicIcon className="h-5 w-5 text-emerald-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">{state.nowPlaying.title}</p>
                <p className="truncate text-xs text-slate-400">{state.nowPlaying.artistName ?? "Unknown artist"}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-1/2 rounded-full bg-emerald-400" />
                </div>
                <p className="mt-1 text-xs text-slate-500">{state.nowPlaying.duration}</p>
              </div>
              {!state.isPaused ? <Equalizer className="h-4 shrink-0 self-center" /> : null}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Nothing is playing right now.</p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button className="btn-secondary" disabled={busy} onClick={() => void runAction(() => playerPause(botId))}>
            Pause
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => void runAction(() => playerResume(botId))}>
            Resume
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => void runAction(() => playerSkip(botId))}>
            Skip
          </button>
          <button className="btn-danger" disabled={busy} onClick={() => void runAction(() => playerStop(botId))}>
            <StopIcon className="h-4 w-4" />
            Stop
          </button>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm text-slate-300">Volume ({state?.volume ?? 80}%)</label>
          <input
            type="range"
            min={1}
            max={200}
            value={state?.volume ?? 80}
            className="w-full accent-emerald-400"
            onChange={(event) => {
              const value = Number(event.target.value);
              setState((prev) => (prev ? { ...prev, volume: value } : prev));
            }}
            onMouseUp={(event) => {
              const value = Number((event.target as HTMLInputElement).value);
              void runAction(() => playerSetVolume(botId, value));
            }}
            onTouchEnd={(event) => {
              const value = Number((event.target as HTMLInputElement).value);
              void runAction(() => playerSetVolume(botId, value));
            }}
          />
        </div>

        <div className="mt-4 flex gap-2">
          <input
            className="field"
            placeholder="Play query or URL..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                playFromInput();
              }
            }}
          />
          <button
            className="btn-primary shrink-0"
            disabled={busy || !query.trim()}
            onClick={playFromInput}
          >
            <PlayIcon className="h-4 w-4" />
            Play
          </button>
        </div>
      </section>

      <section className="card p-5">
        <h3 className="text-lg font-semibold text-white">Queue</h3>
        <div className="scroll-thin mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
          {state?.queue?.length ? (
            state.queue.map((track, index) => (
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
    </div>
  );
}
