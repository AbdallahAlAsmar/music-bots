import type { BotEntity, SubscriptionEntity } from "../core/types.js";
import { BotRepository } from "../repositories/bot-repository.js";
import { SubscriptionRepository } from "../repositories/subscription-repository.js";
import { AccessRepository } from "../repositories/access-repository.js";
import { PermissionService } from "../services/permission-service.js";
import { decrypt, encrypt } from "../utils/crypto.js";
import { env } from "../config/env.js";
import { ManagedBotRuntime } from "./managed-bot-runtime.js";
import { logger } from "../core/logger.js";
import { normalizePxSubscriptionId, toPxSubscriptionId } from "../utils/subscription-id.js";
import type { PlanDays } from "../utils/subscription-plan.js";

type BotHealthPatch = Pick<BotEntity, "runtime_state" | "last_error" | "last_ready_at" | "last_command_at" | "health_updated_at">;

export class BotManager {
  private readonly runtimes = new Map<string, ManagedBotRuntime>();
  private readonly startInFlight = new Map<string, Promise<void>>();
  private readonly permissionService: PermissionService;
  private startSlotsInUse = 0;
  private readonly startWaiters: Array<() => void> = [];

  constructor(
    private readonly botRepo: BotRepository,
    private readonly subRepo: SubscriptionRepository,
    private readonly accessRepo: AccessRepository
  ) {
    this.permissionService = new PermissionService(accessRepo);
  }

  get size(): number {
    return this.runtimes.size;
  }

  async bootstrap(): Promise<void> {
    const bots = await this.botRepo.findAll();
    for (const bot of bots) {
      if (bot.status !== "active") {
        continue;
      }
      const sub = await this.subRepo.getActiveByBotId(bot.id);
      if (!sub) {
        continue;
      }
      void this.start(bot.id).catch((error) => {
        logger.error("Failed to start bot in bootstrap", { botId: bot.id, error: error.message });
      });
      await new Promise((resolve) => setTimeout(resolve, 5500));
    }
  }

  async addBot(input: {
    token: string;
    ownerId: string;
    guildId: string;
    voiceChannelId?: string | null;
    planDays: PlanDays;
  }): Promise<BotEntity> {
    const normalizedNewToken = input.token.trim();
    const existingBots = await this.botRepo.findAll();
    const duplicate = existingBots.find((bot) => {
      try {
        return decrypt(bot.token, env.encryptionKey).trim() === normalizedNewToken;
      } catch {
        return false;
      }
    });
    if (duplicate) {
      throw new Error("This bot token is already added.");
    }

    const bot = await this.botRepo.create({
      token: encrypt(input.token, env.encryptionKey),
      owner_id: input.ownerId,
      guild_id: input.guildId,
      voice_channel_id: input.voiceChannelId ?? null,
      name: null,
      avatar: null,
      banner: null,
      language: "ar",
      log_channel_id: null,
      status_text: null,
      status_type: null,
      online_status: null,
      status: "active",
      runtime_state: "starting",
      last_error: null,
      last_ready_at: null,
      last_command_at: null,
      health_updated_at: new Date().toISOString()
    });

    await this.subRepo.createForPlan(bot.id, input.planDays);
    await this.accessRepo.grant(bot.id, input.ownerId, "owner");
    await this.start(bot.id);
    return bot;
  }

  async removeBot(botId: string): Promise<void> {
    await this.stop(botId);
    await this.botRepo.remove(botId);
  }

  async start(botId: string): Promise<void> {
    if (this.runtimes.has(botId)) {
      return;
    }
    const inFlight = this.startInFlight.get(botId);
    if (inFlight) {
      await inFlight;
      return;
    }

    const startPromise = this.startRuntime(botId);
    this.startInFlight.set(botId, startPromise);
    try {
      await startPromise;
    } finally {
      this.startInFlight.delete(botId);
    }
  }

  async stop(botId: string, runtimeState: BotEntity["runtime_state"] = "stopped"): Promise<void> {
    const inFlight = this.startInFlight.get(botId);
    if (inFlight) {
      await inFlight.catch(() => undefined);
    }

    const runtime = this.runtimes.get(botId);
    if (!runtime) {
      return;
    }
    await runtime.stop();
    this.runtimes.delete(botId);
    await this.updateBotHealth(botId, {
      runtime_state: runtimeState,
      health_updated_at: new Date().toISOString()
    });
    logger.info("Managed bot stopped", { botId });
  }

  async listBots(): Promise<BotEntity[]> {
    return this.botRepo.findAll();
  }

