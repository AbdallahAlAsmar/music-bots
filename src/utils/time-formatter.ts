interface TimeUnit {
  label: string;
  sizeMs: number;
}

const TIME_UNITS: TimeUnit[] = [
  { label: "month", sizeMs: 30 * 24 * 60 * 60 * 1000 },
  { label: "week", sizeMs: 7 * 24 * 60 * 60 * 1000 },
  { label: "day", sizeMs: 24 * 60 * 60 * 1000 },
  { label: "hour", sizeMs: 60 * 60 * 1000 },
  { label: "minute", sizeMs: 60 * 1000 }
];

function formatPart(value: number, label: string): string {
  return `${value} ${label}${value === 1 ? "" : "s"}`;
}

export function formatRemainingTime(endDateIso: string, now = new Date()): string {
  const endMs = new Date(endDateIso).getTime();
  if (!Number.isFinite(endMs)) {
    return "unknown";
  }

  let remainingMs = endMs - now.getTime();
  if (remainingMs <= 0) {
    return "expired";
  }

  const parts: string[] = [];
  for (const unit of TIME_UNITS) {
    const qty = Math.floor(remainingMs / unit.sizeMs);
    if (qty <= 0) {
      continue;
    }
    parts.push(formatPart(qty, unit.label));
    remainingMs -= qty * unit.sizeMs;
    if (parts.length === 4) {
      break;
    }
  }

  if (!parts.length) {
    return "less than a minute";
  }

  return parts.join(", ");
}
