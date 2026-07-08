import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  Client,
  DiscordAPIError,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} from "discord.js";
import { env } from "../config/env.js";
import { logger } from "../core/logger.js";
import { BotManager } from "../manager/bot-manager.js";
import { controlCommands } from "./command-definitions.js";
import { CooldownGuard } from "../utils/cooldown.js";
import type { ActivityKind, BotEntity } from "../core/types.js";
import { SubscriptionRepository } from "../repositories/subscription-repository.js";
import { formatRemainingTime } from "../utils/time-formatter.js";
import { decrypt } from "../utils/crypto.js";
import { isPlanDays, planLabel } from "../utils/subscription-plan.js";
import { toPxSubscriptionId } from "../utils/subscription-id.js";

const cooldown = new CooldownGuard(env.commandCooldownMs);

function isUnknownInteractionError(error: unknown): boolean {
  return error instanceof DiscordAPIError && error.code === 10062;
}

function isAlreadyAcknowledgedInteractionError(error: unknown): boolean {
  return error instanceof DiscordAPIError && error.code === 40060;
}

function isCertNotYetValid(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "CERT_NOT_YET_VALID"
  );
}

export class ControlBot {
  private readonly client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
  });

  constructor(
    private readonly manager: BotManager,
    private readonly subscriptionRepo: SubscriptionRepository
  ) {}

  async start(): Promise<void> {
    this.client.on(Events.Error, (error) => {
      logger.error("Control client error", { error: error.message });
    });
    this.client.on(Events.ShardError, (error, shardId) => {
      logger.error("Control shard error", { error: error.message, shardId });
    });

    this.client.once(Events.ClientReady, async () => {
      logger.info("Control bot ready", { tag: this.client.user?.tag });
      const guild = await this.client.guilds.fetch(env.defaultGuildId);
      await guild.commands.set(controlCommands);
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.handleSlash(interaction);
          return;
        }
        if (interaction.isButton()) {
          await this.handleButton(interaction);
          return;
        }
        if (interaction.isChannelSelectMenu()) {
          await this.handleChannelSelect(interaction);
          return;
        }
        if (interaction.isStringSelectMenu()) {
          await this.handleStringSelect(interaction);
          return;
        }
        if (interaction.isModalSubmit()) {
          await this.handleModal(interaction);
        }
      } catch (error) {
        if (isUnknownInteractionError(error)) {
          logger.warn("Control interaction expired", {
            interactionId: interaction.id,
            interactionType: interaction.type
          });
          return;
        }
        if (isAlreadyAcknowledgedInteractionError(error)) {
          return;
        }

        logger.error("Control interaction error", { error: (error as Error).message });
        await this.safeInteractionErrorReply(interaction);
      }
    });

    await this.loginWithRetry();
  }

  private async loginWithRetry(): Promise<void> {
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        await this.client.login(env.controlBotToken);
        return;
      } catch (error) {
        if (!isCertNotYetValid(error) || attempt === 10) {
          throw error;
        }
        logger.warn("Control login TLS certificate not yet valid, retrying", { attempt });
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async safeInteractionErrorReply(interaction: any): Promise<void> {
    try {
      if (interaction.deferred) {
        await interaction.editReply("Something went wrong.");
        return;
      }
      if (!interaction.replied) {
        await interaction.reply({ content: "Something went wrong.", flags: MessageFlags.Ephemeral });
      }
    } catch (error) {
      if (!isUnknownInteractionError(error) && !isAlreadyAcknowledgedInteractionError(error)) {
        logger.warn("Control interaction fallback reply failed", { error: (error as Error).message });
      }
    }
  }

  private isAdmin(userId: string): boolean {
    const adminIds = (process.env.ADMIN_IDS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    return adminIds.includes(userId);
  }

  private async handleSlash(interaction: any): Promise<void> {
    const key = `${interaction.user.id}:${interaction.commandName}`;
    const skipCooldown = interaction.commandName === "addbot" || interaction.commandName === "listbots";
    if (!skipCooldown && !cooldown.hit(key)) {
      await interaction.reply({ content: "Slow down a bit and retry.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.commandName === "addbot") {
      if (!this.isAdmin(interaction.user.id)) {
        await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
        return;
      }
      const token = interaction.options.getString("token", true);
      const ownerId = interaction.options.getString("owner_id", true);
      const guildId = interaction.options.getString("guild_id", true).trim();
      const planDaysRaw = interaction.options.getInteger("plan_days", true);
      if (!isPlanDays(planDaysRaw)) {
        await interaction.reply({ content: "Invalid subscription plan.", flags: MessageFlags.Ephemeral });
        return;
      }
      const planDays = planDaysRaw;
      if (!/^\d{17,20}$/.test(guildId)) {
        await interaction.reply({ content: "Invalid guild ID. It should be a Discord snowflake.", flags: MessageFlags.Ephemeral });
        return;
      }
      const bot = await this.manager.addBot({
        token,
        ownerId,
        guildId,
        voiceChannelId: null,
        planDays
      });
      const sub = await this.subscriptionRepo.getActiveByBotId(bot.id);
      const shownId = sub ? toPxSubscriptionId(sub.id) : bot.id;
      await interaction.reply(`Added bot \`${shownId}\` and started it with the **${planLabel(planDays)}** plan.`);
      return;
    }

    if (interaction.commandName === "removebot") {
      if (!this.isAdmin(interaction.user.id)) {
        await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
        return;
      }
      const botRef = interaction.options.getString("bot_id", true);
      const botId = await this.manager.resolveBotId(botRef);
      const sub = await this.subscriptionRepo.getActiveByBotId(botId);
      const shownId = sub ? toPxSubscriptionId(sub.id) : botId;
      await this.manager.removeBot(botId);
      await interaction.reply(`🗑️ Removed bot \`${shownId}\`.`);
      return;
    }

    if (interaction.commandName === "listbots") {
      if (!this.isAdmin(interaction.user.id)) {
        await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
        return;
      }
      const rows = await this.manager.listBotsForAdmin();
      if (!rows.length) {
        await interaction.reply({ content: "No bots found.", flags: MessageFlags.Ephemeral });
        return;
      }

      const lines = rows.map((row) => {
        const botName = row.bot.name?.trim() || "Unnamed Bot";
        const id = row.pxId ?? row.bot.id;
        const plan = row.planDays ? planLabel(row.planDays) : "No active sub";
        const voice = row.bot.voice_channel_id ? `<#${row.bot.voice_channel_id}>` : "Not set";
        return [
          `**${botName}** (\`${id}\`)`,
          `owner: <@${row.bot.owner_id}>`,
          `status: ${row.bot.status} | runtime: ${row.bot.runtime_state ?? "unknown"}`,
          `guild: \`${row.bot.guild_id}\` | voice: ${voice}`,
          `plan: ${plan} | sub ends: ${row.subscriptionEnd ?? "N/A"}`
        ].join("\n");
      });

      await interaction.reply({
        content: lines.join("\n\n").slice(0, 1900),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.commandName === "botinfo") {
      if (!this.isAdmin(interaction.user.id)) {
        await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
        return;
      }
      const botRef = interaction.options.getString("bot_id", true);
      const botId = await this.manager.resolveBotId(botRef);
      const info = await this.manager.botInfo(botId);
      const sub = await this.subscriptionRepo.getActiveByBotId(botId);
      const shownId = sub ? toPxSubscriptionId(sub.id) : info.bot.id;
      const embed = new EmbedBuilder()
        .setTitle(`Bot ${shownId}`)
        .addFields(
          { name: "Owner", value: info.bot.owner_id, inline: true },
          { name: "Status", value: info.bot.status, inline: true },
          { name: "Runtime", value: info.bot.runtime_state ?? "unknown", inline: true },
          { name: "Voice Channel", value: info.bot.voice_channel_id ?? "Not set", inline: true },
          { name: "Subscription Plan", value: sub ? planLabel(sub.plan_days) : "No active sub", inline: true },
          { name: "Subscription End", value: info.subscriptionEnd ?? "No active sub", inline: false },
          { name: "Internal UUID", value: info.bot.id, inline: false }
        );
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.commandName === "sublookup") {
      if (!this.isAdmin(interaction.user.id)) {
        await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
        return;
      }
      const pxId = interaction.options.getString("px_id", true);
      let hit;
      try {
        hit = await this.manager.lookupSubscriptionByPxId(pxId);
      } catch (error) {
        await interaction.reply({ content: `❌ ${(error as Error).message}`, flags: MessageFlags.Ephemeral });
        return;
      }
      if (!hit) {
        await interaction.reply({ content: "No active subscription found for that PX ID.", flags: MessageFlags.Ephemeral });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("Subscription Lookup")
        .setDescription(`PX ID: **${hit.subscriptionId}**`)
        .addFields(
          { name: "Bot", value: `${hit.bot.name ?? "Unnamed Bot"} (${hit.bot.id})`, inline: false },
          { name: "Bot ID", value: hit.subscriptionId, inline: true },
          { name: "Owner", value: `<@${hit.bot.owner_id}>`, inline: true },
          { name: "Status", value: hit.bot.status, inline: true },
          { name: "Runtime", value: hit.bot.runtime_state ?? "unknown", inline: true },
          { name: "Plan", value: planLabel(hit.planDays), inline: true },
          { name: "Ends At", value: hit.endDate, inline: false },
          { name: "Remaining", value: formatRemainingTime(hit.endDate), inline: false }
        );

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.commandName === "extendsub") {
      if (!this.isAdmin(interaction.user.id)) {
        await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
        return;
      }
      const botRef = interaction.options.getString("bot_id", true);
      const botId = await this.manager.resolveBotId(botRef);
      const planDaysRaw = interaction.options.getInteger("plan_days", true);
      if (!isPlanDays(planDaysRaw)) {
        await interaction.reply({ content: "Invalid extension plan.", flags: MessageFlags.Ephemeral });
        return;
      }
      const sub = await this.manager.extendSubscription(botId, planDaysRaw);
      await interaction.reply({
        content: `Extended \`${toPxSubscriptionId(sub.id)}\` by **${planLabel(planDaysRaw)}**. New end: ${sub.end_date}`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.commandName === "pausebot") {
      if (!this.isAdmin(interaction.user.id)) {
        await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
        return;
      }
      const botRef = interaction.options.getString("bot_id", true);
      const botId = await this.manager.resolveBotId(botRef);
      const sub = await this.subscriptionRepo.getActiveByBotId(botId);
      const shownId = sub ? toPxSubscriptionId(sub.id) : botId;
      await this.manager.pauseBot(botId);
      await interaction.reply({ content: `Paused bot \`${shownId}\`.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.commandName === "resumebot") {
      if (!this.isAdmin(interaction.user.id)) {
        await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
        return;
      }
      const botRef = interaction.options.getString("bot_id", true);
      const botId = await this.manager.resolveBotId(botRef);
      const sub = await this.subscriptionRepo.getActiveByBotId(botId);
      const shownId = sub ? toPxSubscriptionId(sub.id) : botId;
      await this.manager.resumeBot(botId);
      await interaction.reply({ content: `Resumed bot \`${shownId}\`.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.commandName === "suspendbot") {
      if (!this.isAdmin(interaction.user.id)) {
        await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
        return;
      }
      const botRef = interaction.options.getString("bot_id", true);
      const botId = await this.manager.resolveBotId(botRef);
      const sub = await this.subscriptionRepo.getActiveByBotId(botId);
      const shownId = sub ? toPxSubscriptionId(sub.id) : botId;
      await this.manager.suspendBot(botId);
      await interaction.reply({ content: `Suspended bot \`${shownId}\`.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.commandName === "health") {
      if (!this.isAdmin(interaction.user.id)) {
        await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
        return;
      }

      const snapshot = await this.manager.getHealthSnapshot();
      const statusLines = Object.entries(snapshot.byStatus)
        .map(([status, count]) => `• ${status}: ${count}`)
        .join("\n");
      const unhealthy = snapshot.unhealthyBots.length
        ? snapshot.unhealthyBots.map((bot) => `• ${bot.id} | ${bot.runtime_state ?? "unknown"} | ${bot.last_error ?? "no error text"}`).join("\n")
        : "No unhealthy bots detected.";

      const embed = new EmbedBuilder()
        .setTitle("Platform Health")
        .addFields(
          { name: "Total Bots", value: String(snapshot.totalBots), inline: true },
          { name: "Active Runtimes", value: String(snapshot.activeRuntimes), inline: true },
          { name: "Status Breakdown", value: statusLines || "No bots", inline: false },
          { name: "Unhealthy Bots", value: unhealthy.slice(0, 1024), inline: false }
        );

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.commandName === "mybot") {
      const bots = await this.manager.getUserBots(interaction.user.id);
      if (!bots.length) {
        await interaction.reply({ content: "You do not have any assigned bots.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (bots.length === 1) {
        const panel = this.buildMyBotPanel(bots[0]);
        await interaction.reply({
          embeds: panel.embeds,
          components: [...panel.components, this.buildMyBotActionsRow()],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const picker = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("mybot_select")
          .setPlaceholder("Choose which bot to manage")
          .addOptions(
            bots.slice(0, 25).map((bot) => ({
              label: this.botDisplayName(bot).slice(0, 100),
              value: bot.id,
              description: `State: ${bot.status}`.slice(0, 100)
            }))
          )
      );

      const summary = new EmbedBuilder()
        .setTitle("My Bots")
        .setDescription("Select a bot from the dropdown to open its control panel, or use the action menu for bulk tools.")
        .addFields({
          name: "Available",
          value: bots.slice(0, 10).map((bot) => `• ${this.botSummaryLine(bot)} (${bot.status})`).join("\n")
        });

      await interaction.reply({
        embeds: [summary],
        components: [picker, this.buildMyBotActionsRow()],
        flags: MessageFlags.Ephemeral
      });
      return;
    }
  }

  private async handleButton(interaction: any): Promise<void> {
    const [action, botId] = interaction.customId.split(":");
    await this.manager.assertManagePermission(botId, interaction.user.id);

    if (action === "assign_voice") {
      const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`voice_select:${botId}`)
          .setPlaceholder("Select a voice channel")
          .addChannelTypes(ChannelType.GuildVoice)
      );
      await interaction.reply({ content: "Pick the voice channel:", components: [row], flags: MessageFlags.Ephemeral });
      return;
    }

    if (action === "edit_name") {
      const modal = new ModalBuilder().setCustomId(`modal_name:${botId}`).setTitle("Change Bot Name");
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("name").setLabel("New bot name").setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
      await interaction.showModal(modal);
      return;
    }

    if (action === "edit_avatar") {
      const modal = new ModalBuilder().setCustomId(`modal_avatar:${botId}`).setTitle("Change Bot Avatar");
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("avatar").setLabel("Avatar URL").setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
      await interaction.showModal(modal);
      return;
    }

    if (action === "edit_status") {
      const typeMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`status_type:${botId}`)
          .setPlaceholder("Select activity type")
          .addOptions(
            { label: "PLAYING", value: "PLAYING" },
            { label: "LISTENING", value: "LISTENING" },
            { label: "WATCHING", value: "WATCHING" },
            { label: "COMPETING", value: "COMPETING" }
          )
      );
      await interaction.reply({ content: "Select status type first:", components: [typeMenu], flags: MessageFlags.Ephemeral });
      return;
    }

    if (action === "start_bot") {
      await this.manager.start(botId);
      await this.manager.updateBotProfile(interaction.user.id, botId, { status: "active" });
      await interaction.reply({ content: "✅ Bot started.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (action === "stop_bot") {
      await this.manager.stop(botId);
      await this.manager.updateBotProfile(interaction.user.id, botId, { status: "paused" });
      await interaction.reply({ content: "🛑 Bot stopped.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (action === "sub_info") {
      const sub = await this.subscriptionRepo.getActiveByBotId(botId);
      await interaction.reply({
        content: sub ? `Subscription plan: ${planLabel(sub.plan_days)}\nSubscription ends: ${sub.end_date}` : "No active subscription.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (action === "manage_access") {
      const modal = new ModalBuilder().setCustomId(`modal_access:${botId}`).setTitle("Manage Access");
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("user_id")
            .setLabel("Discord User ID")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("role")
            .setLabel("Role: admin / viewer / remove")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
      await interaction.showModal(modal);
    }
  }

  private async handleChannelSelect(interaction: any): Promise<void> {
    const [_, botId] = interaction.customId.split(":");
    await this.manager.assertManagePermission(botId, interaction.user.id);
    const channelId = interaction.values[0];
    await this.manager.updateBotProfile(interaction.user.id, botId, { voice_channel_id: channelId });
    await interaction.reply({ content: `✅ Assigned voice channel: <#${channelId}>`, flags: MessageFlags.Ephemeral });
  }

  private async handleStringSelect(interaction: any): Promise<void> {
    if (interaction.customId === "mybot_select") {
      const botId = interaction.values[0];
      await this.manager.assertManagePermission(botId, interaction.user.id);
      const bots = await this.manager.getUserBots(interaction.user.id);
      const bot = bots.find((x) => x.id === botId);
      if (!bot) {
        await interaction.update({ content: "Bot not found or no access.", embeds: [], components: [] });
        return;
      }
      const panel = this.buildMyBotPanel(bot);
      await interaction.update({
        embeds: panel.embeds,
        components: [...panel.components, this.buildMyBotActionsRow()]
      });
      return;
    }

    if (interaction.customId === "mybot_action") {
      const action = interaction.values[0];
      if (action !== "send_all_invites") {
        await interaction.reply({ content: "Unknown action.", flags: MessageFlags.Ephemeral });
        return;
      }
      await this.sendAllBotInviteLinks(interaction);
      return;
    }

    const [action, botId] = interaction.customId.split(":");
    await this.manager.assertManagePermission(botId, interaction.user.id);
    if (action !== "status_type") {
      return;
    }
    const kind = interaction.values[0] as ActivityKind;
    const modal = new ModalBuilder().setCustomId(`modal_status_text:${botId}:${kind}`).setTitle("Status Text");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("status_text").setLabel("Status text").setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("online_status")
          .setLabel("online / idle / dnd / invisible")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
    await interaction.showModal(modal);
  }

  private async handleModal(interaction: any): Promise<void> {
    const [type, botId, kind] = interaction.customId.split(":");
    await this.manager.assertManagePermission(botId, interaction.user.id);

    if (type === "modal_name") {
      const name = interaction.fields.getTextInputValue("name");
      await this.manager.updateBotProfile(interaction.user.id, botId, { name });
      await interaction.reply({ content: "✅ Name updated.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (type === "modal_avatar") {
      const avatar = interaction.fields.getTextInputValue("avatar");
      await this.manager.updateBotProfile(interaction.user.id, botId, { avatar });
      await interaction.reply({ content: "✅ Avatar updated.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (type === "modal_access") {
      const userId = interaction.fields.getTextInputValue("user_id");
      const role = interaction.fields.getTextInputValue("role").toLowerCase();
      if (role === "remove") {
        await this.manager.revokeAccess(interaction.user.id, botId, userId);
        await interaction.reply({ content: "✅ Access removed.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (role !== "admin" && role !== "viewer") {
        await interaction.reply({ content: "Role must be admin, viewer, or remove.", flags: MessageFlags.Ephemeral });
        return;
      }
      await this.manager.grantAccess(interaction.user.id, botId, userId, role);
      await interaction.reply({ content: `✅ Access granted as ${role}.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (type === "modal_status_text") {
      const statusText = interaction.fields.getTextInputValue("status_text");
      const onlineStatus = interaction.fields.getTextInputValue("online_status") as
        | "online"
        | "idle"
        | "dnd"
        | "invisible";
      await this.manager.updateBotProfile(interaction.user.id, botId, {
        status_text: statusText,
        status_type: kind as ActivityKind,
        online_status: onlineStatus
      });
      await interaction.reply({ content: "✅ Status updated.", flags: MessageFlags.Ephemeral });
    }
  }

  private botDisplayName(bot: BotEntity): string {
    const trimmed = bot.name?.trim();
    if (trimmed) {
      return trimmed;
    }
    return "Unnamed Bot";
  }

  private botSummaryLine(bot: BotEntity): string {
    const mention = this.botMention(bot);
    if (!mention) {
      return this.botDisplayName(bot);
    }
    return `${mention} • ${this.botDisplayName(bot)}`;
  }

  private botMention(bot: BotEntity): string | null {
    const userId = this.botUserIdFromToken(bot);
    if (!userId) {
      return null;
    }
    return `<@${userId}>`;
  }

  private botUserIdFromToken(bot: BotEntity): string | null {
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

  private buildMyBotActionsRow(): ActionRowBuilder<StringSelectMenuBuilder> {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("mybot_action")
        .setPlaceholder("Quick actions")
        .addOptions({
          label: "Send all invite links",
          value: "send_all_invites",
          description: "Get invite links for every bot you can manage"
        })
    );
  }

  private buildInviteLink(bot: BotEntity): string | null {
    const clientId = this.botUserIdFromToken(bot);
    if (!clientId) {
      return null;
    }

    const scope = encodeURIComponent("bot applications.commands");
    const permissions = PermissionsBitField.Flags.Administrator.toString();
    return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=${scope}`;
  }

  private buildInviteChunks(lines: string[]): string[] {
    const chunks: string[] = [];
    let current = "Here are your bot invite links:";

    for (const line of lines) {
      const block = `\n\n${line}`;
      if (current.length + block.length > 1900) {
        chunks.push(current);
        current = `More bot invite links:\n\n${line}`;
        continue;
      }
      current += block;
    }

    chunks.push(current);
    return chunks;
  }

  private async sendAllBotInviteLinks(interaction: any): Promise<void> {
    const bots = await this.manager.getUserBots(interaction.user.id);
    if (!bots.length) {
      await interaction.reply({ content: "You do not have any assigned bots.", flags: MessageFlags.Ephemeral });
      return;
    }

    const lines = bots
      .map((bot) => {
        const invite = this.buildInviteLink(bot);
        if (!invite) {
          return null;
        }
        return `• ${this.botSummaryLine(bot)}\n${invite}`;
      })
      .filter((line): line is string => Boolean(line));

    if (!lines.length) {
      await interaction.reply({
        content: "Could not generate invite links for your bots.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const chunks = this.buildInviteChunks(lines);
    await interaction.reply({ content: chunks[0], flags: MessageFlags.Ephemeral });
    for (const chunk of chunks.slice(1)) {
      await interaction.followUp({ content: chunk, flags: MessageFlags.Ephemeral });
    }
  }

  private buildMyBotPanel(bot: BotEntity): {
    embeds: EmbedBuilder[];
    components: Array<ActionRowBuilder<ButtonBuilder>>;
  } {
    const mention = this.botMention(bot);
    const embed = new EmbedBuilder()
      .setTitle("My Bot Panel")
      .setDescription(mention ? `Managing: **${this.botDisplayName(bot)}** (${mention})` : `Managing: **${this.botDisplayName(bot)}**`)
      .addFields(
        { name: "Voice", value: bot.voice_channel_id ? `<#${bot.voice_channel_id}>` : "Not set", inline: true },
        { name: "State", value: bot.status, inline: true },
        { name: "Runtime", value: bot.runtime_state ?? "unknown", inline: true }
      );

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`assign_voice:${bot.id}`).setLabel("Assign Voice Channel").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`edit_name:${bot.id}`).setLabel("Change Name").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`edit_avatar:${bot.id}`).setLabel("Change Avatar").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`edit_status:${bot.id}`).setLabel("Change Status").setStyle(ButtonStyle.Secondary)
    );

    const buttons2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`start_bot:${bot.id}`).setLabel("Start").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`stop_bot:${bot.id}`).setLabel("Stop").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`sub_info:${bot.id}`).setLabel("Subscription").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`manage_access:${bot.id}`).setLabel("Manage Access").setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [buttons, buttons2] };
  }
}
