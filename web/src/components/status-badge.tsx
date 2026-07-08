type StatusBadgeProps = {
  label: string;
  tone?: "green" | "yellow" | "red" | "gray" | "blue";
  pulse?: boolean;
};

const toneClasses: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  green: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  yellow: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  red: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  gray: "bg-slate-500/10 text-slate-300 ring-slate-500/30",
  blue: "bg-sky-500/10 text-sky-300 ring-sky-500/30"
};

const dotClasses: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-rose-400",
  gray: "bg-slate-400",
  blue: "bg-sky-400"
};

export function StatusBadge({ label, tone = "gray", pulse = false }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${toneClasses[tone]}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {pulse ? (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dotClasses[tone]}`} />
        ) : null}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotClasses[tone]}`} />
      </span>
      {label}
    </span>
  );
}

export function botStatusTone(status: string): NonNullable<StatusBadgeProps["tone"]> {
  switch (status) {
    case "active":
      return "green";
    case "paused":
      return "yellow";
    case "expired":
    case "suspended":
      return "red";
    default:
      return "gray";
  }
}

type EffectiveStatus = {
  label: string;
  tone: NonNullable<StatusBadgeProps["tone"]>;
  pulse: boolean;
  /** True only when the bot is genuinely up and healthy */
  healthy: boolean;
};

/**
 * The honest at-a-glance state of a bot. A bot marked "active" in the
 * database can still be broken (runtime error) or unusable (setup not
 * finished) — those must never show green.
 */
export function effectiveBotStatus(bot: {
  status: string;
  runtime_state: string | null;
  voice_channel_id: string | null;
}): EffectiveStatus {
  if (bot.runtime_state === "error") {
    return { label: "error", tone: "red", pulse: false, healthy: false };
  }
  if (bot.status === "expired" || bot.status === "suspended") {
    return { label: bot.status, tone: "red", pulse: false, healthy: false };
  }
  if (bot.status === "paused") {
    return { label: "paused", tone: "yellow", pulse: false, healthy: false };
  }
  if (!bot.voice_channel_id) {
    return { label: "needs setup", tone: "yellow", pulse: false, healthy: false };
  }
  if (bot.status === "active") {
    if (bot.runtime_state === "starting") {
      return { label: "starting", tone: "blue", pulse: true, healthy: false };
    }
    if (bot.runtime_state === "degraded") {
      return { label: "degraded", tone: "yellow", pulse: false, healthy: false };
    }
    return { label: "active", tone: "green", pulse: true, healthy: true };
  }
  return { label: bot.status, tone: "gray", pulse: false, healthy: false };
}

export function runtimeTone(runtimeState: string | null): NonNullable<StatusBadgeProps["tone"]> {
  switch (runtimeState) {
    case "ready":
    case "active":
      return "green";
    case "starting":
      return "blue";
    case "degraded":
      return "yellow";
    case "error":
      return "red";
    default:
      return "gray";
  }
}
