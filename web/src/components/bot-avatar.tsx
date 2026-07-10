"use client";

import type { BotDto } from "@/lib/types";

const PALETTES = [
  ["from-emerald-500", "to-teal-700"],
  ["from-violet-500", "to-indigo-700"],
  ["from-sky-500", "to-blue-700"],
  ["from-amber-500", "to-orange-700"],
  ["from-rose-500", "to-pink-700"],
  ["from-cyan-500", "to-teal-700"],
  ["from-fuchsia-500", "to-purple-700"],
  ["from-lime-500", "to-emerald-700"]
] as const;

const SIZES = {
  sm: { box: "h-12 w-12 text-lg rounded-2xl", text: "text-lg" },
  md: { box: "h-14 w-14 text-xl rounded-2xl", text: "text-xl" },
  lg: { box: "h-20 w-20 text-3xl rounded-2xl", text: "text-3xl" },
  rail: { box: "h-14 w-14 text-xl rounded-2xl", text: "text-xl" }
} as const;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function botInitial(bot: Pick<BotDto, "display_name" | "name" | "id">): string {
  const source = (bot.display_name || bot.name || "B").trim();
  return source.charAt(0).toUpperCase() || "B";
}

type BotAvatarProps = {
  bot: Pick<BotDto, "id" | "display_name" | "name" | "avatar">;
  size?: keyof typeof SIZES;
  className?: string;
  alt?: string;
};

export function BotAvatar({ bot, size = "md", className = "", alt }: BotAvatarProps) {
  const sizeClass = SIZES[size];
  const label = alt ?? `${bot.display_name} avatar`;

  if (bot.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={bot.avatar}
        alt={label}
        className={`object-cover ${sizeClass.box} ${className}`}
      />
    );
  }

  const palette = PALETTES[hashString(bot.id) % PALETTES.length];
  const initial = botInitial(bot);

  return (
    <span
      aria-hidden={!alt}
      title={bot.display_name}
      className={`inline-flex shrink-0 items-center justify-center bg-gradient-to-br font-bold text-white shadow-inner shadow-black/20 ${palette[0]} ${palette[1]} ${sizeClass.box} ${sizeClass.text} ${className}`}
    >
      {initial}
    </span>
  );
}
