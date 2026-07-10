"use client";

import { BotsProvider } from "@/components/bots-context";
import { BulkBotPanel } from "@/components/bulk-bot-panel";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <BotsProvider>
      {children}
      <BulkBotPanel />
    </BotsProvider>
  );
}
