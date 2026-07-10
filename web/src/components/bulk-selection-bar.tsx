"use client";

import { AnimatePresence, motion } from "motion/react";
import { useBots } from "@/components/bots-context";
import { CheckIcon, UsersIcon } from "@/components/icons";

type BulkSelectTriggerProps = {
  className?: string;
  compact?: boolean;
};

/** Entry point — only visible when not already selecting. */
export function BulkSelectTrigger({ className = "", compact = false }: BulkSelectTriggerProps) {
  const { bots, selectionMode, setSelectionMode } = useBots();

  if (bots.length === 0 || selectionMode) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => setSelectionMode(true)}
      className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-slate-300 transition-colors duration-200 hover:bg-white/10 hover:text-white ${className}`}
    >
      <UsersIcon className="h-4 w-4" />
      {compact ? "Select" : "Select bots"}
    </button>
  );
}

/** Floating action dock — same pattern as the editor save bar. */
export function BulkSelectionDock() {
  const { bots, selectionMode, setSelectionMode, selectedIds, selectAll, clearSelection, setBulkPanelOpen } = useBots();

  const count = selectedIds.size;
  const total = bots.length;

  return (
    <AnimatePresence>
      {selectionMode && bots.length > 0 ? (
        <motion.div
          className="fixed inset-x-4 bottom-4 z-50"
          initial={{ opacity: 0, y: 72 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 72 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          role="region"
          aria-label="Bulk bot selection"
        >
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/95 px-5 py-3.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">
                {count > 0 ? `${count} bot${count === 1 ? "" : "s"} selected` : "Select bots to configure"}
              </p>
              <p className="text-xs text-slate-500">
                {count > 0 ? `of ${total} total` : "Tap cards or avatars in the rail"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-secondary px-3 py-2 text-sm"
                onClick={selectAll}
                disabled={count === total}
              >
                Select all
              </button>
              <button
                type="button"
                className="btn-secondary px-4 py-2"
                onClick={() => {
                  clearSelection();
                  setSelectionMode(false);
                }}
              >
                Discard
              </button>
              <button
                type="button"
                className="btn-primary px-4 py-2"
                disabled={count === 0}
                onClick={() => setBulkPanelOpen(true)}
              >
                {count > 0 ? `Configure ${count} bot${count === 1 ? "" : "s"}` : "Configure"}
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
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
