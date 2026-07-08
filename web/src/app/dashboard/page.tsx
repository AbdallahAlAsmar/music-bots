"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchBots } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import type { BotDto } from "@/lib/types";
import { BotCard } from "@/components/bot-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { AnimatedNumber, Stagger, StaggerItem } from "@/components/motion-primitives";
import { ActivityIcon, AlertIcon, BotIcon, SearchIcon, ZapIcon } from "@/components/icons";

type Filter = "all" | "active" | "needs-setup";

export default function DashboardPage() {
  const router = useRouter();
  const [bots, setBots] = useState<BotDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

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

  const stats = useMemo(() => {
    const active = bots.filter((bot) => bot.status === "active").length;
    const needsSetup = bots.filter((bot) => !bot.voice_channel_id).length;
    return { total: bots.length, active, needsSetup };
  }, [bots]);

  const visibleBots = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bots.filter((bot) => {
      if (filter === "active" && bot.status !== "active") return false;
      if (filter === "needs-setup" && bot.voice_channel_id) return false;
      if (q && !bot.display_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [bots, query, filter]);

  return (
    <DashboardShell title="My bots">
      {/* Page heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">My Bots</h2>
          <p className="mt-1 text-sm text-slate-400">Everything you own or help manage, in one place.</p>
        </div>
      </div>

      {/* Stats */}
      {!loading && !error && bots.length > 0 ? (
        <Stagger inView={false} gap={0.1} className="mt-6 grid gap-4 sm:grid-cols-3">
          <StaggerItem>
            <StatCard icon={BotIcon} label="Total bots" value={stats.total} />
          </StaggerItem>
          <StaggerItem>
            <StatCard icon={ZapIcon} label="Active now" value={stats.active} accent />
          </StaggerItem>
          <StaggerItem>
            <StatCard icon={AlertIcon} label="Need setup" value={stats.needsSetup} warn={stats.needsSetup > 0} />
          </StaggerItem>
        </Stagger>
      ) : null}

      {/* Search + filters */}
      {!loading && bots.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              className="field pl-10"
              placeholder="Search bots..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search bots"
            />
          </div>
          <div className="flex gap-2" role="group" aria-label="Filter bots">
            {(
              [
                ["all", "All"],
                ["active", "Active"],
                ["needs-setup", "Needs setup"]
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`cursor-pointer rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-200 ${
                  filter === value
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
                aria-pressed={filter === value}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Loading skeleton */}
      {loading ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Loading bots">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse p-5">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-white/5" />
                <div className="flex-1 space-y-2.5">
                  <div className="h-4 w-1/3 rounded bg-white/5" />
                  <div className="h-3 w-1/4 rounded bg-white/5" />
                </div>
              </div>
              <div className="mt-4 h-8 rounded-lg bg-white/5" />
            </div>
          ))}
        </div>
      ) : null}

      {/* Error */}
      {error ? (
        <div className="card mt-6 flex items-start gap-3 border-rose-500/30 bg-rose-500/5 p-5">
          <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
          <div>
            <p className="font-medium text-rose-300">Could not load your bots</p>
            <p className="mt-1 text-sm text-slate-400">{error}</p>
          </div>
        </div>
      ) : null}

      {/* Empty state — no bots at all */}
      {!loading && !error && bots.length === 0 ? (
        <div className="card mt-6 border-dashed px-6 py-16 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
            <BotIcon className="h-7 w-7 text-emerald-400" />
          </span>
          <h3 className="mt-5 text-xl font-semibold text-white">No bots yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-400">
            You don&apos;t have any bots assigned to your Discord account. Ask a platform admin to add one for you
            using the <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">/addbot</code> command, then refresh
            this page.
          </p>
        </div>
      ) : null}

      {/* Empty state — filter/search returned nothing */}
      {!loading && !error && bots.length > 0 && visibleBots.length === 0 ? (
        <div className="card mt-6 border-dashed px-6 py-12 text-center">
          <ActivityIcon className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-4 font-medium text-white">No bots match</p>
          <p className="mt-1 text-sm text-slate-400">Try a different search or filter.</p>
          <button
            type="button"
            className="btn-secondary mt-4"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : null}

      {/* Bot grid */}
      {!loading && visibleBots.length > 0 ? (
        <Stagger inView={false} gap={0.07} delay={0.15} className="mt-6 grid gap-4 md:grid-cols-2">
          {visibleBots.map((bot) => (
            <StaggerItem key={bot.id} className="h-full">
              <BotCard bot={bot} />
            </StaggerItem>
          ))}
        </Stagger>
      ) : null}
    </DashboardShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent = false,
  warn = false
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-xl ${
          warn ? "bg-amber-500/10 text-amber-400" : accent ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-slate-400"
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-2xl font-bold text-white">
          <AnimatedNumber value={value} />
        </p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}
