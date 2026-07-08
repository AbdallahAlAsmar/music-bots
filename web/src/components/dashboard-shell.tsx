"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearSession, getStoredUser } from "@/lib/auth";

type DashboardShellProps = {
  title: string;
  children: React.ReactNode;
};

export function DashboardShell({ title, children }: DashboardShellProps) {
  const router = useRouter();
  const user = getStoredUser();

  return (
    <div className="min-h-screen bg-[#0b0d12] text-zinc-100">
      <header className="border-b border-white/10 bg-[#10131a]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-white">
              Bot Control
            </Link>
            <span className="hidden text-sm text-zinc-400 sm:inline">{title}</span>
          </div>
          <div className="flex items-center gap-4">
            {user ? <span className="text-sm text-zinc-400">{user.username}</span> : null}
            <button
              type="button"
              onClick={() => {
                clearSession();
                router.push("/");
              }}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-white/20 hover:bg-white/5"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
