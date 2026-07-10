"use client";

import { useEffect, useState } from "react";
import type { BotDto } from "@/lib/types";
import { BotIcon } from "@/components/icons";

const PALETTES = [
  ["from-emerald-600/90", "to-teal-800"],
  ["from-violet-600/90", "to-indigo-800"],
  ["from-sky-600/90", "to-blue-800"],
  ["from-amber-600/90", "to-orange-800"],
  ["from-rose-600/90", "to-pink-800"],
  ["from-cyan-600/90", "to-teal-800"],
  ["from-fuchsia-600/90", "to-purple-800"],
  ["from-lime-600/90", "to-emerald-800"]
] as const;

const SIZES = {
  sm: { box: "h-12 w-12 rounded-2xl", icon: "h-6 w-6" },
  md: { box: "h-14 w-14 rounded-2xl", icon: "h-7 w-7" },
  lg: { box: "h-20 w-20 rounded-2xl", icon: "h-10 w-10" },
  rail: { box: "h-14 w-14 rounded-2xl", icon: "h-7 w-7" }
} as const;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function resolveAvatarUrl(avatar: string | null | undefined): string | null {
  const trimmed = avatar?.trim();
  if (!trimmed) return null;
  if (trimmed === "null" || trimmed === "undefined") return null;
  return trimmed;
}

type BotAvatarProps = {
  bot: Pick<BotDto, "id" | "display_name" | "name" | "avatar">;
  size?: keyof typeof SIZES;
  className?: string;
};

export function BotAvatar({ bot, size = "md", className = "" }: BotAvatarProps) {
  const [broken, setBroken] = useState(false);
  const sizeClass = SIZES[size];
  const avatarUrl = resolveAvatarUrl(bot.avatar);
  const showPlaceholder = !avatarUrl || broken;

  useEffect(() => {
    setBroken(false);
  }, [avatarUrl, bot.id]);

  if (showPlaceholder) {
    const palette = PALETTES[hashString(bot.id) % PALETTES.length];
    return (
      <span
        role="img"
        aria-label={`${bot.display_name} avatar`}
        title={bot.display_name}
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br text-white/90 shadow-inner shadow-black/25 ${palette[0]} ${palette[1]} ${sizeClass.box} ${className}`}
      >
        <BotIcon className={sizeClass.icon} />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt=""
      className={`shrink-0 object-cover ${sizeClass.box} ${className}`}
      onError={() => setBroken(true)}
    />
  );
}
