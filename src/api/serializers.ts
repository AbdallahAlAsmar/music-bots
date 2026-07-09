import type { AccessRole, BotEntity, SubscriptionEntity } from "../core/types.js";
import type { MusicStateSnapshot } from "../manager/bot-manager.js";
import { botDisplayName, botUserIdFromToken } from "../utils/bot-token.js";
import { toPxSubscriptionId } from "../utils/subscription-id.js";
import { planLabel } from "../utils/subscription-plan.js";

export type BotDto = Omit<BotEntity, "token"> & {
  display_name: string;
  discord_user_id: string | null;
};

export type SubscriptionDto = {
  px_id: string;
  plan_days: number;
  plan_label: string;
  start_date: string;
  end_date: string;
  active: boolean;
};

export type AccessDto = {
  user_id: string;
  role: AccessRole;
  created_at: string;
  username?: string | null;
  avatar_url?: string | null;
};

export type PlayerStateDto = MusicStateSnapshot;

export function toBotDto(bot: BotEntity): BotDto {
  const { token: _token, ...rest } = bot;
  return {
    ...rest,
    display_name: botDisplayName(bot),
    discord_user_id: botUserIdFromToken(bot)
  };
}

export function toSubscriptionDto(sub: SubscriptionEntity): SubscriptionDto {
  return {
    px_id: toPxSubscriptionId(sub.id),
    plan_days: sub.plan_days,
    plan_label: planLabel(sub.plan_days),
    start_date: sub.start_date,
    end_date: sub.end_date,
    active: sub.active
  };
}

export function toPlayerStateDto(state: MusicStateSnapshot): PlayerStateDto {
  return state;
}
