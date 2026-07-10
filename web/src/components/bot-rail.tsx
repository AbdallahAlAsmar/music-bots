"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { BotDto } from "@/lib/types";
import { useBots } from "@/components/bots-context";
import { BotAvatar } from "@/components/bot-avatar";
import { BulkSelectionBar, BulkSelectionHint } from "@/components/bulk-selection-bar";
import { effectiveBotStatus } from "@/components/status-badge";
import { LayoutGridIcon } from "@/components/icons";

const dotColor: Record<string, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-rose-400",
  blue: "bg-sky-400",
  gray: "bg-slate-600"
};

export function BotRail({ activeBotId }: { activeBotId: string }) {
  const router = useRouter();
  const mountedRef = useRef(false);
  const { bots, selectionMode, isSelected, toggleSelected } = useBots();

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  if (bots.length === 0) {
    return null;
  }

  return (
    <motion.aside
      aria-label="Bot switcher"
      className="w-full shrink-0 lg:w-[13.5rem]"
      initial={mountedRef.current ? false : { opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      <div className="card flex flex-col gap-4 p-3 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)]">
        <div className="space-y-3 border-b border-white/10 pb-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your bots</p>
              <p className="text-sm font-medium text-white">{bots.length} total</p>
            </div>
            <Link
              href="/dashboard"
              scroll={false}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition-colors hover:border-emerald-500/40 hover:text-emerald-300 lg:hidden"
              aria-label="All bots"
            >
              <LayoutGridIcon className="h-4 w-4" />
            </Link>
          </div>
          <BulkSelectionBar compact className="px-0.5" />
        </div>

        <nav className="scroll-thin flex gap-3 overflow-x-auto pb-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pb-0 lg:pr-0.5">
          <RailItem href="/dashboard" label="All bots" active={false} className="hidden lg:flex">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] text-slate-400 transition-colors group-hover:border-emerald-500/40 group-hover:text-emerald-300">
              <LayoutGridIcon className="h-5 w-5" />
            </span>
            <span className="mt-2 hidden text-center text-[11px] font-medium text-slate-500 lg:block">All bots</span>
          </RailItem>

          {bots.map((bot) => {
            const status = effectiveBotStatus(bot);
            const active = bot.id === activeBotId;
            const selected = isSelected(bot.id);

            return (
              <RailBotItem
                key={bot.id}
                bot={bot}
                active={active}
                selected={selected}
                selectionMode={selectionMode}
                statusTone={status.tone}
                onToggleSelect={() => toggleSelected(bot.id)}
                onPrefetch={() => router.prefetch(`/dashboard/bots/${bot.id}`)}
              />
            );
          })}
        </nav>
      </div>
    </motion.aside>
  );
}

function RailBotItem({
  bot,
  active,
  selected,
  selectionMode,
  statusTone,
  onToggleSelect,
  onPrefetch
}: {
  bot: BotDto;
  active: boolean;
  selected: boolean;
  selectionMode: boolean;
  statusTone: string;
  onToggleSelect: () => void;
  onPrefetch: () => void;
}) {
  const shortName = bot.display_name.length > 12 ? `${bot.display_name.slice(0, 11)}…` : bot.display_name;

  const avatarShell = (
    <span
      className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden ring-2 transition-all duration-200 ${
        selected ? "ring-emerald-400" : active ? "ring-emerald-400" : "ring-white/10 group-hover:ring-emerald-500/40"
      }`}
    >
      <BotAvatar bot={bot} size="rail" className="h-full w-full rounded-2xl" />
      <BulkSelectionHint selected={selectionMode && selected} />
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-950 ${dotColor[statusTone] ?? dotColor.gray}`}
        aria-hidden
      />
    </span>
  );

  if (selectionMode) {
    return (
      <motion.button
        type="button"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={onToggleSelect}
        onMouseEnter={onPrefetch}
        aria-pressed={selected}
        className="group flex shrink-0 flex-col items-center gap-2 lg:w-full"
      >
        {avatarShell}
        <span className={`max-w-[4.5rem] truncate text-center text-[11px] font-medium lg:max-w-none ${selected ? "text-emerald-300" : "text-slate-500"}`}>
          {shortName}
        </span>
      </motion.button>
    );
  }

  return (
    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="group relative shrink-0 lg:w-full">
      <Link
        href={`/dashboard/bots/${bot.id}`}
        scroll={false}
        prefetch
        onMouseEnter={onPrefetch}
        aria-current={active ? "page" : undefined}
        className="flex flex-col items-center gap-2 lg:w-full"
      >
        {avatarShell}
        <span className={`max-w-[4.5rem] truncate text-center text-[11px] font-medium lg:max-w-none ${active ? "text-emerald-300" : "text-slate-500 group-hover:text-slate-300"}`}>
          {shortName}
        </span>
        {active ? (
          <motion.span
            layoutId="bot-rail-active"
            className="absolute -left-1 top-7 hidden h-8 w-1 rounded-full bg-emerald-400 lg:block"
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
          />
        ) : null}
      </Link>
    </motion.div>
  );
}

function RailItem({
  href,
  label,
  active,
  children,
  className = ""
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className={`group relative shrink-0 flex-col items-center ${className}`}>
      <Link
        href={href}
        scroll={false}
        aria-current={active ? "page" : undefined}
        className="flex flex-col items-center gap-2"
      >
        {children}
      </Link>
    </motion.div>
  );
}
