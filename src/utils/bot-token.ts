import { env } from "../config/env.js";
import type { BotEntity } from "../core/types.js";
import { decrypt } from "./crypto.js";

export function botUserIdFromToken(bot: BotEntity): string | null {
  try {
    const token = decrypt(bot.token, env.encryptionKey);
    const encodedId = token.split(".")[0];
    if (!encodedId) {
      return null;
    }

    const base64 = encodedId.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (base64.length % 4)) % 4;
    const padded = `${base64}${"=".repeat(padLength)}`;
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return /^\d{17,20}$/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function botDisplayName(bot: BotEntity): string {
  const trimmed = bot.name?.trim();
  return trimmed || "Unnamed Bot";
}
