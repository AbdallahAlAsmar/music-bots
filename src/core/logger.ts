import { env } from "../config/env.js";

type Level = "debug" | "info" | "warn" | "error";

const levelRank: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function normalizeLevel(input: string | undefined, fallback: Level): Level {
  if (!input) {
    return fallback;
  }
  const lowered = input.toLowerCase();
  if (lowered === "debug" || lowered === "info" || lowered === "warn" || lowered === "error") {
    return lowered;
  }
  return fallback;
}

const minimumConsoleLevel = normalizeLevel(env.logLevel, "info");
const minimumWebhookLevel = normalizeLevel(env.webhookAlertMinLevel, "warn");

interface LogEntry {
  timestamp: string;
  level: Uppercase<Level>;
  message: string;
  eventId: string;
  correlationId: string;
  meta?: Record<string, unknown>;
}

function makeEventId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${random}`;
}

function shouldEmit(level: Level, minimum: Level): boolean {
  return levelRank[level] >= levelRank[minimum];
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function serializeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(meta));
}

async function sendWebhook(entry: LogEntry): Promise<void> {
  if (!env.controlLogWebhookUrl || !shouldEmit(entry.level.toLowerCase() as Level, minimumWebhookLevel)) {
    return;
  }

  const contentLines = [
    `**${entry.level}** ${entry.message}`,
    `eventId: \`${entry.eventId}\``,
    `correlationId: \`${entry.correlationId}\``
  ];

  if (entry.meta) {
    const metaJson = truncate(JSON.stringify(entry.meta), 1500);
    contentLines.push(`\`\`\`json\n${metaJson}\n\`\`\``);
  }

  try {
    await fetch(env.controlLogWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: contentLines.join("\n") })
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [LOGGER] Webhook send failed`, (error as Error).message);
  }
}

function log(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (!shouldEmit(level, minimumConsoleLevel) && !shouldEmit(level, minimumWebhookLevel)) {
    return;
  }

  const eventId = makeEventId();
  const serializedMeta = serializeMeta(meta);
  const correlationId =
    typeof serializedMeta?.correlationId === "string" && serializedMeta.correlationId.trim()
      ? serializedMeta.correlationId
      : eventId;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase() as Uppercase<Level>,
    message,
    eventId,
    correlationId,
    meta: serializedMeta
  };

  if (shouldEmit(level, minimumConsoleLevel)) {
    const base = `[${entry.timestamp}] [${entry.level}] ${message}`;
    if (!entry.meta || level === "info") {
      console.log(base);
    } else {
      console.log(base, JSON.stringify(entry.meta));
    }
  }

  if (shouldEmit(level, minimumWebhookLevel)) {
    void sendWebhook(entry);
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => log("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta)
};
