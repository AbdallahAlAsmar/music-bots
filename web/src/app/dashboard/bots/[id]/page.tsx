"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchBot } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import type { BotDto, SubscriptionDto } from "@/lib/types";
import { BotEditor } from "@/components/bot-editor";
import { useBots } from "@/components/bots-context";
import { AlertIcon } from "@/components/icons";
import { useLiveData } from "@/hooks/use-live-data";

export default function BotDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { refreshBots } = useBots();
  const [bot, setBot] = useState<BotDto | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionDto | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeIdRef = useRef(params.id);

  const loadBot = useCallback(
    async (silent = false) => {
      if (!getStoredToken()) {
        router.replace("/");
        return;
      }

      const requestId = params.id;
      if (!silent) {
        setSwitching(true);
      }

      try {
        const result = await fetchBot(requestId);
        if (activeIdRef.current !== requestId) {
          return;
        }
        setBot(result.bot);
        setSubscription(result.subscription);
        setError(null);
      } catch (err) {
        if (activeIdRef.current !== requestId) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load bot");
      } finally {
        if (activeIdRef.current === requestId) {
          setInitialLoad(false);
          setSwitching(false);
        }
      }
    },
    [params.id, router]
  );

  useEffect(() => {
    activeIdRef.current = params.id;
    void loadBot();
  }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps -- reload on id change only

  useLiveData(async () => {
    await loadBot(true);
  }, 10_000);

  if (initialLoad && !bot) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading bot">
        <div className="card animate-pulse p-6">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-2xl bg-white/5" />
            <div className="space-y-2.5">
              <div className="h-5 w-48 rounded bg-white/5" />
              <div className="h-4 w-32 rounded bg-white/5" />
            </div>
          </div>
        </div>
        <div className="card h-48 animate-pulse" />
      </div>
    );
  }

  if (error && !bot) {
    return (
      <div className="card flex items-start gap-3 border-rose-500/30 bg-rose-500/5 p-5">
        <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
        <div>
          <p className="font-medium text-rose-300">Could not load this bot</p>
          <p className="mt-1 text-sm text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!bot) {
    return null;
  }

  return (
    <div className="relative">
      {switching ? (
        <div
          className="pointer-events-none absolute right-0 top-0 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/90 px-3 py-1 text-xs text-slate-300 backdrop-blur"
          aria-live="polite"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Switching…
        </div>
      ) : null}
      <BotEditor
        botId={params.id}
        initialBot={bot}
        initialSubscription={subscription}
        isRefreshing={switching || bot.id !== params.id}
        onBotUpdated={() => {
          void refreshBots();
        }}
      />
    </div>
  );
}
