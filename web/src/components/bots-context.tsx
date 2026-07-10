"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchBots } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import type { BotDto } from "@/lib/types";
import { useLiveData } from "@/hooks/use-live-data";

type BotsContextValue = {
  bots: BotDto[];
  loading: boolean;
  refreshBots: () => Promise<void>;
  selectionMode: boolean;
  setSelectionMode: (enabled: boolean) => void;
  selectedIds: Set<string>;
  selectedBots: BotDto[];
  toggleSelected: (botId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  isSelected: (botId: string) => boolean;
};

const BotsContext = createContext<BotsContextValue | null>(null);

export function BotsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [bots, setBots] = useState<BotDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectionMode, setSelectionModeState] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadBots = useCallback(
    async (silent = false) => {
      if (!getStoredToken()) {
        router.replace("/");
        return;
      }
      if (!silent) {
        setLoading(true);
      }
      try {
        const result = await fetchBots();
        setBots(result.bots);
      } catch {
        if (!silent) {
          setBots([]);
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [router]
  );

  useEffect(() => {
    void loadBots();
  }, [loadBots]);

  useLiveData(async () => {
    await loadBots(true);
  }, 10_000);

  const setSelectionMode = useCallback((enabled: boolean) => {
    setSelectionModeState(enabled);
    if (!enabled) {
      setSelectedIds(new Set());
    }
  }, []);

  const toggleSelected = useCallback((botId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(botId)) {
        next.delete(botId);
      } else {
        next.add(botId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(bots.map((bot) => bot.id)));
  }, [bots]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((botId: string) => selectedIds.has(botId), [selectedIds]);

  const selectedBots = useMemo(
    () => bots.filter((bot) => selectedIds.has(bot.id)),
    [bots, selectedIds]
  );

  const value = useMemo(
    () => ({
      bots,
      loading,
      refreshBots: () => loadBots(true),
      selectionMode,
      setSelectionMode,
      selectedIds,
      selectedBots,
      toggleSelected,
      selectAll,
      clearSelection,
      isSelected
    }),
    [
      bots,
      loading,
      loadBots,
      selectionMode,
      setSelectionMode,
      selectedIds,
      selectedBots,
      toggleSelected,
      selectAll,
      clearSelection,
      isSelected
    ]
  );

  return <BotsContext.Provider value={value}>{children}</BotsContext.Provider>;
}

export function useBots() {
  const ctx = useContext(BotsContext);
  if (!ctx) {
    throw new Error("useBots must be used within BotsProvider");
  }
  return ctx;
}
