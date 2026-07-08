"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion, useSpring } from "motion/react";
import { getDiscordAuthUrl, getStoredToken } from "@/lib/auth";
import { Equalizer, FadeUp, Stagger, StaggerItem } from "@/components/motion-primitives";
import {
  ActivityIcon,
  AlertIcon,
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

const mockBots = [
  { name: "PXVault 1", state: "Playing music", online: true, playing: true },
  { name: "PXVault 2", state: "Ready in Lounge", online: true, playing: false },
  { name: "Night Bot", state: "Paused", online: false, playing: false },
  { name: "Party Mix", state: "Ready in Stage", online: true, playing: false }
];

// NEXT_PUBLIC_* values are inlined at build time, so this reflects what the
// deployed bundle actually contains — perfect for diagnosing misconfiguration.
const missingOauthVars = [
  !process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID && "NEXT_PUBLIC_DISCORD_CLIENT_ID",
  !process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI && "NEXT_PUBLIC_DISCORD_REDIRECT_URI"
].filter((name): name is string => Boolean(name));

export default function HomePage() {
  const router = useRouter();
  const [oauthError, setOauthError] = useState(false);
  const reducedMotion = useReducedMotion();

  // Gentle 3D tilt on the hero preview, following the pointer
  const previewRef = useRef<HTMLDivElement>(null);
  const tiltX = useSpring(0, { stiffness: 140, damping: 18 });
  const tiltY = useSpring(0, { stiffness: 140, damping: 18 });

  function handlePreviewMove(event: React.PointerEvent) {
    if (reducedMotion || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    tiltY.set(px * 7);
    tiltX.set(-py * 7);
  }

  function handlePreviewLeave() {
    tiltX.set(0);
    tiltY.set(0);
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "oauth") {
      setOauthError(true);
    }
  }, []);

  function handleLogin() {
    if (getStoredToken()) {
      router.push("/dashboard");
      return;
    }
    try {
      window.location.href = getDiscordAuthUrl();
    } catch {
      setOauthError(true);
      router.push("/?error=oauth");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AnimatePresence>
        {oauthError ? (
          <motion.div
            className="fixed inset-x-4 top-24 z-50"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3 }}
          >
            <div
              role="alert"
              className="mx-auto flex max-w-2xl items-start gap-3 rounded-2xl border border-rose-500/30 bg-slate-950/95 px-5 py-4 shadow-2xl shadow-black/50 backdrop-blur-xl"
            >
              <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
              <div className="min-w-0">
                <p className="font-semibold text-rose-300">Sign-in is not configured yet</p>
                {missingOauthVars.length > 0 ? (
                  <>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">
                      This deployment was built without the following environment variable
                      {missingOauthVars.length > 1 ? "s" : ""}:
                    </p>
                    <ul className="mt-2 space-y-1">
                      {missingOauthVars.map((name) => (
                        <li key={name} className="text-sm text-slate-400">
                          <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">{name}</code>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">
                      Add {missingOauthVars.length > 1 ? "them" : "it"} in the hosting environment, then redeploy{" "}
                      <span className="font-medium text-slate-300">without the build cache</span> — these values are
                      baked in at build time.
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">
                    Something went wrong starting the Discord sign-in. Please try again.
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                className="ml-auto shrink-0 cursor-pointer rounded-lg px-2 py-1 text-sm text-slate-500 transition-colors duration-200 hover:bg-white/5 hover:text-white"
                onClick={() => {
                  setOauthError(false);
                  router.replace("/");
                }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Nav */}
      <motion.header
        className="fixed inset-x-4 top-4 z-50"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
      >
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
      </motion.header>

      {/* Hero */}
      <section className="hero-grid relative overflow-hidden px-6 pb-24 pt-40">
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 60% 45% at 50% 0%, rgba(34,197,94,0.12), transparent 70%)" }}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative mx-auto max-w-6xl text-center">
          <Stagger inView={false} gap={0.12} className="flex flex-col items-center">
            <StaggerItem>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                Multi-bot music platform for Discord
              </div>
            </StaggerItem>
            <StaggerItem>
              <h1 className="glow-text mx-auto max-w-4xl text-5xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">
                Your music bots,
                <br />
                <span className="gradient-text">finally easy to manage.</span>
              </h1>
            </StaggerItem>
            <StaggerItem>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
                Stop fighting slash commands and modals. Sign in with Discord, see every bot you own, and set them up
                in minutes — profile, voice channel, presence, and team access all in one dashboard.
              </p>
            </StaggerItem>
            <StaggerItem>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <motion.button
                  type="button"
                  onClick={handleLogin}
                  className="btn-primary px-7 py-3.5 text-base"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <DiscordIcon className="h-5 w-5" />
                  Continue with Discord
                </motion.button>
                <motion.a
                  href="#how-it-works"
                  className="btn-secondary px-7 py-3.5 text-base"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  See how it works
                  <ArrowRightIcon className="h-4 w-4" />
                </motion.a>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
                {["2-minute setup", "Nothing to install", "Runs 24/7"].map((chip) => (
                  <span key={chip} className="inline-flex items-center gap-1.5">
                    <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-400/70" />
                    {chip}
                  </span>
                ))}
              </div>
            </StaggerItem>
          </Stagger>

          {/* Dashboard preview mock */}
          <motion.div
            className="relative mx-auto mt-20 max-w-4xl"
            initial={{ opacity: 0, y: 48, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
            style={{ perspective: 1200 }}
          >
            <motion.div
              ref={previewRef}
              onPointerMove={handlePreviewMove}
              onPointerLeave={handlePreviewLeave}
              style={{ rotateX: tiltX, rotateY: tiltY }}
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="card overflow-hidden text-left shadow-2xl shadow-emerald-500/5">
                  <div className="flex items-center gap-2 border-b border-white/10 bg-slate-950/60 px-5 py-3.5">
                    <span className="h-3 w-3 rounded-full bg-rose-500/70" />
                    <span className="h-3 w-3 rounded-full bg-amber-500/70" />
                    <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
                    <span className="ml-3 text-xs text-slate-500">pxvault.app/dashboard</span>
                  </div>
                  <Stagger className="grid gap-4 p-6 pb-4 sm:grid-cols-2" gap={0.1} delay={0.9} inView={false}>
                    {mockBots.map((mock) => (
                      <StaggerItem key={mock.name}>
                        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                              <BotIcon className="h-5 w-5" />
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-white">{mock.name}</p>
                              <p className="text-xs text-slate-500">{mock.state}</p>
                            </div>
                          </div>
                          {mock.playing ? (
                            <Equalizer className="h-4" />
                          ) : (
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${mock.online ? "bg-emerald-400" : "bg-slate-600"}`}
                              aria-label={mock.online ? "Online" : "Offline"}
                            />
                          )}
                        </div>
                      </StaggerItem>
                    ))}
                  </Stagger>
                  {/* Now playing bar */}
                  <motion.div
                    className="mx-6 mb-6 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.5, duration: 0.5 }}
                  >
                    <Equalizer className="h-5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-medium text-white">The Neighbourhood — Afraid</p>
                        <p className="shrink-0 text-xs text-slate-500">PXVault 1</p>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                        <motion.div
                          className="h-full rounded-full bg-emerald-400"
                          animate={reducedMotion ? { width: "45%" } : { width: ["8%", "92%"] }}
                          transition={
                            reducedMotion ? undefined : { duration: 24, repeat: Infinity, ease: "linear" }
                          }
                        />
                      </div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-24 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <FadeUp inView className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-300">
              Features
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Everything your bots need</h2>
            <p className="mt-4 text-lg text-slate-400">
              Every tool from the Discord control panel, redesigned for the web.
            </p>
          </FadeUp>
          <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" gap={0.08}>
            {features.map((feature) => (
              <StaggerItem key={feature.title} className="h-full">
                <motion.div
                  className="card group h-full p-6 transition-colors duration-200 hover:border-emerald-500/30"
                  whileHover={{ y: -6 }}
                  transition={{ type: "spring", stiffness: 300, damping: 22 }}
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 transition-colors duration-200 group-hover:bg-emerald-500/20">
                    <feature.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{feature.description}</p>
                </motion.div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-24 border-t border-white/5 bg-slate-950/40 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <FadeUp inView className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-300">
              How it works
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Set up in three steps</h2>
            <p className="mt-4 text-lg text-slate-400">From sign-in to music playing in under two minutes.</p>
          </FadeUp>
          <Stagger className="mt-14 grid gap-5 md:grid-cols-3" gap={0.15}>
            {steps.map((step, index) => (
              <StaggerItem key={step.number} className="relative h-full">
                <div className="card h-full p-6">
                  <span className="text-sm font-bold tracking-widest text-emerald-400">{step.number}</span>
                  <h3 className="mt-3 text-lg font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.description}</p>
                </div>
                {index < steps.length - 1 ? (
                  <ArrowRightIcon className="absolute -right-5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-slate-600 md:block" />
                ) : null}
              </StaggerItem>
            ))}
          </Stagger>

          <FadeUp inView delay={0.2} className="mx-auto mt-16 max-w-xl">
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
          </FadeUp>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-24">
        <FadeUp inView className="mx-auto max-w-3xl">
          <div className="card relative overflow-hidden border-emerald-500/20 px-8 py-14 text-center">
            <motion.div
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(ellipse 70% 90% at 50% 110%, rgba(34,197,94,0.16), transparent 70%)" }}
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ready to take control?</h2>
              <p className="mt-4 text-lg text-slate-400">Sign in and see your bots in seconds. Nothing to install.</p>
              <motion.button
                type="button"
                onClick={handleLogin}
                className="btn-primary mt-8 px-8 py-4 text-base"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <DiscordIcon className="h-5 w-5" />
                Continue with Discord
              </motion.button>
            </div>
          </div>
        </FadeUp>
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
