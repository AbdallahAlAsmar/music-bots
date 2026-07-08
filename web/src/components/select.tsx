"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

export type SelectOption = {
  value: string;
  label: string;
  /** Small element rendered before the label, e.g. an icon or avatar */
  icon?: React.ReactNode;
  hint?: string;
};

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Icon shown inside the trigger button */
  leadingIcon?: React.ReactNode;
  disabled?: boolean;
  /** Show a filter input. Defaults to true when there are more than 8 options. */
  searchable?: boolean;
  ariaLabel?: string;
};

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select...",
  leadingIcon,
  disabled = false,
  searchable,
  ariaLabel
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const showSearch = searchable ?? options.length > 8;
  const selected = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return options;
    }
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery("");
    setActiveIndex(options.findIndex((option) => option.value === value));
    if (showSearch) {
      // Wait for the panel to mount before focusing
      requestAnimationFrame(() => searchRef.current?.focus());
    }

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) {
      return;
    }
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function commit(option: SelectOption) {
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[activeIndex];
      if (option) {
        commit(option);
      }
    }
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
        className={`field flex items-center gap-2.5 text-left ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      >
        {leadingIcon ? <span className="shrink-0 text-slate-500">{leadingIcon}</span> : null}
        {selected?.icon ? <span className="shrink-0">{selected.icon}</span> : null}
        <span className={`min-w-0 flex-1 truncate ${selected ? "text-slate-100" : "text-slate-500"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <motion.svg
          className="h-4 w-4 shrink-0 text-slate-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <path d="m6 9 6 6 6-6" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/60"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {showSearch ? (
              <div className="border-b border-white/10 p-2">
                <input
                  ref={searchRef}
                  className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition-colors duration-200 placeholder:text-slate-500 focus:border-emerald-400/60"
                  placeholder="Search..."
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                />
              </div>
            ) : null}

            <div ref={listRef} role="listbox" className="scroll-thin max-h-64 overflow-y-auto p-1.5">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">No matches</p>
              ) : (
                filtered.map((option, index) => {
                  const isSelected = option.value === value;
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-index={index}
                      onClick={() => commit(option)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-100 ${
                        isSelected
                          ? "bg-emerald-500/10 text-emerald-300"
                          : isActive
                            ? "bg-white/5 text-white"
                            : "text-slate-300"
                      }`}
                    >
                      {option.icon ? <span className="shrink-0">{option.icon}</span> : null}
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.hint ? <span className="shrink-0 text-xs text-slate-500">{option.hint}</span> : null}
                      {isSelected ? (
                        <svg
                          className="h-4 w-4 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
