"use client";

import Link from "next/link";
import type { BotDto } from "@/lib/types";
import { botStatusTone, StatusBadge } from "@/components/status-badge";

type BotCardProps = {
  bot: BotDto;
};

export function BotCard({ bot }: BotCardProps) {
  return (
    <Link
      href={`/dashboard/bots/${bot.id}`}
      className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-indigo-400/40 hover:bg-white/[0.05]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-indigo-500/20 ring-1 ring-indigo-400/20">
            {bot.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bot.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-semibold text-indigo-200">{bot.display_name.slice(0, 1)}</span>
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white group-hover:text-indigo-200">{bot.display_name}</h3>
            <p className="text-sm text-zinc-400">Guild {bot.guild_id}</p>
          </div>
        </div>
        <StatusBadge label={bot.status} tone={botStatusTone(bot.status)} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-400">
        <span className="rounded-md bg-white/5 px-2 py-1">Runtime: {bot.runtime_state ?? "unknown"}</span>
        {bot.voice_channel_id ? (
          <span className="rounded-md bg-white/5 px-2 py-1">Voice: {bot.voice_channel_id}</span>
        ) : (
          <span className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-200">No voice channel</span>
        )}
      </div>
    </Link>
  );
}
