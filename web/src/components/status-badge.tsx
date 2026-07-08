type StatusBadgeProps = {
  label: string;
  tone?: "green" | "yellow" | "red" | "gray" | "blue";
};

const toneClasses: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  green: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  yellow: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  red: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  gray: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
  blue: "bg-sky-500/15 text-sky-300 ring-sky-500/30"
};

export function StatusBadge({ label, tone = "gray" }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${toneClasses[tone]}`}>
      {label}
    </span>
  );
}

export function botStatusTone(status: string): StatusBadgeProps["tone"] {
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
