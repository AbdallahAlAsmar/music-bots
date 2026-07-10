"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BotRail } from "@/components/bot-rail";
import { DashboardShell } from "@/components/dashboard-shell";
import { ArrowLeftIcon } from "@/components/icons";

export default function BotsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeBotId = pathname.startsWith("/dashboard/bots/") ? pathname.split("/").pop() ?? "" : "";

  return (
    <DashboardShell title="Bot settings">
      <Link
        href="/dashboard"
        scroll={false}
        className="mb-5 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors duration-200 hover:text-emerald-300"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to my bots
      </Link>

      <div className="flex flex-col gap-5 lg:flex-row lg:gap-7">
        <BotRail activeBotId={activeBotId} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </DashboardShell>
  );
}
