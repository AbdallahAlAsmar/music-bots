"use client";

import { useMemo, useState } from "react";
import type { PlayerStateDto, RoomActionDto } from "@/lib/types";
import { Equalizer } from "@/components/motion-primitives";
import { AlertIcon, MusicIcon, PlayIcon, StopIcon } from "@/components/icons";

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function progressPercent(state: PlayerStateDto | null): number {
  const duration = state?.nowPlaying?.durationSeconds;
  const position = state?.positionMs ?? 0;
  if (!duration || duration <= 0) return 0;
  return Math.min(100, Math.max(0, (position / 1000 / duration) * 100));
}

export type PlayerController = {
  play: (query: string) => Promise<{ player: PlayerStateDto }>;
  pause: () => Promise<{ player: PlayerStateDto }>;
  resume: () => Promise<{ player: PlayerStateDto }>;
  skip: () => Promise<{ player: PlayerStateDto }>;
  stop: () => Promise<{ player: PlayerStateDto }>;
  clear: () => Promise<{ player: PlayerStateDto }>;
  setVolume: (percent: number) => Promise<{ player: PlayerStateDto }>;
};

type PlayerPanelProps = {
  state: PlayerStateDto | null;
  error?: string | null;
  busy?: boolean;
  disabled?: boolean;
  disabledReason?: string | null;
  controller: PlayerController;
  onStateChange?: (state: PlayerStateDto) => void;
  onError?: (message: string | null) => void;
  compact?: boolean;
};

export function PlayerPanel({
  state,
  error,
  busy = false,
  disabled = false,
  disabledReason,
  controller,
  onStateChange,
  onError,
  compact = false
}: PlayerPanelProps) {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const locked = disabled || busy || pending;
  const percent = useMemo(() => progressPercent(state), [state]);

  async function runAction(action: () => Promise<{ player: PlayerStateDto }>) {
    setPending(true);
    try {
      const result = await action();
      onStateChange?.(result.player);
      onError?.(null);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPending(false);
    }
  }

  function playFromInput() {
    const value = query.trim();
    if (!value || locked) return;
    void runAction(() => controller.play(value));
    setQuery("");
  }

  return (
    <div className={compact ? "grid gap-4" : "grid gap-6 lg:grid-cols-2"}>
      <section className="card p-5">
        <h3 className="text-lg font-semibold text-white">Now Playing</h3>
        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}
        {disabledReason ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{disabledReason}</p>
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
                  <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${percent}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {formatMs(state.positionMs ?? 0)}
                  {state.nowPlaying.duration ? ` / ${state.nowPlaying.duration}` : ""}
                </p>
              </div>
              {!state.isPaused ? <Equalizer className="h-4 shrink-0 self-center" /> : null}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Nothing is playing right now.</p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button className="btn-secondary" disabled={locked} onClick={() => void runAction(() => controller.pause())}>
            Pause
          </button>
          <button className="btn-secondary" disabled={locked} onClick={() => void runAction(() => controller.resume())}>
            Resume
          </button>
          <button className="btn-secondary" disabled={locked} onClick={() => void runAction(() => controller.skip())}>
            Skip
          </button>
          <button className="btn-secondary" disabled={locked} onClick={() => void runAction(() => controller.clear())}>
            Clear
          </button>
          <button className="btn-danger sm:col-span-2" disabled={locked} onClick={() => void runAction(() => controller.stop())}>
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
            disabled={locked}
            className="w-full accent-emerald-400"
            onChange={(event) => {
              const value = Number(event.target.value);
              onStateChange?.(state ? { ...state, volume: value } : { nowPlaying: null, queue: [], volume: value, loop: "off", isPaused: false, isConnected: false, positionMs: 0 });
            }}
            onMouseUp={(event) => {
              const value = Number((event.target as HTMLInputElement).value);
              void runAction(() => controller.setVolume(value));
            }}
            onTouchEnd={(event) => {
              const value = Number((event.target as HTMLInputElement).value);
              void runAction(() => controller.setVolume(value));
            }}
          />
        </div>

        <div className="mt-4 flex gap-2">
          <input
            className="field"
            placeholder="Search or paste a URL..."
            value={query}
            disabled={locked}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                playFromInput();
              }
            }}
          />
          <button className="btn-primary shrink-0" disabled={locked || !query.trim()} onClick={playFromInput}>
            <PlayIcon className="h-4 w-4" />
            Play
          </button>
        </div>
      </section>

      {!compact ? (
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
      ) : null}
    </div>
  );
}

export function ActionLog({ actions, emptyLabel = "No recent actions yet." }: { actions: RoomActionDto[]; emptyLabel?: string }) {
  return (
    <section className="card p-5">
      <h3 className="text-lg font-semibold text-white">Action log</h3>
      <div className="scroll-thin mt-4 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {actions.length ? (
          actions.map((row) => {
            const detail =
              typeof row.details?.query === "string"
                ? row.details.query
                : typeof row.details?.title === "string"
                  ? row.details.title
                  : typeof row.details?.volume === "number"
                    ? `${row.details.volume}%`
                    : typeof row.details?.mode === "string"
                      ? row.details.mode
                      : null;
            return (
              <div key={row.id} className="flex gap-3 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/5">
                  {row.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <MusicIcon className="h-4 w-4 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">
                    <span className="font-medium">{row.username ?? row.actor_tag}</span>
                    <span className="text-slate-400"> · {row.action}</span>
                    {detail ? <span className="text-slate-500"> · {detail}</span> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {row.source} · {new Date(row.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-slate-400">{emptyLabel}</p>
        )}
      </div>
    </section>
  );
}
