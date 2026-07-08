"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchBot } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import type { BotDto, SubscriptionDto } from "@/lib/types";
import { BotEditor } from "@/components/bot-editor";
import { DashboardShell } from "@/components/dashboard-shell";

export default function BotDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [bot, setBot] = useState<BotDto | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/");
      return;
    }

    void fetchBot(params.id)
      .then((result) => {
        setBot(result.bot);
        setSubscription(result.subscription);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.id, router]);

  return (
    <DashboardShell title="Bot settings">
      <Link href="/dashboard" className="mb-6 inline-flex text-sm text-indigo-300 hover:text-indigo-200">
        ← Back to bots
      </Link>
      {loading ? <p className="text-zinc-400">Loading bot...</p> : null}
      {error ? <p className="text-rose-300">{error}</p> : null}
      {bot ? <BotEditor initialBot={bot} initialSubscription={subscription} /> : null}
    </DashboardShell>
  );
}
