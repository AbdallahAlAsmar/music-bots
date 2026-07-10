"use client";

import { AnimatePresence, motion } from "motion/react";
import { useBots } from "@/components/bots-context";
import { CheckIcon, SettingsIcon, UsersIcon, XIcon } from "@/components/icons";

type BulkSelectionBarProps = {
  className?: string;
  compact?: boolean;
};

export function BulkSelectionBar({ className = "", compact = false }: BulkSelectionBarProps) {
  const {
    bots,
    selectionMode,
    setSelectionMode,
    selectedIds,
    selectAll,
    clearSelection,
    setBulkPanelOpen
  } = useBots();

  if (bots.length === 0) {
    return null;
  }

  const count = selectedIds.size;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => setSelectionMode(!selectionMode)}
        className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors duration-200 ${
          selectionMode
            ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
            : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
        }`}
      >
        <UsersIcon className="h-4 w-4" />
        {selectionMode ? "Done selecting" : compact ? "Select" : "Select bots"}
      </button>

      <AnimatePresence>
        {selectionMode ? (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className="flex flex-wrap items-center gap-2"
          >
            <button
              type="button"
              onClick={selectAll}
              className="rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              Select all
            </button>
            {count > 0 ? (
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                <XIcon className="h-3.5 w-3.5" />
                Clear ({count})
              </button>
            ) : null}
            {count > 0 ? (
              <button
                type="button"
                onClick={() => setBulkPanelOpen(true)}
                className="btn-primary px-4 py-2 text-sm"
              >
                <SettingsIcon className="h-4 w-4" />
                Configure {count} bot{count === 1 ? "" : "s"}
              </button>
            ) : (
              <span className="text-xs text-slate-500">Tap bots to select them</span>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function BulkSelectionHint({ selected }: { selected: boolean }) {
  if (!selected) return null;
  return (
    <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-emerald-500/40 ring-2 ring-emerald-400">
      <CheckIcon className="h-5 w-5 text-white drop-shadow" />
    </span>
  );
}
