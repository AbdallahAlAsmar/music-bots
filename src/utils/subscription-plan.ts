export type PlanDays = 1 | 7 | 30 | 90;

const PLAN_LABELS: Record<PlanDays, string> = {
  1: "1 day",
  7: "7 days",
  30: "30 days",
  90: "3 months"
};

export function isPlanDays(value: number): value is PlanDays {
  return value === 1 || value === 7 || value === 30 || value === 90;
}

export function planLabel(days: number): string {
  if (isPlanDays(days)) {
    return PLAN_LABELS[days];
  }
  return `${days} days`;
}
