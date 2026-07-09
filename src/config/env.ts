import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  controlBotToken: required("CONTROL_BOT_TOKEN"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? "bot-assets",
  encryptionKey: required("ENCRYPTION_KEY"),
  defaultGuildId: required("DEFAULT_GUILD_ID"),
  lavalinkHost: process.env.LAVALINK_HOST ?? "127.0.0.1:2333", // legacy, unused if lavalinkNodes is set
  lavalinkPassword: process.env.LAVALINK_PASSWORD ?? "youshallnotpass", // legacy
  lavalinkSecure: (process.env.LAVALINK_SECURE ?? "false").toLowerCase() === "true", // legacy
  lavalinkNodes: (() => {
    const raw = process.env.LAVALINK_NODES;
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) throw new Error();
      return arr.map((node, index) => {
        if (!node || typeof node !== "object") {
          throw new Error(`Node at index ${index} is not an object`);
        }
        // Remove any accidental protocol from host
        let cleanHost = String(node.host ?? "").trim().replace(/^https?:\/\//, "");
        // Remove trailing slashes
        cleanHost = cleanHost.replace(/\/+$/, "");
        const port = Number(node.port);
        const password = String(node.password ?? "");
        if (!cleanHost) {
          throw new Error(`Node at index ${index} has an empty host`);
        }
        if (!Number.isInteger(port) || port <= 0 || port > 65535) {
          throw new Error(`Node at index ${index} has invalid port`);
        }
        if (!password) {
          throw new Error(`Node at index ${index} has an empty password`);
        }
        return {
          name: String(node.name ?? "").trim() || cleanHost,
          // Shoukaku expects host:port here. Protocol is controlled by `secure`.
          url: `${cleanHost}:${port}`,
          auth: password,
          secure: !!node.secure
        };
      });
    } catch (error) {
      const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
      throw new Error(`Invalid LAVALINK_NODES format in .env${detail}`);
    }
  })(),
  lavalinkSearchPrefix: process.env.LAVALINK_SEARCH_PREFIX ?? "ytsearch",
  controlLogWebhookUrl: process.env.CONTROL_LOG_WEBHOOK_URL ?? "",
  logLevel: (process.env.LOG_LEVEL ?? "info").toLowerCase(),
  webhookAlertMinLevel: (process.env.WEBHOOK_ALERT_MIN_LEVEL ?? "warn").toLowerCase(),
  botStartConcurrency: Math.max(1, Math.floor(numberEnv("BOT_START_CONCURRENCY", 2))),
  voiceRejoinBaseDelayMs: Math.max(250, Math.floor(numberEnv("VOICE_REJOIN_BASE_DELAY_MS", 1000))),
  voiceRejoinMaxDelayMs: Math.max(1000, Math.floor(numberEnv("VOICE_REJOIN_MAX_DELAY_MS", 10_000))),
  subscriptionCheckIntervalMs: numberEnv("SUBSCRIPTION_CHECK_INTERVAL_MS", 60000),
  commandCooldownMs: numberEnv("COMMAND_COOLDOWN_MS", 3000),
  apiPort: numberEnv("API_PORT", 21024),
  apiPublicUrl: process.env.API_PUBLIC_URL ?? "",
  discordClientId: process.env.DISCORD_CLIENT_ID ?? "",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  discordRedirectUri: process.env.DISCORD_REDIRECT_URI ?? "",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  jwtSecret: process.env.JWT_SECRET ?? "",
  adminGuildId: process.env.ADMIN_GUILD_ID ?? "",
  adminRoleId: process.env.ADMIN_ROLE_ID ?? "",
  // Optional: separate Supabase project holding the PX licenses table.
  // Falls back to the main Supabase client when unset.
  licenseSupabaseUrl: process.env.LICENSE_SUPABASE_URL ?? "",
  licenseSupabaseKey: process.env.LICENSE_SUPABASE_KEY ?? "",
  apiEnabled: Boolean(process.env.DISCORD_CLIENT_ID && process.env.JWT_SECRET)
};
