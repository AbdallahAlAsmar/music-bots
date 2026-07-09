"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchAdminHealth } from "@/lib/api";
import { clearSession, getStoredUser } from "@/lib/auth";
import { useLocale } from "@/components/locale-provider";
import type { AuthUser } from "@/lib/types";
import { LayoutGridIcon, LogOutIcon, MusicIcon, ShieldIcon } from "@/components/icons";

type DashboardShellProps = {
  title: string;
  children: React.ReactNode;
};

export function DashboardShell({ title, children }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const { locale, setLocale, tr } = useLocale();

  useEffect(() => {
    setUser(getStoredUser());
    void fetchAdminHealth()
      .then(() => setIsAdmin(true))
      .catch(() => setIsAdmin(false));
  }, []);

  const onDashboard = pathname === "/dashboard";
  const onAdmin = pathname.startsWith("/admin");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex cursor-pointer items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <MusicIcon className="h-4.5 w-4.5" />
              </span>
              <span className="font-bold tracking-tight text-white">PXVault</span>
            </Link>
            <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
              <Link
                href="/dashboard"
                className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                  onDashboard
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
                aria-current={onDashboard ? "page" : undefined}
              >
                <LayoutGridIcon className="h-4 w-4" />
                {tr("myBots")}
              </Link>
              {isAdmin ? (
                <Link
                  href="/admin"
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                    onAdmin ? "bg-emerald-500/10 text-emerald-300" : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                  aria-current={onAdmin ? "page" : undefined}
                >
                  <ShieldIcon className="h-4 w-4" />
                  {tr("admin")}
                </Link>
              ) : null}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <select
              className="field hidden h-9 min-w-[92px] px-2 py-1 text-xs sm:block"
              value={locale}
              aria-label={tr("language")}
              onChange={(event) => setLocale(event.target.value as "en" | "ar")}
            >
              <option value="en">EN</option>
              <option value="ar">AR</option>
            </select>
            {user ? (
              <span className="hidden rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 sm:inline-flex">
                {user.username}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                clearSession();
                router.push("/");
              }}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition-colors duration-200 hover:border-white/20 hover:bg-white/5 hover:text-white"
            >
              <LogOutIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{tr("signOut")}</span>
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="sr-only">{title}</h1>
        {children}
      </main>
    </div>
  );
}