  async listBotsForAdmin(): Promise<
    Array<{
      bot: BotEntity;
      pxId: string | null;
      subscriptionEnd: string | null;
      planDays: number | null;
    }>
  > {
    const [bots, activeSubs] = await Promise.all([this.botRepo.findAll(), this.subRepo.listActive()]);
    const byBotId = new Map(activeSubs.map((sub) => [sub.bot_id, sub] as const));
    return bots.map((bot) => {
      const sub = byBotId.get(bot.id) ?? null;
      return {
        bot,
        pxId: sub ? toPxSubscriptionId(sub.id) : null,
        subscriptionEnd: sub?.end_date ?? null,
        planDays: sub?.plan_days ?? null
      };
    });
  }

  async botInfo(botId: string): Promise<{
    bot: BotEntity;
    subscriptionEnd: string | null;
  }> {
    const bot = await this.botRepo.findById(botId);
    if (!bot) {
      throw new Error("Bot not found");
    }
    const sub = await this.subRepo.getActiveByBotId(botId);
    return { bot, subscriptionEnd: sub?.end_date ?? null };
  }

  async grantAccess(requesterId: string, botId: string, targetUserId: string, role: "admin" | "viewer"): Promise<void> {
    await this.permissionService.assertRole(botId, requesterId, "owner");
    await this.accessRepo.grant(botId, targetUserId, role);
  }

  async revokeAccess(requesterId: string, botId: string, targetUserId: string): Promise<void> {
    await this.permissionService.assertRole(botId, requesterId, "owner");
    await this.accessRepo.revoke(botId, targetUserId);
  }

  async updateBotProfile(
    requesterId: string,
    botId: string,
    patch: Partial<
      Pick<
        BotEntity,
        "voice_channel_id" | "name" | "avatar" | "banner" | "language" | "log_channel_id" | "status_text" | "status_type" | "online_status" | "status"
      >
    >
  ): Promise<void> {
    await this.permissionService.assertRole(botId, requesterId, "admin");
    await this.botRepo.update(botId, patch);
    await this.refreshRuntime(botId);
  }

  async getUserBots(userId: string): Promise<BotEntity[]> {
    return this.getAccessibleBots(userId);
  }

  async getAccessibleBots(userId: string): Promise<BotEntity[]> {
    const owned = await this.botRepo.findByOwner(userId);
    const ownedIds = new Set(owned.map((bot) => bot.id));
    const all = await this.botRepo.findAll();
    const shared: BotEntity[] = [];

    for (const bot of all) {
      if (ownedIds.has(bot.id)) {
        continue;
      }
      const role = await this.accessRepo.getRole(bot.id, userId);
      if (role) {
        shared.push(bot);
      }
    }

    return [...owned, ...shared].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }

