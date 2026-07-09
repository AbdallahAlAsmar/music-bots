"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchBot } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import type { BotDto, SubscriptionDto } from "@/lib/types";
import { BotEditor } from "@/components/bot-editor";
import { BotRail } from "@/components/bot-rail";
import { DashboardShell } from "@/components/dashboard-shell";
import { AlertIcon, ArrowLeftIcon } from "@/components/icons";
import { useLiveData } from "@/hooks/use-live-data";

export default function BotDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [bot, setBot] = useState<BotDto | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBot = useCallback(
    async (silent = false) => {
      if (!getStoredToken()) {
        router.replace("/");
        return;
      }
      if (!silent) {
        setLoading(true);
      }
      try {
        const result = await fetchBot(params.id);
        setBot(result.bot);
        setSubscription(result.subscription);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load bot");
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [params.id, router]
  );

  useEffect(() => {
    setBot(null);
    void loadBot();
  }, [loadBot]);

  useLiveData(async () => {
    await loadBot(true);
  }, 10_000);

  return (
    <DashboardShell title="Bot settings">
      <Link
        href="/dashboard"
        className="mb-5 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors duration-200 hover:text-emerald-300"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to my bots
      </Link>

      <div className="flex flex-col gap-5 lg:flex-row lg:gap-7">
        <BotRail activeBotId={params.id} />

        <div className="min-w-0 flex-1">
          {loading ? (
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
          ) : null}

          {error ? (
            <div className="card flex items-start gap-3 border-rose-500/30 bg-rose-500/5 p-5">
              <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
              <div>
                <p className="font-medium text-rose-300">Could not load this bot</p>
                <p className="mt-1 text-sm text-slate-400">{error}</p>
              </div>
            </div>
          ) : null}

          {bot ? <BotEditor key={bot.id} initialBot={bot} initialSubscription={subscription} /> : null}
        </div>
      </div>
    </DashboardShell>
  );
}
