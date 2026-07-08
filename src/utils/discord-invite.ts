import { PermissionsBitField } from "discord.js";
import type { BotEntity } from "../core/types.js";
import { botUserIdFromToken } from "./bot-token.js";

export function buildBotInviteLink(bot: BotEntity): string | null {
  const clientId = botUserIdFromToken(bot);
  if (!clientId) {
    return null;
  }

  const scope = encodeURIComponent("bot applications.commands");
  const permissions = PermissionsBitField.Flags.Administrator.toString();
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=${scope}`;
}
