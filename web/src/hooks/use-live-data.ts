"use client";

import { useEffect, useRef } from "react";

/**
 * Poll callback on an interval while tab is visible.
 * Runs once immediately, then repeats.
 */
export function useLiveData(callback: () => Promise<void> | void, intervalMs: number): void {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    let timer: number | null = null;
    let stopped = false;

    const tick = async () => {
      if (stopped || document.hidden) return;
      await callbackRef.current();
    };

    void tick();
    timer = window.setInterval(() => {
      void tick();
    }, intervalMs);

    const onVisibility = () => {
      if (!document.hidden) {
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      if (timer !== null) {
        window.clearInterval(timer);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}
