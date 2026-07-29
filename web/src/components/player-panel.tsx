"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerStateDto, RoomActionDto } from "@/lib/types";
import { Equalizer } from "@/components/motion-primitives";
import { AlertIcon, MusicIcon, PlayIcon, StopIcon } from "@/components/icons";

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function durationMs(state: PlayerStateDto | null): number {
  const seconds = state?.nowPlaying?.durationSeconds;
  if (!seconds || seconds <= 0) return 0;
  return seconds * 1000;
}

function useLivePosition(state: PlayerStateDto | null): number {
  const [positionMs, setPositionMs] = useState(0);
  const syncRef = useRef({ positionMs: 0, syncedAt: 0, isPaused: true, trackKey: "" });

  useEffect(() => {
    const trackKey = state?.nowPlaying?.url ?? "";
    syncRef.current = {
      positionMs: state?.positionMs ?? 0,
      syncedAt: Date.now(),
      isPaused: Boolean(state?.isPaused),
      trackKey
    };
    setPositionMs(state?.positionMs ?? 0);
  }, [state?.positionMs, state?.isPaused, state?.nowPlaying?.url]);

  useEffect(() => {
    if (!state?.nowPlaying || state.isPaused) {
      return;
    }

    const timer = window.setInterval(() => {
      const sync = syncRef.current;
      if (sync.isPaused || !sync.trackKey) {
        return;
      }
      const total = durationMs(state);
      const next = sync.positionMs + (Date.now() - sync.syncedAt);
      setPositionMs(total > 0 ? Math.min(next, total) : next);
    }, 200);

    return () => window.clearInterval(timer);
  }, [state?.isPaused, state?.nowPlaying?.url]);

  return positionMs;
}

export type PlayerController = {
  play: (query: string) => Promise<{ player: PlayerStateDto }>;
  pause: () => Promise<{ player: PlayerStateDto }>;
  resume: () => Promise<{ player: PlayerStateDto }>;
  skip: () => Promise<{ player: PlayerStateDto }>;
  stop: () => Promise<{ player: PlayerStateDto }>;
  clear: () => Promise<{ player: PlayerStateDto }>;
  setVolume: (percent: number) => Promise<{ player: PlayerStateDto }>;
  seek?: (positionMs: number) => Promise<{ player: PlayerStateDto }>;
  removeQueueItem?: (index: number) => Promise<{ player: PlayerStateDto }>;
  reorderQueue?: (fromIndex: number, toIndex: number) => Promise<{ player: PlayerStateDto }>;
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
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [seekPreviewMs, setSeekPreviewMs] = useState<number | null>(null);
  const locked = disabled || busy || pending;
  const livePositionMs = useLivePosition(state);
  const totalMs = durationMs(state);
  const displayPositionMs = seekPreviewMs ?? livePositionMs;
  const percent = totalMs > 0 ? Math.min(100, Math.max(0, (displayPositionMs / totalMs) * 100)) : 0;

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

  function seekFromInput(value: number) {
    if (!controller.seek || locked || !state?.nowPlaying || totalMs <= 0) {
      return;
    }
    const positionMs = Math.round((value / 100) * totalMs);
    setSeekPreviewMs(positionMs);
    void runAction(async () => {
      const result = await controller.seek!(positionMs);
      setSeekPreviewMs(null);
      return result;
    });
  }

  function removeQueueItem(index: number) {
    if (!controller.removeQueueItem || locked) return;
    void runAction(() => controller.removeQueueItem!(index));
  }

  function reorderQueue(fromIndex: number, toIndex: number) {
    if (!controller.reorderQueue || locked || fromIndex === toIndex) return;
    void runAction(() => controller.reorderQueue!(fromIndex, toIndex));
  }

  const queueItems = useMemo(() => state?.queue ?? [], [state?.queue]);

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
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.1}
                  value={percent}
                  disabled={locked || !controller.seek || totalMs <= 0}
                  className="mt-2 w-full accent-emerald-400"
                  onChange={(event) => {
                    if (totalMs <= 0) return;
                    setSeekPreviewMs(Math.round((Number(event.target.value) / 100) * totalMs));
                  }}
                  onMouseUp={(event) => seekFromInput(Number((event.target as HTMLInputElement).value))}
                  onTouchEnd={(event) => seekFromInput(Number((event.target as HTMLInputElement).value))}
                />
                <p className="mt-1 text-xs text-slate-500">
                  {formatMs(displayPositionMs)}
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
          <p className="mt-1 text-xs text-slate-500">Drag to reorder. Remove items you no longer want.</p>
          <div className="scroll-thin mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
            {queueItems.length ? (
              queueItems.map((track, index) => (
                <div
                  key={`${track.url}-${index}`}
                  draggable={!locked && Boolean(controller.reorderQueue)}
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => {
                    event.preventDefault();
                  }}
                  onDrop={() => {
                    if (dragIndex === null) return;
                    reorderQueue(dragIndex, index);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={`flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 ${dragIndex === index ? "opacity-60" : ""}`}
                >
                  <span className="cursor-grab text-xs text-slate-500">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{track.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{track.artistName ?? "Unknown artist"}</p>
                  </div>
                  {controller.removeQueueItem ? (
                    <button
                      className="btn-secondary px-2 py-1 text-xs"
                      disabled={locked}
                      onClick={() => removeQueueItem(index)}
                    >
                      Remove
                    </button>
                  ) : null}
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
