"use client";

import { useEffect } from "react";
import { ensureFreshSession } from "@/lib/api";
import { getStoredToken, isTokenExpiringSoon } from "@/lib/auth";

const REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
const ERROR_WEBHOOK_URL = process.env.NEXT_PUBLIC_ERROR_WEBHOOK_URL;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    async function maybeRefresh() {
      const token = getStoredToken();
      if (!token) return;
      if (isTokenExpiringSoon(token, REFRESH_WINDOW_MS)) {
        await ensureFreshSession();
      }
    }

    void maybeRefresh();
    const onVisibilityChange = () => {
      if (!document.hidden) {
        void maybeRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!ERROR_WEBHOOK_URL) {
      return;
    }

    const report = (message: string, stack?: string) => {
      void fetch(ERROR_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `Frontend error on ${window.location.href}\n${message}\n${stack ?? ""}`.slice(0, 1900)
        })
      }).catch(() => undefined);
    };

    const onError = (event: ErrorEvent) => {
      report(event.message, event.error?.stack);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      report(
        reason instanceof Error ? reason.message : String(reason ?? "Unhandled rejection"),
        reason instanceof Error ? reason.stack : undefined
      );
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return <>{children}</>;
}
