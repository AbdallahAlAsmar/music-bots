"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { fetchBots } from "@/lib/api";
import type { BotDto } from "@/lib/types";
import { effectiveBotStatus } from "@/components/status-badge";
import { BotIcon, LayoutGridIcon } from "@/components/icons";

const dotColor: Record<string, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-rose-400",
  blue: "bg-sky-400",
  gray: "bg-slate-600"
};

/**
 * Quick bot switcher shown next to the bot editor — jump straight to another
 * bot without going back to the dashboard. Vertical rail on desktop,
 * horizontal strip on mobile.
 */
export function BotRail({ activeBotId }: { activeBotId: string }) {
  const [bots, setBots] = useState<BotDto[]>([]);

  useEffect(() => {
    void fetchBots()
      .then((result) => setBots(result.bots))
      .catch(() => setBots([]));
  }, []);

  if (bots.length < 2) {
    return null;
  }

  return (
    <motion.nav
      aria-label="Switch bot"
      className="scroll-thin flex shrink-0 gap-2 overflow-x-auto pb-2 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pb-0 lg:pr-1"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      <RailItem href="/dashboard" label="All bots" active={false}>
        <span className="flex h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-400 transition-colors duration-200 group-hover:border-emerald-500/40 group-hover:text-emerald-300">
          <LayoutGridIcon className="h-5 w-5" />
        </span>
      </RailItem>

      <div className="mx-1 my-auto h-8 w-px shrink-0 bg-white/10 lg:mx-auto lg:my-1 lg:h-px lg:w-8" aria-hidden />

      {bots.map((bot) => {
        const status = effectiveBotStatus(bot);
        const active = bot.id === activeBotId;
        return (
          <RailItem key={bot.id} href={`/dashboard/bots/${bot.id}`} label={bot.display_name} active={active}>
            <span
              className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-800 ring-2 transition-all duration-200 ${
                active ? "ring-emerald-400" : "ring-white/10 group-hover:ring-emerald-500/40"
              }`}
            >
              {bot.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bot.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <BotIcon className="h-5 w-5 text-emerald-400" />
              )}
            </span>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-950 ${dotColor[status.tone]}`}
              aria-hidden
            />
            {active ? (
              <motion.span
                layoutId="bot-rail-active"
                className="absolute -left-2 top-1/2 hidden h-6 w-1 -translate-y-1/2 rounded-full bg-emerald-400 lg:block"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            ) : null}
          </RailItem>
        );
      })}
    </motion.nav>
  );
}

function RailItem({
  href,
  label,
  active,
  children
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.95 }} className="relative shrink-0">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className="group relative block h-12 w-12 cursor-pointer"
      >
        {children}
        {/* Tooltip (desktop only) */}
        <span className="pointer-events-none absolute left-full top-1/2 z-40 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl shadow-black/40 transition-opacity duration-150 group-hover:opacity-100 lg:block">
          {label}
        </span>
      </Link>
    </motion.div>
  );
}
