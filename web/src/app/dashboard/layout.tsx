"use client";

import { BotsProvider } from "@/components/bots-context";
import { BulkBotPanel } from "@/components/bulk-bot-panel";
import { BulkSelectionDock } from "@/components/bulk-selection-bar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <BotsProvider>
      {children}
      <BulkSelectionDock />
      <BulkBotPanel />
    </BotsProvider>
  );
}
