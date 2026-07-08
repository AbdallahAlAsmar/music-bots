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
