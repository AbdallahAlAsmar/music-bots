"use client";

import { useRouter } from "next/navigation";
import { getDiscordAuthUrl, getStoredToken } from "@/lib/auth";
import {
  ActivityIcon,
  ArrowRightIcon,
  BotIcon,
  CheckCircleIcon,
  DiscordIcon,
  MicIcon,
  MusicIcon,
  SettingsIcon,
  ShieldIcon,
  UsersIcon,
  ZapIcon
} from "@/components/icons";

const features = [
  {
    icon: SettingsIcon,
    title: "No slash commands needed",
    description: "Change your bot's name, avatar, status, and language from clean forms instead of Discord modals."
  },
  {
    icon: MicIcon,
    title: "Voice channel picker",
    description: "Assign your bot's voice room from a live dropdown of your server's channels. No copying IDs."
  },
  {
    icon: ZapIcon,
    title: "Start & stop in one click",
    description: "Restart your bot instantly when you need it, or pause it when you don't."
  },
  {
    icon: UsersIcon,
    title: "Share access with your team",
    description: "Grant admin or viewer roles to other Discord users so they can help manage your bots."
  },
  {
    icon: ActivityIcon,
    title: "Live health monitoring",
    description: "See runtime state, last errors, and subscription time remaining at a glance."
  },
  {
    icon: ShieldIcon,
    title: "Secure by design",
    description: "Bot tokens stay encrypted on the server. You sign in with Discord OAuth — no passwords."
  }
];

const steps = [
  {
    number: "01",
    title: "Sign in with Discord",
    description: "One click. We only read your Discord ID to find bots you own or manage."
  },
  {
    number: "02",
    title: "Pick a bot",
    description: "All your bots appear on the dashboard with live status badges."
  },
  {
    number: "03",
    title: "Set up & go",
    description: "Follow the setup checklist: name it, pick a voice channel, press start. Done."
  }
];

export default function HomePage() {
  const router = useRouter();

  function handleLogin() {
    if (getStoredToken()) {
      router.push("/dashboard");
      return;
    }
    try {
      window.location.href = getDiscordAuthUrl();
    } catch {
      router.push("/?error=oauth");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="fixed inset-x-4 top-4 z-50">
        <nav className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl border border-white/10 bg-slate-950/80 px-5 py-3 backdrop-blur-xl">
          <a href="#" className="flex cursor-pointer items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <MusicIcon className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight">PXVault</span>
          </a>
          <div className="hidden items-center gap-8 text-sm text-slate-400 md:flex">
            <a href="#features" className="cursor-pointer transition-colors duration-200 hover:text-white">
              Features
            </a>
            <a href="#how-it-works" className="cursor-pointer transition-colors duration-200 hover:text-white">
              How it works
            </a>
          </div>
          <button type="button" onClick={handleLogin} className="btn-primary px-4 py-2">
            <DiscordIcon className="h-4 w-4" />
            Sign in
          </button>
        </nav>
      </header>

      {/* Hero */}
      <section className="hero-grid relative overflow-hidden px-6 pb-24 pt-40">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 60% 45% at 50% 0%, rgba(34,197,94,0.12), transparent 70%)" }}
        />
        <div className="relative mx-auto max-w-6xl text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Multi-bot music platform for Discord
          </div>
          <h1 className="glow-text mx-auto max-w-4xl text-5xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">
            Your music bots,
            <br />
            <span className="text-emerald-400">finally easy to manage.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
            Stop fighting slash commands and modals. Sign in with Discord, see every bot you own, and set them up in
            minutes — profile, voice channel, presence, and team access all in one dashboard.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <button type="button" onClick={handleLogin} className="btn-primary px-7 py-3.5 text-base">
              <DiscordIcon className="h-5 w-5" />
              Continue with Discord
            </button>
            <a href="#how-it-works" className="btn-secondary px-7 py-3.5 text-base">
              See how it works
              <ArrowRightIcon className="h-4 w-4" />
            </a>
          </div>

          {/* Dashboard preview mock */}
          <div className="relative mx-auto mt-20 max-w-4xl">
            <div className="card overflow-hidden text-left shadow-2xl shadow-emerald-500/5">
              <div className="flex items-center gap-2 border-b border-white/10 bg-slate-950/60 px-5 py-3.5">
                <span className="h-3 w-3 rounded-full bg-rose-500/70" />
                <span className="h-3 w-3 rounded-full bg-amber-500/70" />
                <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
                <span className="ml-3 text-xs text-slate-500">pxvault.app/dashboard</span>
              </div>
              <div className="grid gap-4 p-6 sm:grid-cols-2">
                {[
                  { name: "PXVault 1", state: "Playing music", online: true },
                  { name: "PXVault 2", state: "Ready in Lounge", online: true },
                  { name: "Night Bot", state: "Paused", online: false },
                  { name: "Party Mix", state: "Ready in Stage", online: true }
                ].map((mock) => (
                  <div key={mock.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                        <BotIcon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">{mock.name}</p>
                        <p className="text-xs text-slate-500">{mock.state}</p>
                      </div>
                    </div>
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${mock.online ? "bg-emerald-400" : "bg-slate-600"}`}
                      aria-label={mock.online ? "Online" : "Offline"}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-24 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything your bots need</h2>
            <p className="mt-4 text-lg text-slate-400">
              Every tool from the Discord control panel, redesigned for the web.
            </p>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="card group p-6 transition-colors duration-200 hover:border-emerald-500/30"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 transition-colors duration-200 group-hover:bg-emerald-500/20">
                  <feature.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-24 border-t border-white/5 bg-slate-950/40 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Set up in three steps</h2>
            <p className="mt-4 text-lg text-slate-400">From sign-in to music playing in under two minutes.</p>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.number} className="relative">
                <div className="card h-full p-6">
                  <span className="text-sm font-bold tracking-widest text-emerald-400">{step.number}</span>
                  <h3 className="mt-3 text-lg font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.description}</p>
                </div>
                {index < steps.length - 1 ? (
                  <ArrowRightIcon className="absolute -right-5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-slate-600 md:block" />
                ) : null}
              </div>
            ))}
          </div>

          <div className="mx-auto mt-16 max-w-xl">
            <div className="card border-emerald-500/20 p-6">
              <ul className="space-y-3">
                {[
                  "Works with bots your admin already added",
                  "No token or password ever leaves the server",
                  "Discord panel keeps working alongside the web"
                ].map((point) => (
                  <li key={point} className="flex items-start gap-3 text-sm text-slate-300">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ready to take control?</h2>
          <p className="mt-4 text-lg text-slate-400">Sign in and see your bots in seconds. Nothing to install.</p>
          <button type="button" onClick={handleLogin} className="btn-primary mt-8 px-8 py-4 text-base">
            <DiscordIcon className="h-5 w-5" />
            Continue with Discord
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <MusicIcon className="h-4 w-4" />
            PXVault — Discord music bot management
          </div>
          <p className="text-xs text-slate-600">Not affiliated with Discord Inc.</p>
        </div>
      </footer>
    </div>
  );
}
