"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminAddBot, adminExtendBot, adminRemoveBot, fetchAdminBots } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import type { AdminBotRow } from "@/lib/types";
import { DashboardShell } from "@/components/dashboard-shell";

export default function AdminPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AdminBotRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ token: "", owner_id: "", guild_id: "", plan_days: "30" });

  async function load() {
    try {
      const result = await fetchAdminBots();
      setRows(result.bots);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/");
      return;
    }
    void load();
  }, [router]);

  return (
    <DashboardShell title="Admin panel">
      <h2 className="text-2xl font-bold text-white">Platform Admin</h2>
      {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}

      <div className="card mt-6 p-5">
        <h3 className="font-semibold text-white">Add bot</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input className="field" placeholder="Bot token" value={form.token} onChange={(e) => setForm((p) => ({ ...p, token: e.target.value }))} />
          <input className="field" placeholder="Owner ID" value={form.owner_id} onChange={(e) => setForm((p) => ({ ...p, owner_id: e.target.value }))} />
          <input className="field" placeholder="Guild ID" value={form.guild_id} onChange={(e) => setForm((p) => ({ ...p, guild_id: e.target.value }))} />
          <select className="field" value={form.plan_days} onChange={(e) => setForm((p) => ({ ...p, plan_days: e.target.value }))}>
            <option value="1">1 day</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
        </div>
        <button
          className="btn-primary mt-3"
          onClick={() =>
            void adminAddBot({
              token: form.token,
              owner_id: form.owner_id,
              guild_id: form.guild_id,
              plan_days: Number(form.plan_days)
            }).then(load)
          }
        >
          Add bot
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {loading ? <p className="text-slate-400">Loading...</p> : null}
        {rows.map((row) => (
          <div key={row.bot.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium text-white">{row.bot.display_name}</p>
              <p className="text-xs text-slate-500">
                {row.bot.id} • {row.subscription?.px_id ?? "No subscription"}
              </p>
              <p className="text-xs text-slate-500">
                Owner: {row.owner?.username ?? row.bot.owner_id} • Guild: {row.guild?.name ?? row.bot.guild_id}
              </p>
            </div>
            <div className="flex gap-2">
              <select
                className="field h-9 min-w-[110px] px-2 py-1 text-xs"
                defaultValue="30"
                onChange={(e) => void adminExtendBot(row.bot.id, Number(e.target.value)).then(load)}
              >
                <option value="1">+1 day</option>
                <option value="7">+7 days</option>
                <option value="30">+30 days</option>
                <option value="90">+90 days</option>
              </select>
              <button className="btn-secondary" onClick={() => router.push(`/dashboard/bots/${row.bot.id}`)}>
                Configure
              </button>
              <button className="btn-danger" onClick={() => void adminRemoveBot(row.bot.id).then(load)}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
