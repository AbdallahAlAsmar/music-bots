"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchBots } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import type { BotDto } from "@/lib/types";
import { BotCard } from "@/components/bot-card";
import { DashboardShell } from "@/components/dashboard-shell";

export default function DashboardPage() {
  const router = useRouter();
  const [bots, setBots] = useState<BotDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/");
      return;
    }

    void fetchBots()
      .then((result) => setBots(result.bots))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <DashboardShell title="Your bots">
      {loading ? <p className="text-zinc-400">Loading your bots...</p> : null}
      {error ? <p className="text-rose-300">{error}</p> : null}
      {!loading && !error && bots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
          <h2 className="text-xl font-semibold text-white">No bots yet</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Ask a platform admin to add a bot for you with Discord `/addbot`.
          </p>
        </div>
      ) : null}
      {!loading && bots.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {bots.map((bot) => (
            <BotCard key={bot.id} bot={bot} />
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
