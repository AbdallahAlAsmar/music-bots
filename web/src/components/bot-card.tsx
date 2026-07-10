"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { BotDto } from "@/lib/types";
import { effectiveBotStatus, StatusBadge } from "@/components/status-badge";
import { Equalizer } from "@/components/motion-primitives";
import { AlertIcon, ArrowRightIcon, BotIcon, MicIcon } from "@/components/icons";

type BotCardProps = {
  bot: BotDto;
};

export function BotCard({ bot }: BotCardProps) {
  const needsSetup = !bot.voice_channel_id;
  const status = effectiveBotStatus(bot);

  return (
    <motion.div whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 300, damping: 22 }} className="h-full">
      <Link
        href={`/dashboard/bots/${bot.id}`}
        scroll={false}
        prefetch
        className="card group block h-full cursor-pointer p-5 transition-colors duration-200 hover:border-emerald-500/40"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-emerald-500/10 ring-1 ring-white/10">
              {bot.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bot.avatar} alt={`${bot.display_name} avatar`} className="h-full w-full object-cover" />
              ) : (
                <BotIcon className="h-6 w-6 text-emerald-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h3 className="truncate text-lg font-semibold text-white transition-colors duration-200 group-hover:text-emerald-300">
                  {bot.display_name}
                </h3>
                {status.healthy ? <Equalizer className="h-3.5 shrink-0" /> : null}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">Runtime: {bot.runtime_state ?? "unknown"}</p>
            </div>
          </div>
          <StatusBadge label={status.label} tone={status.tone} pulse={status.pulse} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          {needsSetup ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-300">
              <AlertIcon className="h-3.5 w-3.5" />
              Finish setup
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-slate-400">
              <MicIcon className="h-3.5 w-3.5" />
              Voice assigned
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition-all duration-200 group-hover:gap-2 group-hover:text-emerald-300">
            Manage
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
