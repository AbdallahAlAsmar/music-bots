"use client";

import { useMemo, useState } from "react";
import {
  fetchPlayerState,
  playerClear,
  playerPause,
  playerPlay,
  playerResume,
  playerSetVolume,
  playerSkip,
  playerStop
} from "@/lib/api";
import type { PlayerStateDto } from "@/lib/types";
import { useLiveData } from "@/hooks/use-live-data";
import { PlayerPanel, type PlayerController } from "@/components/player-panel";

export function NowPlaying({ botId }: { botId: string }) {
  const [state, setState] = useState<PlayerStateDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useLiveData(async () => {
    try {
      const result = await fetchPlayerState(botId);
      setState(result.player);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load player");
    }
  }, 5_000);

  const controller = useMemo<PlayerController>(
    () => ({
      play: (query) => playerPlay(botId, query),
      pause: () => playerPause(botId),
      resume: () => playerResume(botId),
      skip: () => playerSkip(botId),
      stop: () => playerStop(botId),
      clear: () => playerClear(botId),
      setVolume: (percent) => playerSetVolume(botId, percent)
    }),
    [botId]
  );

  return (
    <PlayerPanel
      state={state}
      error={error}
      controller={controller}
      onStateChange={setState}
      onError={setError}
    />
  );
}
