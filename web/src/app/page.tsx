"use client";

import { useRouter } from "next/navigation";
import { getDiscordAuthUrl } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();

  function handleLogin() {
    try {
      window.location.href = getDiscordAuthUrl();
    } catch {
      router.push("/?error=oauth");
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0d12] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_45%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
        <p className="text-sm uppercase tracking-[0.3em] text-indigo-300">Discord Music Bots</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-tight">
          Manage your bots from one clean dashboard.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-zinc-400">
          Sign in with Discord to view owned bots, update profile and presence, assign voice channels, and control
          runtime without digging through slash commands.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <button type="button" onClick={handleLogin} className="btn-primary px-6 py-3 text-base">
            Login with Discord
          </button>
        </div>
      </div>
    </div>
  );
}
