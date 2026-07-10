"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { BotDto } from "@/lib/types";
import { useBots } from "@/components/bots-context";
import { effectiveBotStatus } from "@/components/status-badge";
import { BotIcon, CheckIcon, LayoutGridIcon, UsersIcon } from "@/components/icons";

const dotColor: Record<string, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-rose-400",
  blue: "bg-sky-400",
  gray: "bg-slate-600"
};

/**
 * Quick bot switcher — persists across bot changes via the shared layout.
 */
export function BotRail({ activeBotId }: { activeBotId: string }) {
  const router = useRouter();
  const railRef = useRef<HTMLElement>(null);
  const mountedRef = useRef(false);
  const {
    bots,
    selectionMode,
    setSelectionMode,
    selectedIds,
    toggleSelected,
    selectAll,
    clearSelection,
    isSelected
  } = useBots();

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  if (bots.length < 2) {
    return null;
  }

  return (
    <motion.nav
      ref={railRef}
      aria-label="Switch bot"
      className="scroll-thin flex shrink-0 flex-col gap-2 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:overflow-x-visible lg:pr-1"
      initial={mountedRef.current ? false : { opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-x-visible lg:pb-0">
        <RailItem href="/dashboard" label="All bots" active={false} scroll={false}>
          <span className="flex h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-400 transition-colors duration-200 group-hover:border-emerald-500/40 group-hover:text-emerald-300">
            <LayoutGridIcon className="h-5 w-5" />
          </span>
        </RailItem>

        <div className="mx-1 my-auto h-8 w-px shrink-0 bg-white/10 lg:mx-auto lg:my-1 lg:h-px lg:w-8" aria-hidden />

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
      </div>

      <div className="mt-1 flex flex-wrap gap-2 lg:flex-col">
        <button
          type="button"
          onClick={() => setSelectionMode(!selectionMode)}
          className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors duration-200 ${
            selectionMode
              ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
              : "border border-white/10 bg-white/5 text-slate-400 hover:text-white"
          }`}
        >
          <UsersIcon className="h-3.5 w-3.5" />
          {selectionMode ? "Done selecting" : "Select bots"}
        </button>
        {selectionMode ? (
          <>
            <button
              type="button"
              onClick={selectAll}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              Select all
            </button>
            {selectedIds.size > 0 ? (
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                Clear ({selectedIds.size})
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </motion.nav>
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
  if (selectionMode) {
    return (
      <motion.button
        type="button"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={onToggleSelect}
        onMouseEnter={onPrefetch}
        aria-pressed={selected}
        className="group relative block h-12 w-12 shrink-0 cursor-pointer"
      >
        <span
          className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-800 ring-2 transition-all duration-200 ${
            selected ? "ring-emerald-400" : "ring-white/10 group-hover:ring-emerald-500/40"
          }`}
        >
          {bot.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bot.avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <BotIcon className="h-5 w-5 text-emerald-400" />
          )}
          {selected ? (
            <span className="absolute inset-0 flex items-center justify-center bg-emerald-500/35">
              <CheckIcon className="h-5 w-5 text-white" />
            </span>
          ) : null}
        </span>
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-950 ${dotColor[statusTone] ?? dotColor.gray}`}
          aria-hidden
        />
      </motion.button>
    );
  }

  return (
    <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.95 }} className="relative shrink-0">
      <Link
        href={`/dashboard/bots/${bot.id}`}
        scroll={false}
        prefetch
        onMouseEnter={onPrefetch}
        aria-current={active ? "page" : undefined}
        className="group relative block h-12 w-12 cursor-pointer"
      >
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
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-950 ${dotColor[statusTone] ?? dotColor.gray}`}
          aria-hidden
        />
        {active ? (
          <motion.span
            layoutId="bot-rail-active"
            className="absolute -left-2 top-1/2 hidden h-6 w-1 -translate-y-1/2 rounded-full bg-emerald-400 lg:block"
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
          />
        ) : null}
        <span className="pointer-events-none absolute left-full top-1/2 z-40 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl shadow-black/40 transition-opacity duration-150 group-hover:opacity-100 lg:block">
          {bot.display_name}
        </span>
      </Link>
    </motion.div>
  );
}

function RailItem({
  href,
  label,
  active,
  scroll,
  children
}: {
  href: string;
  label: string;
  active: boolean;
  scroll?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.95 }} className="relative shrink-0">
      <Link
        href={href}
        scroll={scroll}
        aria-current={active ? "page" : undefined}
        className="group relative block h-12 w-12 cursor-pointer"
      >
        {children}
        <span className="pointer-events-none absolute left-full top-1/2 z-40 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl shadow-black/40 transition-opacity duration-150 group-hover:opacity-100 lg:block">
          {label}
        </span>
      </Link>
    </motion.div>
  );
}
