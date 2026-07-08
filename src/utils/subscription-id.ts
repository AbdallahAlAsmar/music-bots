const PX_PREFIX = "PX-";

function cleanedHexTail(value: string): string {
  const compact = value.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  return compact.slice(-8).padStart(8, "0");
}

export function toPxSubscriptionId(subscriptionId: string): string {
  return `${PX_PREFIX}${cleanedHexTail(subscriptionId)}`;
}

export function normalizePxSubscriptionId(input: string): string {
  const normalized = input.trim().toUpperCase();
  if (!normalized) {
    throw new Error("PX ID is required");
  }

  const withPrefix = normalized.startsWith(PX_PREFIX) ? normalized : `${PX_PREFIX}${normalized}`;
  const compact = withPrefix.replace(/[^A-Z0-9]/g, "");
  const body = compact.startsWith("PX") ? compact.slice(2) : compact;

  if (!/^[A-F0-9]{8}$/.test(body)) {
    throw new Error("PX ID must be in the format PX-XXXXXXXX");
  }

  return `${PX_PREFIX}${body}`;
}