  async getGuildChannels(
    botId: string,
    requesterId: string
  ): Promise<Array<{ id: string; name: string; type: "voice" | "text" }>> {
    await this.permissionService.assertRole(botId, requesterId, "viewer");
    const bot = await this.botRepo.findById(botId);
    if (!bot) {
      throw new Error("Bot not found");
    }

    const token = decrypt(bot.token, env.encryptionKey);
    const response = await fetch(`https://discord.com/api/v10/guilds/${bot.guild_id}/channels`, {
      headers: { Authorization: `Bot ${token}` }
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Failed to fetch guild channels (${response.status}): ${detail.slice(0, 200)}`);
    }

    const channels = (await response.json()) as Array<{ id: string; name: string; type: number }>;
    return channels
      .filter((channel) => channel.type === 0 || channel.type === 2)
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type === 2 ? ("voice" as const) : ("text" as const)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async pauseBotForUser(requesterId: string, botId: string): Promise<void> {
    await this.permissionService.assertRole(botId, requesterId, "admin");
    await this.pauseBot(botId);
  }

  async resumeBotForUser(requesterId: string, botId: string): Promise<void> {
    await this.permissionService.assertRole(botId, requesterId, "admin");
    await this.resumeBot(botId);
  }

  async getOwnedBots(userId: string): Promise<BotEntity[]> {
    return this.botRepo.findOwnedOldestFirst(userId);
  }

  async getPrimaryManagementBot(userId: string): Promise<BotEntity | null> {
    const owned = await this.getOwnedBots(userId);
    return owned[0] ?? null;
  }

  async assertManagePermission(botId: string, userId: string): Promise<void> {
    await this.permissionService.assertRole(botId, userId, "admin");
  }

  async assertViewPermission(botId: string, userId: string): Promise<void> {
    await this.permissionService.assertRole(botId, userId, "viewer");
  }

  async updateBotGuild(requesterId: string, botId: string, guildId: string): Promise<void> {
    await this.permissionService.assertRole(botId, requesterId, "owner");
    await this.botRepo.update(botId, { guild_id: guildId });
    await this.restartBot(requesterId, botId);
  }

  async grantOwnerAccess(requesterId: string, botId: string, targetUserId: string): Promise<void> {
    await this.permissionService.assertRole(botId, requesterId, "owner");
    await this.accessRepo.grant(botId, targetUserId, "owner");
    await this.refreshRuntime(botId);
  }

  async revokeOwnerAccess(requesterId: string, botId: string, targetUserId: string): Promise<void> {
    await this.permissionService.assertRole(botId, requesterId, "owner");

    const bot = await this.botRepo.findById(botId);
    if (!bot) {
      throw new Error("Bot not found");
    }

    const access = await this.accessRepo.list(botId);
    const owners = new Set<string>();
    owners.add(bot.owner_id);
    for (const row of access) {
      if (row.role === "owner") {
        owners.add(row.user_id);
      }
    }

    if (!owners.has(targetUserId)) {
      throw new Error("That user is not an owner");
    }

    if (owners.size <= 1) {
      throw new Error("Cannot remove the final owner");
    }

    await this.accessRepo.revoke(botId, targetUserId);

    if (bot.owner_id === targetUserId) {
      const replacement = [...owners].find((x) => x !== targetUserId);
      if (!replacement) {
        throw new Error("Cannot determine replacement owner");
      }
      await this.botRepo.update(botId, { owner_id: replacement });
      if (!access.some((row) => row.user_id === replacement && row.role === "owner")) {
        await this.accessRepo.grant(botId, replacement, "owner");
      }
    }

    await this.refreshRuntime(botId);
  }

  async listBotOwners(requesterId: string, botId: string): Promise<string[]> {
    await this.permissionService.assertRole(botId, requesterId, "viewer");
    const bot = await this.botRepo.findById(botId);
    if (!bot) {
      throw new Error("Bot not found");
    }

    const access = await this.accessRepo.list(botId);
    const owners = new Set<string>();
    owners.add(bot.owner_id);
    for (const row of access) {
      if (row.role === "owner") {
        owners.add(row.user_id);
      }
    }
    return [...owners];
  }

  async restartBot(requesterId: string, botId: string): Promise<void> {
    await this.permissionService.assertRole(botId, requesterId, "admin");
    const bot = await this.botRepo.findById(botId);
    if (!bot) {
      throw new Error("Bot not found");
    }
    const sub = await this.subRepo.getActiveByBotId(botId);
    if (!sub) {
      throw new Error("No active subscription for this bot");
    }

    await this.botRepo.update(botId, { status: "active" });
    await this.stop(botId);
    await this.start(botId);
  }

  async extendSubscription(botId: string, planDays: PlanDays): Promise<SubscriptionEntity> {
    const sub = await this.subRepo.extendActive(botId, planDays);
    const bot = await this.botRepo.findById(botId);
    if (bot && bot.status === "expired") {
      await this.botRepo.update(botId, { status: "active" });
      await this.start(botId);
    }
    return sub;
  }

  async pauseBot(botId: string): Promise<void> {
    await this.botRepo.update(botId, { status: "paused" });
    await this.stop(botId, "paused");
  }

  async resumeBot(botId: string): Promise<void> {
    const sub = await this.subRepo.getActiveByBotId(botId);
    if (!sub) {
      throw new Error("No active subscription for this bot");
    }
    await this.botRepo.update(botId, { status: "active" });
    await this.updateBotHealth(botId, { runtime_state: "starting", last_error: null, health_updated_at: new Date().toISOString() });
    await this.start(botId);
  }

  async suspendBot(botId: string): Promise<void> {
    await this.botRepo.update(botId, { status: "suspended" });
    await this.stop(botId, "suspended");
  }

  async getHealthSnapshot(): Promise<{
    totalBots: number;
    activeRuntimes: number;
    byStatus: Record<string, number>;
    unhealthyBots: BotEntity[];
  }> {
    const bots = await this.botRepo.findAll();
    const byStatus: Record<string, number> = {};
    for (const bot of bots) {
      byStatus[bot.status] = (byStatus[bot.status] ?? 0) + 1;
    }
    const unhealthyBots = bots.filter((bot) => bot.last_error || bot.runtime_state === "error" || bot.runtime_state === "degraded").slice(0, 10);
    return {
      totalBots: bots.length,
      activeRuntimes: this.size,
      byStatus,
      unhealthyBots
    };
  }

  async lookupSubscriptionByPxId(pxId: string): Promise<{ bot: BotEntity; subscriptionId: string; endDate: string; planDays: number } | null> {
    const normalizedPxId = normalizePxSubscriptionId(pxId);
    const activeSubs = await this.subRepo.listActive();
    const match = activeSubs.find((sub) => toPxSubscriptionId(sub.id) === normalizedPxId);
    if (!match) {
      return null;
    }

    const bot = await this.botRepo.findById(match.bot_id);
    if (!bot) {
      return null;
    }

    return {
      bot,
      subscriptionId: normalizedPxId,
      endDate: match.end_date,
      planDays: match.plan_days
    };
  }

  async resolveBotId(reference: string): Promise<string> {
    const trimmed = reference.trim();
    if (!trimmed) {
      throw new Error("Bot ID is required");
    }

    const maybePx = trimmed.toUpperCase();
    if (maybePx.startsWith("PX-") || /^[A-Fa-f0-9]{8}$/.test(trimmed)) {
      const lookup = await this.lookupSubscriptionByPxId(trimmed);
      if (!lookup) {
        throw new Error("No bot found for that PX ID");
      }
      return lookup.bot.id;
    }

    const bot = await this.botRepo.findById(trimmed);
    if (!bot) {
      throw new Error("Bot not found");
    }
    return bot.id;
  }

  private async refreshRuntime(botId: string): Promise<void> {
    const runtime = this.runtimes.get(botId);
    if (!runtime) {
      return;
    }
    const latest = await this.botRepo.findById(botId);
    if (!latest) {
      return;
    }
    await runtime.refresh(latest);
  }

  private async updateBotHealth(botId: string, patch: Partial<BotHealthPatch>): Promise<void> {
    await this.botRepo.update(botId, patch as Partial<BotEntity>);
  }

  private async acquireStartSlot(): Promise<void> {
    if (this.startSlotsInUse < env.botStartConcurrency) {
      this.startSlotsInUse += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      this.startWaiters.push(resolve);
    });
    this.startSlotsInUse += 1;
  }

  private releaseStartSlot(): void {
    this.startSlotsInUse = Math.max(0, this.startSlotsInUse - 1);
    const next = this.startWaiters.shift();
    if (next) {
      next();
    }
  }

  private async startRuntime(botId: string): Promise<void> {
    await this.acquireStartSlot();
    try {
      await this.updateBotHealth(botId, {
        runtime_state: "starting",
        last_error: null,
        health_updated_at: new Date().toISOString()
      });

      const bot = await this.botRepo.findById(botId);
      if (!bot) {
        throw new Error("Bot not found");
      }

      const runtime = new ManagedBotRuntime(
        bot,
        this.permissionService,
        {
          getActiveSubscription: (id) => this.subRepo.getActiveByBotId(id),
          updateProfile: (requesterId, id, patch) => this.updateBotProfile(requesterId, id, patch),
          updateGuild: (requesterId, id, guildId) => this.updateBotGuild(requesterId, id, guildId),
          grantOwner: (requesterId, id, targetUserId) => this.grantOwnerAccess(requesterId, id, targetUserId),
          revokeOwner: (requesterId, id, targetUserId) => this.revokeOwnerAccess(requesterId, id, targetUserId),
          listOwners: (requesterId, id) => this.listBotOwners(requesterId, id),
          restart: (requesterId, id) => this.restartBot(requesterId, id),
          listOwnedBots: (ownerId) => this.getOwnedBots(ownerId),
          getPrimaryOwnedBot: (ownerId) => this.getPrimaryManagementBot(ownerId),
          updateHealth: (id, patch) => this.updateBotHealth(id, patch)
        },
        async (id, reason) => {
          logger.warn("Runtime fault detected", { botId: id, reason });
          await this.updateBotHealth(id, {
            runtime_state: "error",
            last_error: reason,
            health_updated_at: new Date().toISOString()
          });
          await this.stop(id, "error");
          setTimeout(async () => {
            try {
              const latest = await this.botRepo.findById(id);
              if (!latest || latest.status !== "active") {
                return;
              }
              const sub = await this.subRepo.getActiveByBotId(id);
              if (!sub) {
                return;
              }
              await this.start(id);
            } catch (error) {
              logger.error("Failed runtime auto-restart", { botId: id, error: (error as Error).message });
            }
          }, 3000);
        }
      );

      this.runtimes.set(botId, runtime);
      try {
        await runtime.start();
        await this.updateBotHealth(botId, {
          runtime_state: "ready",
          last_error: null,
          last_ready_at: new Date().toISOString(),
          health_updated_at: new Date().toISOString()
        });
        logger.info("Managed bot started", { botId, source: "manager" });
      } catch (error) {
        this.runtimes.delete(botId);
        await this.updateBotHealth(botId, {
          runtime_state: "error",
          last_error: (error as Error).message,
          health_updated_at: new Date().toISOString()
        });
        throw error;
      }
    } finally {
      this.releaseStartSlot();
    }
  }
}
