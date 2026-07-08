import {
  ActionRowBuilder,
  ActivityType,
  Client,
  Options,
  DiscordAPIError,
  EmbedBuilder,
  GatewayIntentBits,
  ModalBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type VoiceBasedChannel
} from "discord.js";
import { decrypt } from "../utils/crypto.js";
import { env } from "../config/env.js";
import type { BotEntity } from "../core/types.js";
import { LavalinkGuildPlayer } from "../music/lavalink-guild-player.js";
import { PermissionService } from "../services/permission-service.js";
import { logger } from "../core/logger.js";
import { CooldownGuard } from "../utils/cooldown.js";
import type { EnqueueResult, LoopMode, Track } from "../music/types.js";
import { fetchLyrics, fetchSyncedLyrics, type SyncedLyricLine } from "../music/lyrics.js";
import { toPxSubscriptionId } from "../utils/subscription-id.js";
import { formatRemainingTime } from "../utils/time-formatter.js";
import { planLabel } from "../utils/subscription-plan.js";
import { isTransientNetworkError } from "../utils/network-errors.js";

const PX_BRAND_IMAGE_URL =
  "https://cdn.discordapp.com/attachments/1399395829122465823/1492498182524108840/e72b2f4ba36509c1f3c2e751de7dc02f.png?ex=69e2243f&is=69e0d2bf&hm=452e0ba2ebeea31e88bb069a533112c0286666c2f8f2cc795e253445f3f34646&";

const SETTINGS_MENU_PREFIX = "mbset:menu";
const SETTINGS_MODAL_PREFIX = "mbset";
const MANAGE_PREFIX = "mbmanage";
const USERNAME_RETRY_AFTER_MS = 12 * 60 * 60 * 1000;
const processedMentionKeys = new Set<string>();
const VOICE_KEEP_ALIVE_INTERVAL_MS = 60_000;
const VOICE_AUTO_JOIN_JITTER_MS = 45_000;
const VOICE_JOIN_SETTLE_MS = 120_000;
const VOICE_JOIN_CONCURRENCY = 2;
const MANAGE_SESSION_TTL_MS = 15 * 60 * 1000;

interface ManageSession {
  id: string;
  ownerId: string;
  primaryBotId: string;
  selectedBotIds: string[];
  createdAt: number;
}

interface LyricsPlaybackState {
  sessionId: number;
  trackTitle: string;
  trackUrl: string;
  message: Message;
  lines: SyncedLyricLine[];
  startedAt: number;
  lastLineIndex: number;
}

const manageSessions = new Map<string, ManageSession>();

let activeVoiceJoins = 0;
const pendingVoiceJoins: Array<() => void> = [];

async function withVoiceJoinSlot<T>(operation: () => Promise<T>): Promise<T> {
  if (activeVoiceJoins >= VOICE_JOIN_CONCURRENCY) {
    await new Promise<void>((resolve) => pendingVoiceJoins.push(resolve));
  }

  activeVoiceJoins += 1;
  try {
    return await operation();
  } finally {
    setTimeout(() => {
      activeVoiceJoins = Math.max(0, activeVoiceJoins - 1);
      pendingVoiceJoins.shift()?.();
    }, 300);
  }
}

type ProfileSection = "name" | "avatar" | "banner" | "presence";

type BotProfilePatch = Partial<
  Pick<
    BotEntity,
    "voice_channel_id" | "name" | "avatar" | "banner" | "language" | "log_channel_id" | "status_text" | "status_type" | "online_status" | "status"
  >
>;

interface ManagedRuntimeActions {
  getActiveSubscription(botId: string): Promise<{ id: string; end_date: string; plan_days: number } | null>;
  updateProfile(requesterId: string, botId: string, patch: BotProfilePatch): Promise<void>;
  updateGuild(requesterId: string, botId: string, guildId: string): Promise<void>;
  grantOwner(requesterId: string, botId: string, targetUserId: string): Promise<void>;
  revokeOwner(requesterId: string, botId: string, targetUserId: string): Promise<void>;
  listOwners(requesterId: string, botId: string): Promise<string[]>;
  listOwnedBots(ownerId: string): Promise<BotEntity[]>;
  getPrimaryOwnedBot(ownerId: string): Promise<BotEntity | null>;
  updateHealth(botId: string, patch: Partial<Pick<BotEntity, "runtime_state" | "last_error" | "last_ready_at" | "last_command_at" | "health_updated_at">>): Promise<void>;
  restart(requesterId: string, botId: string): Promise<void>;
}

type MentionCommand = "setup" | "come" | "leave" | "manage";

function isUnknownInteractionError(error: unknown): boolean {
  return error instanceof DiscordAPIError && error.code === 10062;
}

function isUnknownGuildError(error: unknown): boolean {
  return error instanceof DiscordAPIError && error.code === 10004;
}

function toActivityType(kind: BotEntity["status_type"]): ActivityType {
  switch (kind) {
    case "LISTENING":
      return ActivityType.Listening;
    case "WATCHING":
      return ActivityType.Watching;
    case "COMPETING":
      return ActivityType.Competing;
    case "PLAYING":
    default:
      return ActivityType.Playing;
  }
}

export class ManagedBotRuntime {
  private readonly client: Client;
  private _player: LavalinkGuildPlayer | null = null;
  private botData: BotEntity;
  private readonly commandCooldown = new CooldownGuard(env.commandCooldownMs);
  private isStopping = false;
  private joinPromise: Promise<void> | null = null;
  private lastJoinAttemptAt = 0;
  private nextJoinAllowedAt = 0;
  private voiceJoinFailureCount = 0;
  private lastSuccessfulVoiceJoinAt = 0;
  private voiceCommandInProgress = false;
  private usernameRateLimitedUntil = 0;
  private voiceKeepAliveInterval: NodeJS.Timeout | null = null;
  private voiceKeepAliveDisabledReason: string | null = null;
  private musicAnnouncementChannelId: string | null = null;
  private lyricsUpdateTimer: NodeJS.Timeout | null = null;
  private lyricsPlaybackState: LyricsPlaybackState | null = null;
  private lyricsPlaybackSessionId = 0;

  constructor(
    bot: BotEntity,
    private readonly permissionService: PermissionService,
    private readonly runtimeActions: ManagedRuntimeActions,
    private readonly onRuntimeFault?: (botId: string, reason: string) => Promise<void>
  ) {
    this.botData = bot;
    // Player is lazily created only when it's actually needed to reduce memory usage
    this._player = null;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ],
      makeCache: Options.cacheWithLimits({
        GuildBanManager: 0,
        GuildEmojiManager: 0,
        GuildInviteManager: 0,
        GuildStickerManager: 0,
        GuildScheduledEventManager: 0,
        GuildMemberManager: 0,
        GuildMessageManager: 0,
        MessageManager: 0,
        PresenceManager: 0,
        ReactionManager: 0,
        ReactionUserManager: 0,
        StageInstanceManager: 0,
        ThreadManager: 0
      })
    });
  }

  private get player(): LavalinkGuildPlayer {
    if (!this._player) {
      this._player = new LavalinkGuildPlayer(this.botData.id, (reason) => this.handlePlayerFault(reason));
      this._player.setTrackStartHandler((track) => this.announceTrackStart(track));
    }
    return this._player;
  }

  async start(): Promise<void> {
    this.client.once("clientReady", async () => {
      const readyName = this.client.user?.username ?? this.botData.name ?? "Unnamed Bot";
      logger.info(`Managed bot ready: ${readyName}`);
      await this.updateHealth({
        runtime_state: "ready",
        last_error: null,
        last_ready_at: new Date().toISOString(),
        health_updated_at: new Date().toISOString()
      });
      try {
        await this.syncManagedCommands();
      } catch (error) {
        logger.error("Managed bot command registration failed", { botId: this.botData.id, error: (error as Error).message });
        if (isUnknownGuildError(error)) {
          await this.disableVoiceKeepAlive("Configured guild is unavailable to this bot");
        }
        await this.updateHealth({
          runtime_state: "degraded",
          last_error: (error as Error).message,
          health_updated_at: new Date().toISOString()
        });
      }
      await this.applyProfile(new Set<ProfileSection>(["presence"]));

      if (this.voiceKeepAliveDisabledReason) {
        logger.debug("Managed bot voice keep-alive skipped", {
          botId: this.botData.id,
          reason: this.voiceKeepAliveDisabledReason
        });
        return;
      }

      this.startVoiceKeepAlive();
      if (this.botData.voice_channel_id) {
        try {
          await this.wait(this.initialVoiceJoinJitterMs());
          await this.joinAssignedVoice();
        } catch (error) {
          if (isUnknownGuildError(error)) {
            await this.disableVoiceKeepAlive("Configured guild is unavailable to this bot");
          }
          logger.warn("Managed bot initial auto-join failed", {
            botId: this.botData.id,
            channelId: this.botData.voice_channel_id,
            error: (error as Error).message
          });
          await this.updateHealth({
            runtime_state: "degraded",
            last_error: (error as Error).message,
            health_updated_at: new Date().toISOString()
          });
        }
      }

      logger.debug("Managed bot voice keep-alive ready");
    });

    this.client.on("interactionCreate", async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.handleCommand(interaction);
          return;
        }
        if (interaction.isButton()) {
          await this.handleButton(interaction);
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
          logger.warn("Managed bot interaction expired", {
            botId: this.botData.id,
            interactionId: interaction.id,
            interactionType: interaction.type
          });
          return;
        }
        logger.error("Managed bot interaction error", { botId: this.botData.id, error: (error as Error).message });
        await this.updateHealth({
          runtime_state: "degraded",
          last_error: (error as Error).message,
          health_updated_at: new Date().toISOString()
        });
      }
    });

    this.client.on("messageCreate", async (message) => {
      try {
        if (await this.handlePrefixedVolume(message)) {
          return;
        }
        if (await this.handlePrefixedStop(message)) {
          return;
        }
        if (await this.handlePrefixedSkip(message)) {
          return;
        }
        if (await this.handlePrefixedPlay(message)) {
          return;
        }
        await this.handleMention(message);
      } catch (error) {
        logger.warn("Managed bot message handler failed", {
          botId: this.botData.id,
          error: (error as Error).message
        });
        await this.updateHealth({
          runtime_state: "degraded",
          last_error: (error as Error).message,
          health_updated_at: new Date().toISOString()
        });
      }
    });

    this.client.on("error", (error) => {
      logger.error("Managed bot client error", { botId: this.botData.id, error: error.message });
      void this.updateHealth({
        runtime_state: "error",
        last_error: error.message,
        health_updated_at: new Date().toISOString()
      });
    });
    this.client.on("voiceStateUpdate", async (oldState, newState) => {
      const myId = this.client.user?.id;
      if (!myId || oldState.id !== myId) {
        return;
      }
      logger.debug("Managed bot voice state update");
      if (
        this.isStopping ||
        this.joinPromise ||
        this.voiceCommandInProgress ||
        newState.channelId ||
        !this.botData.voice_channel_id ||
        this.isWithinVoiceJoinSettlePeriod()
      ) {
        return;
      }
      try {
        await this.joinAssignedVoice();
      } catch (error) {
        logger.warn("Auto-rejoin failed", { botId: this.botData.id, error: (error as Error).message });
        await this.updateHealth({
          runtime_state: "degraded",
          last_error: (error as Error).message,
          health_updated_at: new Date().toISOString()
        });
      }
    });
    this.client.on("shardDisconnect", async (event) => {
      const reason = `Shard disconnected code=${event.code}`;
      logger.warn("Managed bot shard disconnected", { botId: this.botData.id, reason });
      await this.updateHealth({
        runtime_state: "error",
        last_error: reason,
        health_updated_at: new Date().toISOString()
      });
      if (this.onRuntimeFault) {
        await this.onRuntimeFault(this.botData.id, reason);
      }
    });

    await this.client.login(decrypt(this.botData.token, env.encryptionKey));
  }

  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const key = `${this.botData.id}:${interaction.user.id}:${interaction.commandName}`;
    if (!this.commandCooldown.hit(key)) {
      await interaction.editReply(this.t("Slow down and retry in a moment.", "تمهل قليلًا ثم أعد المحاولة."));
      return;
    }

    if (!this.isPublicCommand(interaction.commandName)) {
      const roleOk = await this.permissionService.hasRole(this.botData.id, interaction.user.id, "viewer");
      if (!roleOk) {
        await interaction.editReply(this.t("❌ No access to this bot.", "❌ ليس لديك صلاحية على هذا البوت."));
        return;
      }
    }

    await this.updateHealth({ last_command_at: new Date().toISOString(), health_updated_at: new Date().toISOString() });

    if (interaction.commandName === "mybot") {
      await interaction.editReply(
        this.t(
          "Use `/mybot` from the control bot only.",
          "استخدم `/mybot` من بوت التحكم فقط."
        )
      );
      return;
    }

    if (interaction.commandName === "help") {
      await interaction.editReply({ embeds: [this.helpEmbed()] });
      await this.updateHealth({ last_command_at: new Date().toISOString(), health_updated_at: new Date().toISOString() });
      return;
    }

    if (interaction.commandName === "status") {
      await interaction.editReply({ embeds: [this.statusEmbed()] });
      await this.updateHealth({ last_command_at: new Date().toISOString(), health_updated_at: new Date().toISOString() });
      return;
    }

    if (interaction.commandName === "diagnostics") {
      await interaction.editReply({ embeds: [await this.diagnosticsEmbed()] });
      await this.updateHealth({ last_command_at: new Date().toISOString(), health_updated_at: new Date().toISOString() });
      return;
    }

    if (interaction.commandName === "setup") {
      await interaction.editReply({ embeds: [await this.botSettingsMentionEmbed()], components: [this.settingsMenuRow()] });
      await this.updateHealth({ last_command_at: new Date().toISOString(), health_updated_at: new Date().toISOString() });
      return;
    }

    const member = interaction.member;
    const userVoice = member && typeof member !== "string" && "voice" in member ? member.voice.channel : null;
    if (!userVoice || userVoice.id !== this.botData.voice_channel_id) {
      await interaction.editReply(this.t("❌ You must be in the assigned voice channel for this bot.", "❌ يجب أن تكون داخل الروم الصوتي المعيّن لهذا البوت."));
      return;
    }

    if (interaction.commandName === "play") {
      const query = interaction.options.getString("query", true);
      let result: EnqueueResult;
      try {
        result = await this.connectAndAddWithRecovery(userVoice, query, interaction.user.tag, {
          commandType: "slash",
          userId: interaction.user.id
        });
      } catch (error) {
        logger.warn("Managed bot play failed", {
          botId: this.botData.id,
          userId: interaction.user.id,
          channelId: userVoice.id,
          query,
          error: (error as Error).message
        });
        await interaction.editReply(this.t(`❌ Voice connect failed: ${(error as Error).message}`, `❌ فشل الاتصال الصوتي: ${(error as Error).message}`));
        return;
      }
      try {
        console.log(`[ManagedBot ${this.botData.id}] Processing /play for user ${interaction.user.id}: "${query}"`);
        console.log(`[ManagedBot ${this.botData.id}] /play succeeded, nowPlaying:`, result.nowPlaying?.title);
      } catch (error) {
        const errorMsg = (error as Error).message;
        console.error(`[ManagedBot ${this.botData.id}] /play failed:`, errorMsg);
        logger.warn("Managed bot play add failed", {
          botId: this.botData.id,
          userId: interaction.user.id,
          query,
          error: errorMsg
        });
        await interaction.editReply(this.t(`❌ ${errorMsg}`, `❌ ${errorMsg}`));
        return;
      }
      if (!result.nowPlaying) {
        const reason = this.player.getLastError();
        logger.warn("Managed bot play unresolved nowPlaying", {
          botId: this.botData.id,
          userId: interaction.user.id,
          query,
          reason: reason ?? "No last error provided"
        });
        await interaction.editReply(
          reason
            ? this.t(`❌ Could not start playback: ${reason}`, `❌ تعذر بدء التشغيل: ${reason}`)
            : this.t("❌ Could not start playback for that song. Try another query.", "❌ تعذر تشغيل هذا المقطع. جرّب بحثًا آخر.")
        );
        return;
      }
      this.musicAnnouncementChannelId = interaction.channelId;
      if (result.startedPlayback) {
        const announcement = await interaction.followUp({
          embeds: [this.trackEmbed(this.t("🎵 Now Playing", "🎵 يتم التشغيل الآن"), result.nowPlaying)],
          components: [this.controlMenuRow()],
          flags: undefined
        });
        void this.startLyricsUpdates(result.nowPlaying, announcement);
        await interaction.editReply(this.t(`✅ Playing: **${result.nowPlaying.title}**`, `✅ يتم التشغيل: **${result.nowPlaying.title}**`));
      } else {
        const first = result.added[0];
        await interaction.editReply(this.t(`✅ Queued: **${first?.title ?? "Track"}**`, `✅ تمت الإضافة إلى القائمة: **${first?.title ?? "مقطع"}**`));
      }
      return;
    }

    if (interaction.commandName === "skip") {
      this.player.skip();
    }
    if (interaction.commandName === "stop") {
      this.player.stop();
      await interaction.editReply({ content: this.t("⏹️ Stopped and cleared queue.", "⏹️ تم الإيقاف ومسح القائمة."), components: [] });
      return;
    }
    if (interaction.commandName === "pause") {
      await interaction.editReply(this.player.pause() ? this.t("⏸️ Paused.", "⏸️ تم الإيقاف المؤقت.") : this.t("Nothing is playing.", "لا يوجد شيء قيد التشغيل."));
      return;
    }
    if (interaction.commandName === "resume") {
      await interaction.editReply(this.player.resume() ? this.t("▶️ Resumed.", "▶️ تم استئناف التشغيل.") : this.t("Nothing to resume.", "لا يوجد ما يمكن استئنافه."));
      return;
    }
    if (interaction.commandName === "queue") {
      await interaction.followUp({ embeds: [this.queueEmbed()], components: [this.controlMenuRow()], flags: undefined });
      await interaction.editReply(this.t("✅ Posted current queue.", "✅ تم إرسال قائمة التشغيل الحالية."));
      return;
    }
    if (interaction.commandName === "nowplaying") {
      const now = this.player.getNowPlaying();
      if (!now) {
        await interaction.editReply(this.t("Nothing is playing.", "لا يوجد شيء قيد التشغيل."));
        return;
      }
      await interaction.followUp({ embeds: [this.trackEmbed(this.t("🎶 Now Playing", "🎶 يتم التشغيل الآن"), now)], components: [this.controlMenuRow()], flags: undefined });
      await interaction.editReply(this.t("✅ Posted now playing.", "✅ تم إرسال المقطع الحالي."));
      return;
    }
    if (interaction.commandName === "remove") {
      const index = interaction.options.getInteger("index", true);
      const removed = this.player.remove(index - 1);
      await interaction.editReply(removed ? this.t(`🗑️ Removed **${removed.title}**.`, `🗑️ تم حذف **${removed.title}**.`) : this.t("Invalid queue index.", "رقم العنصر في القائمة غير صحيح."));
      return;
    }
    if (interaction.commandName === "clear") {
      this.player.clear();
      await interaction.editReply(this.t("🧹 Queue cleared.", "🧹 تم مسح القائمة."));
      return;
    }
    if (interaction.commandName === "shuffle") {
      this.player.shuffle();
      await interaction.editReply(this.t("🔀 Queue shuffled.", "🔀 تم خلط القائمة."));
      return;
    }
    if (interaction.commandName === "loop") {
      const mode = interaction.options.getString("mode", true) as LoopMode;
      this.player.setLoop(mode);
      await interaction.editReply(this.t(`🔁 Loop: **${mode}**`, `🔁 التكرار: **${mode}**`));
      return;
    }
    if (interaction.commandName === "volume") {
      const value = interaction.options.getInteger("percent", true);
      this.player.setVolume(value);
      await interaction.editReply(this.t(`🔊 Volume: ${this.player.getVolume()}%`, `🔊 مستوى الصوت: ${this.player.getVolume()}%`));
      return;
    }
    if (interaction.commandName === "lyrics") {
      const now = this.player.getNowPlaying();
      if (!now) {
        await interaction.editReply(this.t("Nothing is currently playing.", "لا يوجد تشغيل حاليًا."));
        return;
      }
      const lyrics = await fetchLyrics(now);
      await interaction.editReply(
        lyrics
          ? { embeds: [new EmbedBuilder().setTitle(this.t(`📝 Lyrics: ${now.title}`, `📝 كلمات الأغنية: ${now.title}`)).setDescription(lyrics)] }
          : this.t("Lyrics not found.", "لم يتم العثور على كلمات.")
      );
    }
  }

  private async isBotStillInAssignedVoice(): Promise<boolean> {
    const assigned = this.botData.voice_channel_id;
    if (!assigned) {
      return false;
    }

    const guild = this.client.user ? this.client.guilds.cache.get(this.botData.guild_id) : null;
    if (!guild) {
      return false;
    }

    // Member cache is intentionally very limited, so fetch to avoid false negatives.
    const me = await guild.members.fetchMe().catch(() => null);
    if (me?.voice.channelId !== assigned) {
      return false;
    }

    // Discord voice state alone is not enough: the UDP/WebSocket session can die (e.g. DAVE 4017)
    // while the bot still appears connected in the guild member voice state.
    if (this.player.hasActiveVoiceSession()) {
      return true;
    }

    // Avoid reconnect churn while Lavalink is still settling after a successful join.
    return this.isWithinVoiceJoinSettlePeriod();
  }

  private isWithinVoiceJoinSettlePeriod(): boolean {
    return this.lastSuccessfulVoiceJoinAt > 0 && Date.now() - this.lastSuccessfulVoiceJoinAt < VOICE_JOIN_SETTLE_MS;
  }

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith("mctl:")) {
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const action = interaction.customId.slice("mctl:".length);

    await this.runControlAction(action, interaction);
  }

  private async runControlAction(action: string, interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<void> {
    if (action === "pause") {
      await interaction.editReply(this.player.pause() ? this.t("⏸️ Paused.", "⏸️ تم الإيقاف المؤقت.") : this.t("Nothing is playing.", "لا يوجد شيء قيد التشغيل."));
      return;
    }
    if (action === "resume") {
      await interaction.editReply(this.player.resume() ? this.t("▶️ Resumed.", "▶️ تم الاستئناف.") : this.t("Nothing to resume.", "لا يوجد ما يمكن استئنافه."));
      return;
    }
    if (action === "skip") {
      this.player.skip();
      await interaction.editReply(this.t("⏭️ Skipped.", "⏭️ تم التخطي."));
      return;
    }
    if (action === "shuffle") {
      this.player.shuffle();
      await interaction.editReply(this.t("🔀 Queue shuffled.", "🔀 تم خلط القائمة."));
      return;
    }
    if (action === "loop") {
      const order: LoopMode[] = ["off", "track", "queue"];
      const current = this.player.getLoop();
      const next = order[(order.indexOf(current) + 1) % order.length];
      this.player.setLoop(next);
      await interaction.editReply(this.t(`🔁 Loop: **${next}**`, `🔁 التكرار: **${next}**`));
      return;
    }
    if (action === "vol_down") {
      this.player.setVolume(this.player.getVolume() - 10);
      await interaction.editReply(this.t(`🔉 Volume: ${this.player.getVolume()}%`, `🔉 الصوت: ${this.player.getVolume()}%`));
      return;
    }
    if (action === "vol_up") {
      this.player.setVolume(this.player.getVolume() + 10);
      await interaction.editReply(this.t(`🔊 Volume: ${this.player.getVolume()}%`, `🔊 الصوت: ${this.player.getVolume()}%`));
      return;
    }
    if (action === "lyrics") {
      const now = this.player.getNowPlaying();
      if (!now) {
        await interaction.editReply(this.t("Nothing is currently playing.", "لا يوجد تشغيل حاليًا."));
        return;
      }
      const lyrics = await fetchLyrics(now);
      await interaction.editReply(
        lyrics
          ? { embeds: [new EmbedBuilder().setTitle(this.t(`📝 Lyrics: ${now.title}`, `📝 كلمات الأغنية: ${now.title}`)).setDescription(lyrics)] }
          : this.t("Lyrics not found.", "لم يتم العثور على كلمات.")
      );
      return;
    }
    if (action === "queue") {
      await interaction.editReply({ embeds: [this.queueEmbed()] });
      return;
    }
    if (action === "stop") {
      this.player.stop();
      await interaction.editReply(this.t("⏹️ Stopped.", "⏹️ تم الإيقاف."));
    }
  }

  private async handleStringSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    if (interaction.customId === "mctl:menu") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const action = interaction.values[0];
      await this.runControlAction(action, interaction);
      return;
    }

    if (interaction.customId.startsWith(`${MANAGE_PREFIX}:`)) {
      await this.handleManageSelect(interaction);
      return;
    }

    const [prefix, kind, botId] = interaction.customId.split(":");
    if (prefix !== SETTINGS_MODAL_PREFIX || !botId) {
      return;
    }

    if (`${prefix}:${kind}` === `${SETTINGS_MODAL_PREFIX}:voicepick`) {
      await this.permissionService.assertRole(botId, interaction.user.id, "admin");
      const channelId = interaction.values[0];
      await this.runtimeActions.updateProfile(interaction.user.id, botId, { voice_channel_id: channelId });
      await this.sendLog(`Assigned voice room changed to <#${channelId}> by <@${interaction.user.id}>.`);
      await interaction.update({
        content: this.t(`✅ Assigned voice room: <#${channelId}>`, `✅ تم تعيين الروم الصوتي: <#${channelId}>`),
        embeds: [],
        components: []
      });
      return;
    }

    if (`${prefix}:${kind}` === `${SETTINGS_MODAL_PREFIX}:activitypick`) {
      await this.permissionService.assertRole(botId, interaction.user.id, "admin");
      const selectedType = interaction.values[0] as BotEntity["status_type"];
      const mappedType = this.mapActivityType((selectedType ?? "").toUpperCase());
      if (!mappedType) {
        await interaction.reply({ content: this.t("❌ Invalid activity type.", "❌ نوع النشاط غير صالح."), flags: MessageFlags.Ephemeral });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`${SETTINGS_MODAL_PREFIX}:activitytext:${botId}:${mappedType}`)
        .setTitle(this.t("Set Status Text", "تحديد نص الحالة"));

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("status_text").setLabel(this.t("Status text", "نص الحالة")).setStyle(TextInputStyle.Short).setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    if (`${prefix}:${kind}` === `${SETTINGS_MODAL_PREFIX}:presencepick`) {
      await this.permissionService.assertRole(botId, interaction.user.id, "admin");
      const selectedStatus = interaction.values[0] as "online" | "idle" | "dnd" | "invisible";
      if (!["online", "idle", "dnd", "invisible"].includes(selectedStatus)) {
        await interaction.reply({ content: this.t("❌ Invalid status selection.", "❌ اختيار الحالة غير صالح."), flags: MessageFlags.Ephemeral });
        return;
      }

      await this.runtimeActions.updateProfile(interaction.user.id, botId, {
        online_status: selectedStatus
      });
      await this.sendLog(`Online status changed to ${selectedStatus} by <@${interaction.user.id}>.`);
      await interaction.update({
        content: this.t(`✅ Online status updated to **${selectedStatus}**.`, `✅ تم تحديث حالة الظهور إلى **${selectedStatus}**.`),
        embeds: [],
        components: []
      });
      return;
    }

    if (`${prefix}:${kind}` === `${SETTINGS_MODAL_PREFIX}:langpick`) {
      await this.permissionService.assertRole(botId, interaction.user.id, "admin");
      const selectedLang = interaction.values[0] === "en" ? "en" : "ar";
      await this.runtimeActions.updateProfile(interaction.user.id, botId, { language: selectedLang });
      await this.sendLog(`Language changed to ${selectedLang.toUpperCase()} by <@${interaction.user.id}>.`);
      await interaction.update({
        content: selectedLang === "en" ? "✅ Language set to **EN**." : "✅ تم تغيير اللغة إلى **AR**.",
        embeds: [],
        components: []
      });
      return;
    }

    if (`${prefix}:${kind}` === `${SETTINGS_MODAL_PREFIX}:logpick`) {
      await this.permissionService.assertRole(botId, interaction.user.id, "admin");
      const selected = interaction.values[0];
      const channelId = selected === "none" ? null : selected;
      await this.runtimeActions.updateProfile(interaction.user.id, botId, { log_channel_id: channelId });
      if (channelId) {
        await this.sendLog(`Log channel updated to <#${channelId}> by <@${interaction.user.id}>.`);
      }
      await interaction.update({
        content: channelId ? this.t(`✅ Log channel set to <#${channelId}>.`, `✅ تم تعيين قناة السجلات إلى <#${channelId}>.`) : this.t("✅ Log channel disabled.", "✅ تم تعطيل قناة السجلات."),
        embeds: [],
        components: []
      });
      return;
    }

    if (`${prefix}:${kind}` !== SETTINGS_MENU_PREFIX) {
      return;
    }

    if (botId !== this.botData.id) {
      await interaction.reply({ content: this.t("This settings panel is outdated.", "لوحة الإعدادات هذه قديمة."), flags: MessageFlags.Ephemeral });
      return;
    }

    const roleOk = await this.permissionService.hasRole(botId, interaction.user.id, "viewer");
    if (!roleOk) {
      await interaction.reply({ content: this.t("❌ No access to this bot.", "❌ ليس لديك صلاحية على هذا البوت."), flags: MessageFlags.Ephemeral });
      return;
    }

    const selected = interaction.values[0];
    if (selected === "assign_voice_room") {
      await this.permissionService.assertRole(botId, interaction.user.id, "admin");
      if (!interaction.guild) {
        await interaction.reply({ content: this.t("❌ Guild context is required.", "❌ يجب استخدام هذا داخل السيرفر."), flags: MessageFlags.Ephemeral });
        return;
      }

      const channels = await interaction.guild.channels.fetch();
      const voiceChannels = channels
        .filter((ch): ch is NonNullable<typeof ch> => Boolean(ch))
        .filter((ch) => ch.isVoiceBased())
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .first(25);

      if (!voiceChannels.length) {
        await interaction.reply({ content: this.t("❌ No voice rooms found in this server.", "❌ لا توجد غرف صوتية في هذا السيرفر."), flags: MessageFlags.Ephemeral });
        return;
      }

      const menu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${SETTINGS_MODAL_PREFIX}:voicepick:${botId}`)
          .setPlaceholder(this.t("Select a voice room", "اختر رومًا صوتيًا"))
          .addOptions(
            voiceChannels.map((channel) => ({
              label: channel.name.slice(0, 100),
              value: channel.id,
              description: this.t(`Assign ${this.botData.name ?? "bot"} to this room`, `تعيين ${this.botData.name ?? "البوت"} إلى هذا الروم`).slice(0, 100)
            }))
          )
      );

      await interaction.reply({
        content: this.t("Choose the voice room to assign:", "اختر الروم الصوتي المراد تعيينه:"),
        components: [menu],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (selected === "change_name") {
      const modal = new ModalBuilder().setCustomId(`${SETTINGS_MODAL_PREFIX}:name:${botId}`).setTitle(this.t("Change Bot Name", "تغيير اسم البوت"));
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("name").setLabel(this.t("New bot name", "اسم البوت الجديد")).setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
      await interaction.showModal(modal);
      return;
    }

    if (selected === "change_avatar") {
      const modal = new ModalBuilder().setCustomId(`${SETTINGS_MODAL_PREFIX}:avatar:${botId}`).setTitle(this.t("Change Bot Avatar", "تغيير صورة البوت"));
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("avatar").setLabel(this.t("Avatar URL", "رابط الصورة")).setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
      await interaction.showModal(modal);
      return;
    }

    if (selected === "change_banner") {
      const modal = new ModalBuilder().setCustomId(`${SETTINGS_MODAL_PREFIX}:banner:${botId}`).setTitle(this.t("Change Bot Banner", "تغيير بانر البوت"));
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("banner").setLabel(this.t("Banner URL", "رابط البانر")).setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
      await interaction.showModal(modal);
      return;
    }

    if (selected === "change_activity") {
      await this.permissionService.assertRole(botId, interaction.user.id, "admin");
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${SETTINGS_MODAL_PREFIX}:activitypick:${botId}`)
          .setPlaceholder(this.t("Choose activity type", "اختر نوع النشاط"))
          .addOptions(
            {
              label: this.t("Playing", "Playing"),
              value: "PLAYING",
              description: this.t("Shows as Playing ...", "تظهر كـ Playing ..."),
              emoji: { id: "1494408668278558800", name: "gamecontroller" }
            },
            {
              label: this.t("Listening", "Listening"),
              value: "LISTENING",
              description: this.t("Shows as Listening to ...", "تظهر كـ Listening to ..."),
              emoji: { id:"1494408642735374386", name: "headphone" }
            },
            {
              label: this.t("Watching", "Watching"),
              value: "WATCHING",
              description: this.t("Shows as Watching ...", "تظهر كـ Watching ..."),
              emoji: { id:"1494408618357821650", name: "view" }
            },
            {
              label: this.t("Competing", "Competing"),
              value: "COMPETING",
              description: this.t("Shows as Competing in ...", "تظهر كـ Competing in ..."),
              emoji: { id:"1494408594991350071", name: "trophy~1" }
            }
          )
      );

      await interaction.reply({
        content: this.t("Choose status type first, then write the text.", "اختر نوع الحالة أولًا ثم اكتب النص."),
        components: [row],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (selected === "change_presence") {
      await this.permissionService.assertRole(botId, interaction.user.id, "admin");
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${SETTINGS_MODAL_PREFIX}:presencepick:${botId}`)
          .setPlaceholder(this.t("Choose online status", "اختر حالة الظهور"))
          .addOptions(
            { label: this.t("Online", "متصل"), value: "online", emoji: { id: "1494403344620326912", name: "smiles" } },
            { label: this.t("Idle", "خامل"), value: "idle", emoji: { id: "1494403321052794910", name: "spooky" } },
            { label: this.t("Do Not Disturb", "عدم الإزعاج"), value: "dnd", emoji: { id: "1494403367022104718", name: "confused~1" } },
            { label: this.t("Offline", "غير متصل"), value: "invisible", emoji: { id:"1494403300169093333", name: "eyeem" } }
          )
      );

      await interaction.reply({
        content: this.t("Pick online status from the menu:", "اختر حالة الظهور من القائمة:"),
        components: [row],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (selected === "change_guild") {
      const modal = new ModalBuilder().setCustomId(`${SETTINGS_MODAL_PREFIX}:guild:${botId}`).setTitle(this.t("Change Bot Guild", "تغيير سيرفر البوت"));
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("guild_id").setLabel(this.t("New Guild ID", "معرف السيرفر الجديد")).setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
      await interaction.showModal(modal);
      return;
    }

    if (selected === "owner_manage") {
      const modal = new ModalBuilder().setCustomId(`${SETTINGS_MODAL_PREFIX}:owner:${botId}`).setTitle(this.t("Add or Remove Owner", "إضافة أو إزالة مالك"));
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("owner_action").setLabel(this.t("Action: add / remove", "الإجراء: add / remove")).setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("user_id").setLabel(this.t("Discord User ID", "معرف مستخدم ديسكورد")).setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
      await interaction.showModal(modal);
      return;
    }

    if (selected === "owner_list") {
      const owners = await this.runtimeActions.listOwners(interaction.user.id, botId);
      const content = owners.length ? owners.map((id, idx) => `${idx + 1}. <@${id}>`).join("\n") : this.t("No owners found.", "لا يوجد ملاك.");
      await interaction.reply({ content: `${this.t("👥 Bot owners:", "👥 ملاك البوت:")}\n${content}`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (selected === "language") {
      await this.permissionService.assertRole(botId, interaction.user.id, "admin");
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${SETTINGS_MODAL_PREFIX}:langpick:${botId}`)
          .setPlaceholder(this.t("Choose language", "اختر اللغة"))
          .addOptions(
            {
              label: this.t("Arabic (AR)", "العربية (AR)"),
              value: "ar",
              description: this.t("Default", "الافتراضي")
            },
            {
              label: this.t("English (EN)", "الإنجليزية (EN)"),
              value: "en",
              description: this.t("English responses", "الردود باللغة الإنجليزية")
            }
          )
      );
      await interaction.reply({ content: this.t("Select bot language:", "اختر لغة البوت:"), components: [row], flags: MessageFlags.Ephemeral });
      return;
    }

    if (selected === "log_channel") {
      await this.permissionService.assertRole(botId, interaction.user.id, "admin");
      if (!interaction.guild) {
        await interaction.reply({ content: this.t("❌ Guild context is required.", "❌ يجب استخدام هذا داخل السيرفر."), flags: MessageFlags.Ephemeral });
        return;
      }

      const channels = await interaction.guild.channels.fetch();
      const textChannels = channels
        .filter((ch): ch is NonNullable<typeof ch> => Boolean(ch))
        .filter((ch) => ch.isTextBased() && !ch.isVoiceBased())
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .first(24);

      const options = [
        {
          label: this.t("Disable log channel", "تعطيل قناة السجلات"),
          value: "none",
          description: this.t("Stop bot log messages", "إيقاف رسائل سجل البوت")
        },
        ...textChannels.map((ch) => ({
          label: ch.name.slice(0, 100),
          value: ch.id,
          description: this.t("Send bot logs here", "إرسال سجلات البوت هنا")
        }))
      ];

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${SETTINGS_MODAL_PREFIX}:logpick:${botId}`)
          .setPlaceholder(this.t("Select a log channel", "اختر قناة السجلات"))
          .addOptions(options)
      );

      await interaction.reply({ content: this.t("Choose where bot logs are sent:", "اختر أين يتم إرسال سجلات البوت:"), components: [row], flags: MessageFlags.Ephemeral });
      return;
    }

    if (selected === "restart_bot") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await this.runtimeActions.restart(interaction.user.id, botId);
      await interaction.editReply(this.t("♻️ Restart requested. Bot should be back in a few seconds.", "♻️ تم طلب إعادة التشغيل. سيعود البوت خلال ثوانٍ."));
      return;
    }

  }

  private async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    if (interaction.customId.startsWith(`${MANAGE_PREFIX}:`)) {
      await this.handleManageModal(interaction);
      return;
    }

    const [prefix, action, botId, actionArg] = interaction.customId.split(":");
    if (prefix !== SETTINGS_MODAL_PREFIX) {
      return;
    }

    if (botId !== this.botData.id) {
      await interaction.reply({ content: this.t("This settings panel is outdated.", "لوحة الإعدادات هذه قديمة."), flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (action === "activitytext") {
      const statusText = interaction.fields.getTextInputValue("status_text").trim();
      const mappedType = this.mapActivityType((actionArg ?? "").toUpperCase());
      if (!mappedType) {
        await interaction.editReply(this.t("❌ Invalid activity type.", "❌ نوع النشاط غير صالح."));
        return;
      }

      await this.runtimeActions.updateProfile(interaction.user.id, botId, {
        status_type: mappedType,
        status_text: statusText
      });
      await this.sendLog(`Bot activity updated (${mappedType}: ${statusText}) by <@${interaction.user.id}>.`);
      await interaction.editReply(this.t("✅ Bot status updated.", "✅ تم تحديث حالة البوت."));
      return;
    }

    if (action === "name") {
      const name = interaction.fields.getTextInputValue("name").trim();
      await this.runtimeActions.updateProfile(interaction.user.id, botId, { name });
      await interaction.editReply(this.t("✅ Bot name updated.", "✅ تم تحديث اسم البوت."));
      return;
    }

    if (action === "avatar") {
      const avatar = interaction.fields.getTextInputValue("avatar").trim();
      await this.runtimeActions.updateProfile(interaction.user.id, botId, { avatar });
      await this.sendLog(`Bot avatar updated by <@${interaction.user.id}>.`);
      await interaction.editReply(this.t("✅ Bot avatar updated.", "✅ تم تحديث صورة البوت."));
      return;
    }

    if (action === "banner") {
      const banner = interaction.fields.getTextInputValue("banner").trim();
      await this.runtimeActions.updateProfile(interaction.user.id, botId, { banner });
      await this.sendLog(`Bot banner updated by <@${interaction.user.id}>.`);
      await interaction.editReply(this.t("✅ Bot banner updated.", "✅ تم تحديث بانر البوت."));
      return;
    }

    if (action === "activity") {
      const rawType = interaction.fields.getTextInputValue("activity_type").trim().toUpperCase();
      const statusText = interaction.fields.getTextInputValue("activity_text").trim();
      const mappedType = this.mapActivityType(rawType);
      if (!mappedType) {
        await interaction.editReply(this.t("❌ Invalid activity type. Use playing/listening/watching/competing.", "❌ نوع النشاط غير صالح. استخدم playing/listening/watching/competing."));
        return;
      }

      await this.runtimeActions.updateProfile(interaction.user.id, botId, {
        status_type: mappedType,
        status_text: statusText
      });
      await interaction.editReply(this.t("✅ Bot activity updated.", "✅ تم تحديث نشاط البوت."));
      return;
    }

    if (action === "presence") {
      const rawPresence = interaction.fields.getTextInputValue("presence").trim().toLowerCase();
      const normalized = rawPresence === "offline" ? "invisible" : rawPresence;
      if (!["online", "idle", "dnd", "invisible"].includes(normalized)) {
        await interaction.editReply(this.t("❌ Invalid status. Use online, idle, dnd, or offline.", "❌ حالة غير صالحة. استخدم online أو idle أو dnd أو offline."));
        return;
      }

      await this.runtimeActions.updateProfile(interaction.user.id, botId, {
        online_status: normalized as "online" | "idle" | "dnd" | "invisible"
      });
      await interaction.editReply(this.t("✅ Online status updated.", "✅ تم تحديث حالة الظهور."));
      return;
    }

    if (action === "guild") {
      const guildId = interaction.fields.getTextInputValue("guild_id").trim();
      if (!/^\d{17,20}$/.test(guildId)) {
        await interaction.editReply(this.t("❌ Invalid guild ID format.", "❌ صيغة معرف السيرفر غير صحيحة."));
        return;
      }
      await this.runtimeActions.updateGuild(interaction.user.id, botId, guildId);
      await interaction.editReply(this.t("✅ Guild updated and bot restart requested.", "✅ تم تحديث السيرفر وطلب إعادة تشغيل البوت."));
      return;
    }

    if (action === "owner") {
      const ownerAction = interaction.fields.getTextInputValue("owner_action").trim().toLowerCase();
      const userId = interaction.fields.getTextInputValue("user_id").trim();
      if (!/^\d{17,20}$/.test(userId)) {
        await interaction.editReply(this.t("❌ Invalid user ID format.", "❌ صيغة معرف المستخدم غير صحيحة."));
        return;
      }

      if (ownerAction === "add") {
        await this.runtimeActions.grantOwner(interaction.user.id, botId, userId);
        await interaction.editReply(this.t("✅ Owner added.", "✅ تمت إضافة المالك."));
        return;
      }
      if (ownerAction === "remove") {
        await this.runtimeActions.revokeOwner(interaction.user.id, botId, userId);
        await interaction.editReply(this.t("✅ Owner removed.", "✅ تمت إزالة المالك."));
        return;
      }

      await interaction.editReply(this.t("❌ owner_action must be add or remove.", "❌ يجب أن يكون owner_action إما add أو remove."));
      return;
    }
  }

  private async handlePrefixedPlay(message: Message): Promise<boolean> {
    if (!message.inGuild() || message.author.bot || message.guildId !== this.botData.guild_id) {
      return false;
    }

    const query = this.extractPrefixedPlayQuery(message.content);
    if (!query) {
      return false;
    }

    const userVoice = await this.getAuthorVoiceChannel(message);
    if (!userVoice) {
      return false;
    }

    if (!(await this.isTargetVoiceForMessage(message, userVoice.id))) {
      return false;
    }

    const key = `${this.botData.id}:${message.author.id}:prefix_play`;
    if (!this.commandCooldown.hit(key)) {
      await message.reply(this.t("Slow down and retry in a moment.", "تمهل قليلًا ثم أعد المحاولة."));
      return true;
    }

    let result: EnqueueResult;
    try {
      result = await this.connectAndAddWithRecovery(userVoice, query, message.author.tag, {
        commandType: "prefix",
        userId: message.author.id
      });
    } catch (error) {
      logger.warn("Managed bot prefix play connect failed", {
        botId: this.botData.id,
        userId: message.author.id,
        channelId: userVoice.id,
        query,
        error: this.toErrorMessage(error)
      });
      await this.replyWithFallback(
        message,
        this.t(
          `❌ Voice connect failed: ${this.toErrorMessage(error)}`,
          `❌ فشل الاتصال الصوتي: ${this.toErrorMessage(error)}`
        )
      );
      return true;
    }

    this.musicAnnouncementChannelId = message.channelId;

    try {
      console.log(`[ManagedBot ${this.botData.id}] Processing prefix play for user ${message.author.id}: "${query}"`);
      console.log(`[ManagedBot ${this.botData.id}] prefix play succeeded, nowPlaying:`, result.nowPlaying?.title);
    } catch (error) {
      const errorMsg = this.toErrorMessage(error);
      console.error(`[ManagedBot ${this.botData.id}] prefix play failed:`, errorMsg);
      logger.warn("Managed bot prefix play add failed", {
        botId: this.botData.id,
        userId: message.author.id,
        query,
        error: errorMsg
      });
      await this.replyWithFallback(message, this.t(`❌ ${errorMsg}`, `❌ ${errorMsg}`));
      return true;
    }
    if (!result.nowPlaying) {
      const reason = this.player.getLastError();
      logger.warn("Managed bot prefix play unresolved nowPlaying", {
        botId: this.botData.id,
        userId: message.author.id,
        query,
        reason: reason ?? "No last error provided"
      });
      await message.reply(
        reason
          ? this.t(`❌ Could not start playback: ${reason}`, `❌ تعذر بدء التشغيل: ${reason}`)
          : this.t("❌ Could not start playback for that song. Try another query.", "❌ تعذر تشغيل هذا المقطع. جرّب بحثًا آخر.")
      );
      return true;
    }

    if (result.startedPlayback) {
      const announcement = await message.reply({
        content: this.t(`✅ Playing: **${result.nowPlaying.title}**`, `✅ يتم التشغيل: **${result.nowPlaying.title}**`),
        embeds: [this.trackEmbed(this.t("🎵 Now Playing", "🎵 يتم التشغيل الآن"), result.nowPlaying)],
        components: [this.controlMenuRow()]
      });
      void this.startLyricsUpdates(result.nowPlaying, announcement);
      return true;
    }

    const first = result.added[0];
    await message.reply(
      this.t(
        `✅ Queued: **${first?.title ?? "Track"}**`,
        `✅ تمت الإضافة إلى القائمة: **${first?.title ?? "مقطع"}**`
      )
    );
    return true;
  }

  private async handlePrefixedSkip(message: Message): Promise<boolean> {
    if (!message.inGuild() || message.author.bot || message.guildId !== this.botData.guild_id) {
      return false;
    }

    if (!/^س$/u.test(message.content.trim())) {
      return false;
    }

    const userVoice = await this.getAuthorVoiceChannel(message);
    if (!userVoice) {
      return false;
    }

    if (!(await this.isTargetVoiceForMessage(message, userVoice.id))) {
      return false;
    }

    const key = `${this.botData.id}:${message.author.id}:prefix_skip`;
    if (!this.commandCooldown.hit(key)) {
      await message.reply(this.t("Slow down and retry in a moment.", "تمهل قليلًا ثم أعد المحاولة."));
      return true;
    }

    this.player.skip();
    await message.reply(this.t("⏭️ Skipped.", "⏭️ تم التخطي."));
    return true;
  }

  private async handlePrefixedStop(message: Message): Promise<boolean> {
    if (!message.inGuild() || message.author.bot || message.guildId !== this.botData.guild_id) {
      return false;
    }

    if (!/^s$/iu.test(message.content.trim())) {
      return false;
    }

    const userVoice = await this.getAuthorVoiceChannel(message);
    if (!userVoice) {
      return false;
    }

    if (!(await this.isTargetVoiceForMessage(message, userVoice.id))) {
      return false;
    }

    const key = `${this.botData.id}:${message.author.id}:prefix_stop`;
    if (!this.commandCooldown.hit(key)) {
      await message.reply(this.t("Slow down and retry in a moment.", "تمهل قليلًا ثم أعد المحاولة."));
      return true;
    }

    this.player.stop();
    await message.reply(this.t("⏹️ Stopped and cleared queue.", "⏹️ تم الإيقاف ومسح القائمة."));
    return true;
  }

  private async handlePrefixedVolume(message: Message): Promise<boolean> {
    if (!message.inGuild() || message.author.bot || message.guildId !== this.botData.guild_id) {
      return false;
    }

    const match = /^(v|ص)\s+([0-9٠-٩]{1,3})$/iu.exec(message.content.trim());
    if (!match) {
      return false;
    }

    const value = this.parseLocalizedInteger(match[2] ?? "");
    if (value === null) {
      return false;
    }

    const userVoice = await this.getAuthorVoiceChannel(message);
    if (!userVoice) {
      return false;
    }

    if (!(await this.isTargetVoiceForMessage(message, userVoice.id))) {
      return false;
    }

    const key = `${this.botData.id}:${message.author.id}:prefix_volume`;
    if (!this.commandCooldown.hit(key)) {
      await message.reply(this.t("Slow down and retry in a moment.", "تمهل قليلًا ثم أعد المحاولة."));
      return true;
    }

    this.player.setVolume(value);
    await message.reply(this.t(`🔊 Volume: ${this.player.getVolume()}%`, `🔊 مستوى الصوت: ${this.player.getVolume()}%`));
    return true;
  }

  private parseLocalizedInteger(value: string): number | null {
    if (!value) {
      return null;
    }
    const normalized = value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
    if (!/^\d+$/.test(normalized)) {
      return null;
    }
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private extractPrefixedPlayQuery(content: string): string | null {
    const trimmed = content.trim();
    const match = /^(p|ش)\s+(.+)$/iu.exec(trimmed);
    if (!match) {
      return null;
    }

    const rawQuery = match[2]?.trim();
    if (!rawQuery) {
      return null;
    }

    if (
      rawQuery.length >= 2 &&
      ((rawQuery.startsWith("\"") && rawQuery.endsWith("\"")) || (rawQuery.startsWith("'") && rawQuery.endsWith("'")))
    ) {
      return rawQuery.slice(1, -1).trim();
    }

    return rawQuery;
  }

  private isPublicCommand(commandName: string): boolean {
    switch (commandName) {
      case "play":
      case "skip":
      case "stop":
      case "pause":
      case "resume":
      case "queue":
      case "nowplaying":
      case "remove":
      case "clear":
      case "shuffle":
      case "loop":
      case "volume":
      case "lyrics":
      case "help":
      case "status":
      case "diagnostics":
        return true;
      default:
        return false;
    }
  }

  private async isTargetVoiceForMessage(message: Message, channelId: string): Promise<boolean> {
    if (this.botData.voice_channel_id === channelId) {
      return true;
    }

    const me = this.client.user;
    if (!me || !message.guild) {
      return false;
    }

    const botMember =
      message.guild.members.me?.id === me.id
        ? message.guild.members.me
        : await message.guild.members.fetch(me.id).catch(() => null);

    return botMember?.voice.channelId === channelId;
  }

  private async handleMention(message: Message): Promise<void> {
    if (!message.inGuild() || message.author.bot || message.guildId !== this.botData.guild_id) {
      return;
    }
    const me = this.client.user;
    if (!me || !message.mentions.users.has(me.id)) {
      return;
    }

    const mentionCommand = this.extractMentionCommand(message.content, me.id);

    const mentionKey = `${this.botData.id}:${message.id}`;
    if (processedMentionKeys.has(mentionKey)) {
      return;
    }
    processedMentionKeys.add(mentionKey);
    setTimeout(() => {
      processedMentionKeys.delete(mentionKey);
    }, 2 * 60 * 1000);

    const key = `${this.botData.id}:${message.author.id}:${mentionCommand ?? "mention_settings"}`;
    if (!this.commandCooldown.hit(key)) {
      return;
    }

    if (mentionCommand) {
      await this.handleMentionCommand(message, mentionCommand);
      return;
    }

    const roleOk = await this.permissionService.hasRole(this.botData.id, message.author.id, "viewer");
    if (!roleOk) {
      return;
    }

    await message.reply({ embeds: [await this.botSettingsMentionEmbed()], components: [this.settingsMenuRow()] });
  }

  private extractMentionCommand(content: string, botUserId: string): MentionCommand | null {
    const mentionPattern = new RegExp(`<@!?${botUserId}>`, "gi");
    const stripped = content.replace(mentionPattern, " ").trim().toLowerCase();
    if (!stripped) {
      return null;
    }

    const firstTokenRaw = stripped.split(/\s+/)[0] ?? "";
    const firstToken = firstTokenRaw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

    const setupAliases = new Set(["setup", "set", "config", "اعداد", "إعداد", "جهز", "تجهيز"]);
    const comeAliases = new Set(["come", "join", "تعال", "ادخل", "انضم"]);
    const leaveAliases = new Set(["leave", "خروج", "اخرج", "غادر", "اطلع"]);

    const manageAliases = new Set(["manage", "manager", "إدارة", "ادارة"]);

    if (setupAliases.has(firstToken)) {
      return "setup";
    }
    if (comeAliases.has(firstToken)) {
      return "come";
    }
    if (leaveAliases.has(firstToken)) {
      return "leave";
    }
    if (manageAliases.has(firstToken)) {
      return "manage";
    }
    return null;
  }

  private async handleMentionCommand(message: Message, command: MentionCommand): Promise<void> {
    const adminOk = await this.permissionService.hasRole(this.botData.id, message.author.id, "admin");
    if (!adminOk) {
      await message.reply(this.t("❌ You need admin access to use this bot command.", "❌ تحتاج صلاحية admin لاستخدام هذا الأمر."));
      return;
    }

    if (command === "manage") {
      await this.handleManageMentionCommand(message);
      return;
    }

    if (command === "leave") {
      await this.runtimeActions.updateProfile(message.author.id, this.botData.id, { voice_channel_id: null });
      this.player.stop();
      this.player.disconnect();
      await message.reply(this.t("👋 Left voice and removed assigned channel.", "👋 تم الخروج من الروم وإلغاء التعيين."));
      await this.sendLog(`Voice assignment removed by <@${message.author.id}>.`);
      return;
    }

    const userVoice = await this.getAuthorVoiceChannel(message);
    if (!userVoice) {
      await message.reply(this.t("❌ Join a voice channel first, then try again.", "❌ ادخل روم صوتي أولاً ثم أعد المحاولة."));
      return;
    }

    if (command === "come") {
      await this.runtimeActions.updateProfile(message.author.id, this.botData.id, { voice_channel_id: userVoice.id });
      await message.reply(this.t(`✅ Assigned and joining ${userVoice.toString()}.`, `✅ تم التعيين والانضمام إلى ${userVoice.toString()}.`));
      await this.sendLog(`Assigned voice room changed to ${userVoice.toString()} by <@${message.author.id}>.`);
      return;
    }

    const nextName = this.voiceChannelToBotName(userVoice.name);
    await this.runtimeActions.updateProfile(message.author.id, this.botData.id, {
      voice_channel_id: userVoice.id,
      name: nextName
    });
    await message.reply(
      this.t(
        `✅ Assigned to ${userVoice.toString()} and renamed to **${nextName}**.`,
        `✅ تم التعيين إلى ${userVoice.toString()} وتغيير الاسم إلى **${nextName}**.`
      )
    );
    await this.sendLog(`Assigned voice room set to ${userVoice.toString()} and bot renamed to ${nextName} by <@${message.author.id}>.`);
  }

  private async handleManageMentionCommand(message: Message): Promise<void> {
    if (message.author.id !== this.botData.owner_id) {
      await message.reply(this.t("❌ Only the bot owner can use @bot manage.", "❌ فقط مالك البوت يمكنه استخدام @bot manage."));
      return;
    }

    const primaryBot = await this.runtimeActions.getPrimaryOwnedBot(message.author.id);
    if (!primaryBot) {
      await message.reply(this.t("❌ No owned bots were found.", "❌ لم يتم العثور على بوتات مملوكة."));
      return;
    }

    if (primaryBot.id !== this.botData.id) {
      const redirect = this.botMentionFromEntity(primaryBot) ?? `**${primaryBot.name ?? primaryBot.id}**`;
      await message.reply(
        this.t(
          `❌ Use ${redirect} for owner-wide management. This bot still supports local \`@bot setup\`.`,
          `❌ استخدم ${redirect} للإدارة الشاملة. هذا البوت ما زال يدعم \`@bot setup\` المحلي.`
        )
      );
      return;
    }

    const ownedBots = await this.runtimeActions.listOwnedBots(message.author.id);
    if (!ownedBots.length) {
      await message.reply(this.t("❌ No owned bots were found.", "❌ لم يتم العثور على بوتات مملوكة."));
      return;
    }

    const session = this.createManageSession(message.author.id, primaryBot.id, ownedBots.map((bot) => bot.id));
    await message.reply({
      embeds: [this.manageOverviewEmbed(session, ownedBots)],
      components: this.manageOverviewComponents(session, ownedBots)
    });
  }

  private createManageSession(ownerId: string, primaryBotId: string, botIds: string[]): ManageSession {
    const id = Math.random().toString(36).slice(2, 10);
    const session: ManageSession = {
      id,
      ownerId,
      primaryBotId,
      selectedBotIds: botIds,
      createdAt: Date.now()
    };
    manageSessions.set(id, session);
    setTimeout(() => {
      const existing = manageSessions.get(id);
      if (existing && Date.now() - existing.createdAt >= MANAGE_SESSION_TTL_MS) {
        manageSessions.delete(id);
      }
    }, MANAGE_SESSION_TTL_MS);
    return session;
  }

  private getManageSession(sessionId: string): ManageSession | null {
    const session = manageSessions.get(sessionId);
    if (!session) {
      return null;
    }
    if (Date.now() - session.createdAt >= MANAGE_SESSION_TTL_MS) {
      manageSessions.delete(sessionId);
      return null;
    }
    return session;
  }

  private manageOverviewEmbed(session: ManageSession, bots: BotEntity[]): EmbedBuilder {
    const selected = new Set(session.selectedBotIds);
    const lines = bots.slice(0, 10).map((bot) => {
      const marker = selected.has(bot.id) ? "•" : "◦";
      const name = bot.name ?? bot.id;
      const runtime = bot.runtime_state ?? "unknown";
      return `${marker} ${name} | ${bot.status} | ${runtime}`;
    });
    return new EmbedBuilder()
      .setTitle(this.t("Owner Manage Panel", "لوحة إدارة المالك"))
      .setDescription(
        [
          this.t(`Primary management bot: **${this.client.user?.username ?? this.botData.id}**`, `بوت الإدارة الأساسي: **${this.client.user?.username ?? this.botData.id}**`),
          this.t(`Selected bots: **${session.selectedBotIds.length}**`, `البوتات المحددة: **${session.selectedBotIds.length}**`),
          "",
          ...lines
        ].join("\n")
      )
      .setFooter({ text: this.t("Use the menus below to pick targets and apply owner-wide changes.", "استخدم القوائم بالأسفل لاختيار البوتات وتطبيق التعديلات الشاملة.") });
  }

  private manageOverviewComponents(session: ManageSession, bots: BotEntity[]): ActionRowBuilder<StringSelectMenuBuilder>[] {
    const targetOptions = bots.slice(0, 25).map((bot) => ({
      label: (bot.name ?? `Bot ${bot.id.slice(0, 8)}`).slice(0, 100),
      value: bot.id,
      description: `${bot.status} | ${bot.runtime_state ?? "unknown"}`.slice(0, 100),
      default: session.selectedBotIds.includes(bot.id)
    }));

    const targetRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${MANAGE_PREFIX}:targets:${session.id}`)
        .setPlaceholder(this.t("Choose bots to manage", "اختر البوتات للإدارة"))
        .setMinValues(1)
        .setMaxValues(Math.max(1, targetOptions.length))
        .addOptions(targetOptions)
    );

    const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${MANAGE_PREFIX}:action:${session.id}`)
        .setPlaceholder(this.t("Choose a management action", "اختر إجراء الإدارة"))
        .addOptions(
          { label: this.t("Refresh Summary", "تحديث الملخص"), value: "refresh", description: this.t("Refresh selected bot summary", "تحديث ملخص البوتات المحددة") },
          { label: this.t("Bulk Avatar", "تغيير الصورة للجميع"), value: "bulk_avatar", description: this.t("Set avatar for selected bots", "تعيين الصورة للبوتات المحددة") },
          { label: this.t("Bulk Banner", "تغيير البانر للجميع"), value: "bulk_banner", description: this.t("Set banner for selected bots", "تعيين البانر للبوتات المحددة") },
          { label: this.t("Bulk Activity", "تغيير النشاط للجميع"), value: "bulk_activity", description: this.t("Set status text and activity type", "تعيين نص الحالة ونوع النشاط") },
          { label: this.t("Bulk Presence", "تغيير الظهور للجميع"), value: "bulk_presence", description: this.t("Set online presence", "تعيين حالة الظهور") },
          { label: this.t("Bulk Language", "تغيير اللغة للجميع"), value: "bulk_language", description: this.t("Set AR or EN", "تعيين العربية أو الإنجليزية") },
          { label: this.t("Bulk Log Channel", "تغيير قناة السجل"), value: "bulk_log_channel", description: this.t("Set channel ID or disable", "تعيين قناة السجل أو تعطيلها") },
          { label: this.t("Restart Selected", "إعادة تشغيل المحدد"), value: "restart_selected", description: this.t("Restart selected bots", "إعادة تشغيل البوتات المحددة") },
          { label: this.t("Rename One Bot", "إعادة تسمية بوت واحد"), value: "single_name", description: this.t("Requires exactly one selected bot", "يتطلب تحديد بوت واحد فقط") },
          { label: this.t("Assign Voice by ID", "تعيين روم بالصوت بالآيدي"), value: "single_voice", description: this.t("Requires exactly one selected bot", "يتطلب تحديد بوت واحد فقط") },
          { label: this.t("Change Guild by ID", "تغيير السيرفر بالآيدي"), value: "single_guild", description: this.t("Requires exactly one selected bot", "يتطلب تحديد بوت واحد فقط") }
        )
    );

    return [targetRow, actionRow];
  }

  private async handleManageSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const [, kind, sessionId] = interaction.customId.split(":");
    const session = this.getManageSession(sessionId ?? "");
    if (!session || session.ownerId !== interaction.user.id) {
      await interaction.reply({
        content: this.t("This management session expired. Run @bot manage again.", "انتهت جلسة الإدارة. استخدم @bot manage مرة أخرى."),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const bots = await this.runtimeActions.listOwnedBots(session.ownerId);
    if (!bots.length) {
      await interaction.reply({
        content: this.t("No owned bots were found.", "لم يتم العثور على بوتات مملوكة."),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (kind === "targets") {
      const validIds = new Set(bots.map((bot) => bot.id));
      const selected = interaction.values.filter((value) => validIds.has(value));
      if (!selected.length) {
        await interaction.reply({
          content: this.t("Pick at least one bot to manage.", "اختر بوتاً واحداً على الأقل للإدارة."),
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      session.selectedBotIds = selected;
      session.createdAt = Date.now();
      await interaction.update({
        embeds: [this.manageOverviewEmbed(session, bots)],
        components: this.manageOverviewComponents(session, bots)
      });
      return;
    }

    const action = interaction.values[0];
    if (!action) {
      await interaction.reply({
        content: this.t("Choose a management action.", "اختر إجراء الإدارة."),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const selectedBots = bots.filter((bot) => session.selectedBotIds.includes(bot.id));
    if (!selectedBots.length) {
      await interaction.reply({
        content: this.t("The selected bots are no longer available. Refresh and try again.", "البوتات المحددة لم تعد متاحة. حدّث اللوحة ثم حاول مرة أخرى."),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (action === "refresh") {
      session.createdAt = Date.now();
      await interaction.update({
        embeds: [this.manageOverviewEmbed(session, bots)],
        components: this.manageOverviewComponents(session, bots)
      });
      return;
    }

    if (action === "restart_selected") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const restartCurrentBot = selectedBots.some((bot) => bot.id === this.botData.id);
      const otherBots = selectedBots.filter((bot) => bot.id !== this.botData.id);

      for (const bot of otherBots) {
        await this.runtimeActions.restart(interaction.user.id, bot.id);
      }

      await interaction.editReply(
        this.t(
          `Restart requested for ${selectedBots.length} bot(s).`,
          `تم طلب إعادة التشغيل لـ ${selectedBots.length} بوت.`
        )
      );

      logger.info("Owner-wide manage restart requested", {
        botId: this.botData.id,
        ownerId: interaction.user.id,
        selectedBotIds: session.selectedBotIds
      });

      if (restartCurrentBot) {
        setTimeout(() => {
          void this.runtimeActions.restart(interaction.user.id, this.botData.id).catch((error) => {
            logger.error("Primary manage bot restart failed", {
              botId: this.botData.id,
              ownerId: interaction.user.id,
              error: (error as Error).message
            });
          });
        }, 1_000);
      }

      return;
    }

    if ((action === "single_name" || action === "single_voice" || action === "single_guild") && selectedBots.length !== 1) {
      await interaction.reply({
        content: this.t("Select exactly one bot for that action.", "حدد بوتاً واحداً فقط لهذا الإجراء."),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await this.showManageActionModal(interaction, action, session, selectedBots);
  }

  private async handleManageModal(interaction: ModalSubmitInteraction): Promise<void> {
    const [, action, sessionId] = interaction.customId.split(":");
    const session = this.getManageSession(sessionId ?? "");
    if (!session || session.ownerId !== interaction.user.id) {
      await interaction.reply({
        content: this.t("This management session expired. Run @bot manage again.", "انتهت جلسة الإدارة. استخدم @bot manage مرة أخرى."),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const bots = await this.runtimeActions.listOwnedBots(session.ownerId);
    const selectedBots = bots.filter((bot) => session.selectedBotIds.includes(bot.id));
    if (!selectedBots.length) {
      await interaction.reply({
        content: this.t("The selected bots are no longer available. Refresh and try again.", "البوتات المحددة لم تعد متاحة. حدّث اللوحة ثم حاول مرة أخرى."),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const singleBot = selectedBots[0];
    const requiresSingle = action === "single_name" || action === "single_voice" || action === "single_guild";
    if (requiresSingle && selectedBots.length !== 1) {
      await interaction.reply({
        content: this.t("Select exactly one bot for that action.", "حدد بوتاً واحداً فقط لهذا الإجراء."),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (action === "bulk_avatar") {
      const avatar = interaction.fields.getTextInputValue("avatar_url").trim();
      await this.applyManageProfilePatch(interaction.user.id, selectedBots, { avatar });
      await interaction.editReply(this.t("Avatar updated for the selected bots.", "تم تحديث الصورة للبوتات المحددة."));
    } else if (action === "bulk_banner") {
      const banner = interaction.fields.getTextInputValue("banner_url").trim();
      await this.applyManageProfilePatch(interaction.user.id, selectedBots, { banner });
      await interaction.editReply(this.t("Banner updated for the selected bots.", "تم تحديث البانر للبوتات المحددة."));
    } else if (action === "bulk_activity") {
      const rawType = interaction.fields.getTextInputValue("activity_type").trim().toUpperCase();
      const statusText = interaction.fields.getTextInputValue("status_text").trim();
      const mappedType = this.mapActivityType(rawType);
      if (!mappedType) {
        await interaction.editReply(this.t("Invalid activity type. Use playing, listening, watching, or competing.", "نوع النشاط غير صالح. استخدم playing أو listening أو watching أو competing."));
        return;
      }
      await this.applyManageProfilePatch(interaction.user.id, selectedBots, {
        status_type: mappedType,
        status_text: statusText
      });
      await interaction.editReply(this.t("Activity updated for the selected bots.", "تم تحديث النشاط للبوتات المحددة."));
    } else if (action === "bulk_presence") {
      const presence = this.normalizePresence(interaction.fields.getTextInputValue("presence").trim());
      if (!presence) {
        await interaction.editReply(this.t("Invalid presence. Use online, idle, dnd, or offline.", "حالة الظهور غير صالحة. استخدم online أو idle أو dnd أو offline."));
        return;
      }
      await this.applyManageProfilePatch(interaction.user.id, selectedBots, { online_status: presence });
      await interaction.editReply(this.t("Presence updated for the selected bots.", "تم تحديث حالة الظهور للبوتات المحددة."));
    } else if (action === "bulk_language") {
      const language = this.normalizeLanguage(interaction.fields.getTextInputValue("language").trim());
      if (!language) {
        await interaction.editReply(this.t("Invalid language. Use ar or en.", "اللغة غير صالحة. استخدم ar أو en."));
        return;
      }
      await this.applyManageProfilePatch(interaction.user.id, selectedBots, { language });
      await interaction.editReply(this.t("Language updated for the selected bots.", "تم تحديث اللغة للبوتات المحددة."));
    } else if (action === "bulk_log_channel") {
      const rawChannelId = interaction.fields.getTextInputValue("log_channel_id").trim();
      const channelId = !rawChannelId || rawChannelId.toLowerCase() === "none" ? null : rawChannelId;
      if (channelId && !this.isSnowflake(channelId)) {
        await interaction.editReply(this.t("Invalid log channel ID.", "معرف قناة السجل غير صالح."));
        return;
      }
      await this.applyManageProfilePatch(interaction.user.id, selectedBots, { log_channel_id: channelId });
      await interaction.editReply(
        channelId
          ? this.t(`Log channel updated to \`${channelId}\` for the selected bots.`, `تم تحديث قناة السجل إلى \`${channelId}\` للبوتات المحددة.`)
          : this.t("Log channel disabled for the selected bots.", "تم تعطيل قناة السجل للبوتات المحددة.")
      );
    } else if (action === "single_name") {
      const name = interaction.fields.getTextInputValue("name").trim();
      await this.runtimeActions.updateProfile(interaction.user.id, singleBot.id, { name });
      await interaction.editReply(this.t(`Renamed **${singleBot.name ?? singleBot.id}**.`, `تمت إعادة تسمية **${singleBot.name ?? singleBot.id}**.`));
    } else if (action === "single_voice") {
      const rawVoiceChannelId = interaction.fields.getTextInputValue("voice_channel_id").trim();
      const voiceChannelId = !rawVoiceChannelId || rawVoiceChannelId.toLowerCase() === "none" ? null : rawVoiceChannelId;
      if (voiceChannelId && !this.isSnowflake(voiceChannelId)) {
        await interaction.editReply(this.t("Invalid voice channel ID.", "معرف الروم الصوتي غير صالح."));
        return;
      }
      await this.runtimeActions.updateProfile(interaction.user.id, singleBot.id, { voice_channel_id: voiceChannelId });
      await interaction.editReply(
        voiceChannelId
          ? this.t(`Assigned <#${voiceChannelId}> to **${singleBot.name ?? singleBot.id}**.`, `تم تعيين <#${voiceChannelId}> إلى **${singleBot.name ?? singleBot.id}**.`)
          : this.t(`Cleared the assigned voice room for **${singleBot.name ?? singleBot.id}**.`, `تمت إزالة الروم الصوتي المعيّن من **${singleBot.name ?? singleBot.id}**.`)
      );
    } else if (action === "single_guild") {
      const guildId = interaction.fields.getTextInputValue("guild_id").trim();
      if (!this.isSnowflake(guildId)) {
        await interaction.editReply(this.t("Invalid guild ID.", "معرف السيرفر غير صالح."));
        return;
      }
      await this.runtimeActions.updateGuild(interaction.user.id, singleBot.id, guildId);
      await interaction.editReply(this.t(`Guild updated for **${singleBot.name ?? singleBot.id}**.`, `تم تحديث السيرفر لـ **${singleBot.name ?? singleBot.id}**.`));
    } else {
      await interaction.editReply(this.t("Unsupported management action.", "إجراء الإدارة غير مدعوم."));
      return;
    }

    session.createdAt = Date.now();
    logger.info("Owner-wide manage action completed", {
      botId: this.botData.id,
      ownerId: interaction.user.id,
      action,
      selectedBotIds: selectedBots.map((bot) => bot.id)
    });
  }

  private async showManageActionModal(
    interaction: StringSelectMenuInteraction,
    action: string,
    session: ManageSession,
    selectedBots: BotEntity[]
  ): Promise<void> {
    const targetName = selectedBots[0]?.name ?? selectedBots[0]?.id ?? "bot";
    const modal = new ModalBuilder().setCustomId(`${MANAGE_PREFIX}:${action}:${session.id}`);

    if (action === "bulk_avatar") {
      modal
        .setTitle(this.t("Bulk Avatar", "تغيير الصورة للجميع"))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("avatar_url").setLabel(this.t("Avatar URL", "رابط الصورة")).setStyle(TextInputStyle.Short).setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (action === "bulk_banner") {
      modal
        .setTitle(this.t("Bulk Banner", "تغيير البانر للجميع"))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("banner_url").setLabel(this.t("Banner URL", "رابط البانر")).setStyle(TextInputStyle.Short).setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (action === "bulk_activity") {
      modal
        .setTitle(this.t("Bulk Activity", "تغيير النشاط للجميع"))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("activity_type")
              .setLabel(this.t("Activity type", "نوع النشاط"))
              .setPlaceholder("playing / listening / watching / competing")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("status_text").setLabel(this.t("Status text", "نص الحالة")).setStyle(TextInputStyle.Short).setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (action === "bulk_presence") {
      modal
        .setTitle(this.t("Bulk Presence", "تغيير الظهور للجميع"))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("presence")
              .setLabel(this.t("Presence", "حالة الظهور"))
              .setPlaceholder("online / idle / dnd / offline")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (action === "bulk_language") {
      modal
        .setTitle(this.t("Bulk Language", "تغيير اللغة للجميع"))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("language").setLabel(this.t("Language", "اللغة")).setPlaceholder("ar / en").setStyle(TextInputStyle.Short).setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (action === "bulk_log_channel") {
      modal
        .setTitle(this.t("Bulk Log Channel", "تغيير قناة السجل للجميع"))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("log_channel_id")
              .setLabel(this.t("Log channel ID", "معرف قناة السجل"))
              .setPlaceholder(this.t("Channel ID or none", "معرف القناة أو none"))
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (action === "single_name") {
      modal
        .setTitle(this.t(`Rename ${targetName}`, `إعادة تسمية ${targetName}`))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("name").setLabel(this.t("New name", "الاسم الجديد")).setStyle(TextInputStyle.Short).setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (action === "single_voice") {
      modal
        .setTitle(this.t(`Assign Voice for ${targetName}`, `تعيين روم صوتي لـ ${targetName}`))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("voice_channel_id")
              .setLabel(this.t("Voice channel ID", "معرف الروم الصوتي"))
              .setPlaceholder(this.t("Channel ID or none", "معرف الروم أو none"))
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (action === "single_guild") {
      modal
        .setTitle(this.t(`Change Guild for ${targetName}`, `تغيير السيرفر لـ ${targetName}`))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("guild_id").setLabel(this.t("Guild ID", "معرف السيرفر")).setStyle(TextInputStyle.Short).setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    await interaction.reply({
      content: this.t("Unsupported management action.", "إجراء الإدارة غير مدعوم."),
      flags: MessageFlags.Ephemeral
    });
  }

  private async applyManageProfilePatch(requesterId: string, bots: BotEntity[], patch: BotProfilePatch): Promise<void> {
    for (const bot of bots) {
      await this.runtimeActions.updateProfile(requesterId, bot.id, patch);
    }
  }

  private botMentionFromEntity(bot: BotEntity): string | null {
    try {
      const token = decrypt(bot.token, env.encryptionKey);
      const encodedId = token.split(".")[0];
      if (!encodedId) {
        return null;
      }
      const base64 = encodedId.replace(/-/g, "+").replace(/_/g, "/");
      const padLength = (4 - (base64.length % 4)) % 4;
      const decoded = Buffer.from(`${base64}${"=".repeat(padLength)}`, "base64").toString("utf8");
      return /^\d{17,20}$/.test(decoded) ? `<@${decoded}>` : null;
    } catch {
      return null;
    }
  }

  private async getAuthorVoiceChannel(message: Message): Promise<VoiceBasedChannel | null> {
    if (!message.guild) {
      return null;
    }

    const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
    const channel = member?.voice.channel;
    if (!channel || !channel.isVoiceBased()) {
      return null;
    }
    return channel;
  }

  private voiceChannelToBotName(channelName: string): string {
    const compact = channelName.replace(/\s+/g, " ").trim();
    if (!compact) {
      return "Voice Bot";
    }
    if (compact.length > 32) {
      return compact.slice(0, 32).trimEnd();
    }
    return compact;
  }

  private async botSettingsMentionEmbed(): Promise<EmbedBuilder> {
    const sub = await this.runtimeActions.getActiveSubscription(this.botData.id);
    const remaining = sub ? formatRemainingTime(sub.end_date) : "no active subscription";
    const pxId = sub ? toPxSubscriptionId(sub.id) : "N/A";

    return new EmbedBuilder()
      .setTitle(this.t("Bot Settings", "إعدادات البوت"))
      .setColor(0x2b2d31)
      .setDescription(
        [
          this.t(`**Bot registered to:** <@${this.botData.owner_id}>`, `**البوت مسجل لـ:** <@${this.botData.owner_id}>`),
          this.t(`**Ends in:** ${remaining}`, `**ينتهي خلال:** ${remaining}`),
          this.t(`**Subscription number:** \`${pxId}\``, `**رقم الاشتراك:** \`${pxId}\``),
          this.t(`**Language:** ${this.languageTag().toUpperCase()}`, `**اللغة:** ${this.languageTag().toUpperCase()}`)
        ].join("\n")
      )
      .setFooter({ text: "PXVault", iconURL: PX_BRAND_IMAGE_URL })
      .setTimestamp()
      .setThumbnail(PX_BRAND_IMAGE_URL);
  }

  private helpEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(this.t("Bot Help", "مساعدة البوت"))
      .setDescription(
        [
          this.t("Slash commands:", "الأوامر السلاش:"),
          "/play, /skip, /stop, /pause, /resume, /queue, /nowplaying, /remove, /clear, /shuffle, /loop, /volume, /lyrics",
          "/help, /status, /diagnostics, /setup",
          "",
          this.t("Mention commands:", "أوامر المنشن:"),
          "@bot setup, @bot come, @bot leave",
          this.t("Primary owner bot only: @bot manage", "فقط على بوت المالك الأساسي: @bot manage"),
          this.t("Quick text: p song / ش song / س / s / v 50 / ص 50", "أوامر سريعة: p song / ش song / س / s / v 50 / ص 50")
        ].join("\n")
      );
  }

  private statusEmbed(): EmbedBuilder {
    const now = this.player.getNowPlaying();
    return new EmbedBuilder()
      .setTitle(this.t("Bot Status", "حالة البوت"))
      .addFields(
        { name: this.t("Bot State", "حالة البوت"), value: this.botData.status, inline: true },
        { name: this.t("Runtime", "التشغيل"), value: this.botData.runtime_state ?? "unknown", inline: true },
        { name: this.t("Assigned Voice", "الروم المعين"), value: this.botData.voice_channel_id ? `<#${this.botData.voice_channel_id}>` : this.t("Not set", "غير معين"), inline: true },
        { name: this.t("Queue Length", "عدد القائمة"), value: String(this.player.getQueue().length), inline: true },
        { name: this.t("Now Playing", "يتم تشغيل"), value: now ? `[${now.title}](${now.url})` : this.t("Nothing playing", "لا يوجد تشغيل"), inline: false }
      )
      .setFooter({ text: this.t(`Loop: ${this.player.getLoop()} | Volume: ${this.player.getVolume()}%`, `تكرار: ${this.player.getLoop()} | الصوت: ${this.player.getVolume()}%`) });
  }

  private async diagnosticsEmbed(): Promise<EmbedBuilder> {
    const sub = await this.runtimeActions.getActiveSubscription(this.botData.id);
    const now = this.player.getNowPlaying();
    return new EmbedBuilder()
      .setTitle(this.t("Diagnostics", "التشخيص"))
      .addFields(
        { name: this.t("Runtime", "التشغيل"), value: this.botData.runtime_state ?? "unknown", inline: true },
        { name: this.t("Status", "الحالة"), value: this.botData.status, inline: true },
        { name: this.t("Plan", "الخطة"), value: sub ? planLabel(sub.plan_days) : this.t("No active sub", "لا يوجد اشتراك"), inline: true },
        { name: this.t("Last Ready", "آخر جاهزية"), value: this.botData.last_ready_at ?? this.t("Unknown", "غير معروف"), inline: false },
        { name: this.t("Last Command", "آخر أمر"), value: this.botData.last_command_at ?? this.t("Unknown", "غير معروف"), inline: false },
        { name: this.t("Last Error", "آخر خطأ"), value: this.botData.last_error ?? this.t("No recent errors", "لا توجد أخطاء حديثة"), inline: false },
        { name: this.t("Assigned Voice", "الروم المعين"), value: this.botData.voice_channel_id ? `<#${this.botData.voice_channel_id}>` : this.t("Not set", "غير معين"), inline: true },
        { name: this.t("Queue Length", "عدد القائمة"), value: String(this.player.getQueue().length), inline: true },
        { name: this.t("Now Playing", "يتم تشغيل"), value: now ? `[${now.title}](${now.url})` : this.t("Nothing playing", "لا يوجد تشغيل"), inline: false }
      );
  }

  private settingsMenuRow(): ActionRowBuilder<StringSelectMenuBuilder> {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${SETTINGS_MENU_PREFIX}:${this.botData.id}`)
        .setPlaceholder(this.t("Choose a bot setting", "اختر إعداد البوت"))
        .addOptions(
          {
            label: this.t("1 - Change bot name", "1 - تغيير اسم البوت"),
            value: "change_name",
            description: this.t("Update the bot username", "تحديث اسم المستخدم للبوت"),
            emoji: { id: "1494402105195237417", name: "edit" }
          },
          {
            label: this.t("2 - Change bot avatar", "2 - تغيير صورة البوت"),
            value: "change_avatar",
            description: this.t("Update the bot avatar URL", "تحديث رابط صورة البوت"),
            emoji: { id: "1494402088095055982", name: "addfriend" }
          },
          {
            label: this.t("3 - Change bot banner", "3 - تغيير بانر البوت"),
            value: "change_banner",
            description: this.t("Update bot banner URL", "تحديث رابط بانر البوت"),
            emoji: { id: "1494402064464351324", name: "image1" }
          },
          {
            label: this.t("4 - Assign voice room", "4 - تعيين روم صوتي"),
            value: "assign_voice_room",
            description: this.t("Pick a server voice room from a menu", "اختر رومًا صوتيًا من القائمة"),
            emoji: { id: "1494402046332370954", name: "pin" }
          },
          {
            label: this.t("5 - Change bot status text", "5 - تغيير نص حالة البوت"),
            value: "change_activity",
            description: this.t("Playing/listening/watching/competing", "Playing/listening/watching/competing"),
            emoji: { id: "1494402028875681943", name: "love" }
          },
          {
            label: this.t("6 - Change online status", "6 - تغيير حالة الظهور"),
            value: "change_presence",
            description: this.t("online / idle / dnd / offline", "online / idle / dnd / offline"),
            emoji: { id: "1494403344620326912", name: "smiles" }
          },
          {
            label: this.t("7 - Change bot guild server", "7 - تغيير سيرفر البوت"),
            value: "change_guild",
            description: this.t("Move bot to another guild ID", "نقل البوت إلى معرف سيرفر آخر"),
            emoji: { id: "1494401984093224970", name: "home" }
          },
          {
            label: this.t("8 - Add/remove bot owner", "8 - إضافة/إزالة مالك"),
            value: "owner_manage",
            description: this.t("Manage owner access", "إدارة صلاحيات الملاك"),
            emoji: { id: "1494402105195237417", name: "edit" }
          },
          {
            label: this.t("9 - Show bot owners", "9 - عرض ملاك البوت"),
            value: "owner_list",
            description: this.t("List all owner IDs", "عرض جميع معرفات الملاك"),
            emoji: { id: "1494401947946713208", name: "group" }
          },
          {
            label: this.t("10 - Language", "10 - اللغة"),
            value: "language",
            description: this.t(`Current: ${this.languageTag().toUpperCase()}`, `الحالية: ${this.languageTag().toUpperCase()}`),
            emoji: { id: "1494401931068838000", name: "placeholder" }
          },
          {
            label: this.t("11 - Log channel", "11 - قناة السجلات"),
            value: "log_channel",
            description: this.botData.log_channel_id
              ? this.t(`Current: #${this.botData.log_channel_id}`, `الحالية: #${this.botData.log_channel_id}`)
              : this.t("Set channel for bot logs", "حدد قناة لسجلات البوت"),
            emoji: { id: "1494401911128985721", name: "promotion" }
          },
          {
            label: this.t("12 - Restart bot", "12 - إعادة تشغيل البوت"),
            value: "restart_bot",
            description: this.t("Restart this bot runtime", "إعادة تشغيل هذا البوت"),
            emoji: { id: "1494401801078964374", name: "refresh" }
          }
        )
    );
  }

  private controlMenuRow(): ActionRowBuilder<StringSelectMenuBuilder> {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("mctl:menu")
        .setPlaceholder(this.t("Choose a music control", "اختر تحكم الموسيقى"))
        .addOptions(
              { label: this.t("Pause", "إيقاف مؤقت"), value: "pause", emoji: { id: "1494401873673846824", name: "pausebutton" } },
              { label: this.t("Resume", "استئناف"), value: "resume", emoji: { id: "1494401821253304542", name: "play" } },
              { label: this.t("Skip", "تخطي"), value: "skip", emoji: { id: "1494401856040996944", name: "nextbutton" } },
              { label: this.t("Shuffle Queue", "خلط القائمة"), value: "shuffle", emoji: { id: "1494401838156349481", name: "shuffle" } },
              { label: this.t("Toggle Loop", "تبديل التكرار"), value: "loop", emoji: { id: "1494401801078964374", name: "refresh" } },
              { label: this.t("Volume -10", "خفض الصوت -10"), value: "vol_down", emoji: { id: "1494401781004763208", name: "volumedown" } },
              { label: this.t("Volume +10", "رفع الصوت +10"), value: "vol_up", emoji: { id: "1494401762193445054", name: "volumeup" } },
              { label: this.t("Show Queue", "عرض القائمة"), value: "queue", emoji: { id: "1494401740777459772", name: "addlist" } },
              { label: this.t("Get Lyrics", "عرض الكلمات"), value: "lyrics", emoji: { id: "1494401740777459772", name: "addlist" } },
              { label: this.t("Stop", "إيقاف"), value: "stop", emoji: { id: "1494401873673846824", name: "pausebutton" } }
      )
    );
  }

  private mapActivityType(value: string): BotEntity["status_type"] | null {
    if (value === "PLAYING") {
      return "PLAYING";
    }
    if (value === "LISTENING") {
      return "LISTENING";
    }
    if (value === "WATCHING") {
      return "WATCHING";
    }
    if (value === "COMPETING") {
      return "COMPETING";
    }
    return null;
  }

  private trackEmbed(title: string, track: Track, lyricsLine?: string, lyricsNextLine?: string): EmbedBuilder {
    const queued = this.player.getQueue().length;
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(`**${track.title}**\n[${this.t("Open Track", "فتح المقطع")}](${track.url})`)
      .addFields(
        { name: this.t("Requested By", "طلب بواسطة"), value: track.requestedBy, inline: true },
        { name: this.t("Duration", "المدة"), value: track.duration, inline: true },
        { name: this.t("Up Next", "التالي"), value: this.t(`${queued} track${queued === 1 ? "" : "s"}`, `${queued} مقطع`), inline: true },
        {
          name: this.t("Playback", "التشغيل"),
          value: this.t(`Loop: ${this.player.getLoop()} | Volume: ${this.player.getVolume()}%`, `تكرار: ${this.player.getLoop()} | الصوت: ${this.player.getVolume()}%`),
          inline: false
        },
        {
          name: this.t("Controls", "التحكم"),
          value: this.t(
            "Use the dropdown menu below for pause, skip, queue, lyrics, and more.",
            "استخدم القائمة بالأسفل للإيقاف المؤقت، التخطي، عرض القائمة، الكلمات، والمزيد."
          ),
          inline: false
        }
      );
    if (lyricsLine) {
      const lyricsValue = [
        `> ${lyricsLine}`,
        lyricsNextLine ? `> ${lyricsNextLine}` : null
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 1024);
      embed.addFields({ name: this.t("Lyrics", "الكلمات"), value: lyricsValue, inline: false });
    }
    if (track.thumbnail) {
      embed.setThumbnail(track.thumbnail);
    }
    return embed;
  }

  private queueEmbed(): EmbedBuilder {
    const q = this.player.getQueue();
    const now = this.player.getNowPlaying();
    const embed = new EmbedBuilder().setTitle(this.t("📜 Queue", "📜 قائمة التشغيل"));
    if (now) {
      embed.addFields({ name: this.t("Now Playing", "يتم تشغيل"), value: `[${now.title}](${now.url}) • ${now.duration}` });
    }
    embed.setDescription(
      q.length
        ? q.slice(0, 15).map((x, i) => `${i + 1}. [${x.title}](${x.url})`).join("\n")
        : this.t("Queue is empty.", "القائمة فارغة.")
    );
    embed.setFooter({ text: this.t(`Loop: ${this.player.getLoop()} | Volume: ${this.player.getVolume()}%`, `تكرار: ${this.player.getLoop()} | الصوت: ${this.player.getVolume()}%`) });
    return embed;
  }

  private myBotPanelEmbed(): EmbedBuilder {
    const now = this.player.getNowPlaying();
    const botName = this.client.user?.username ?? this.botData.name ?? "Managed Bot";
    const assignedVoice = this.botData.voice_channel_id ? `<#${this.botData.voice_channel_id}>` : "Not set";

    const embed = new EmbedBuilder()
      .setTitle(this.t("My Bot Panel", "لوحة تحكم البوت"))
      .setDescription(this.t(`Managing: **${botName}**`, `إدارة البوت: **${botName}**`))
      .addFields(
        { name: this.t("State", "الحالة"), value: this.botData.status, inline: true },
        { name: this.t("Assigned Voice", "الروم المعين"), value: assignedVoice, inline: true },
        { name: this.t("Queue Length", "عدد القائمة"), value: String(this.player.getQueue().length), inline: true },
        { name: this.t("Now Playing", "يتم تشغيل"), value: now ? `[${now.title}](${now.url})` : this.t("Nothing playing", "لا يوجد تشغيل"), inline: false }
      )
      .setFooter({ text: this.t(`Loop: ${this.player.getLoop()} | Volume: ${this.player.getVolume()}%`, `تكرار: ${this.player.getLoop()} | الصوت: ${this.player.getVolume()}%`) });

    if (now?.thumbnail) {
      embed.setThumbnail(now.thumbnail);
    }
    return embed;
  }

  async stop(): Promise<void> {
    this.isStopping = true;
    if (this.voiceKeepAliveInterval) {
      clearInterval(this.voiceKeepAliveInterval);
      this.voiceKeepAliveInterval = null;
    }
    if (this._player) {
      try {
        this._player.stop();
      } catch (e) {
        logger.warn("Player stop failed during runtime stop", { botId: this.botData.id, error: (e as Error).message });
      }
      try {
        this._player.disconnect();
      } catch (e) {
        logger.warn("Player disconnect failed during runtime stop", { botId: this.botData.id, error: (e as Error).message });
      }
      this._player = null;
    }
    // Cleanly close all Lavalink node WebSocket connections before destroying
    // the Discord client. Without this, the bot process accumulates stale WS
    // connections and Lavalink rejects the next login with code 4000.
    LavalinkGuildPlayer.destroyManager(this.client);
    this.client.destroy();
  }

  async applyProfile(sections?: Set<ProfileSection>): Promise<void> {
    if (!this.client.user) {
      return;
    }

    const shouldApply = (section: ProfileSection): boolean => !sections || sections.has(section);

    const desiredName = this.botData.name?.trim();
    if (shouldApply("name") && desiredName && this.client.user.username !== desiredName) {
      const now = Date.now();
      if (now >= this.usernameRateLimitedUntil) {
        try {
          await this.client.user.setUsername(desiredName);
        } catch (error) {
          const message = (error as Error).message;
          if (message.includes("USERNAME_RATE_LIMIT")) {
            this.usernameRateLimitedUntil = now + USERNAME_RETRY_AFTER_MS;
            logger.warn("Managed bot username update rate limited", {
              botId: this.botData.id,
              retryAfterMs: USERNAME_RETRY_AFTER_MS
            });
          } else {
            logger.warn("Managed bot username update failed", {
              botId: this.botData.id,
              error: message
            });
          }
        }
      }
    }

    if (shouldApply("avatar") && this.botData.avatar) {
      try {
        await this.client.user.setAvatar(this.botData.avatar);
      } catch (error) {
        logger.warn("Managed bot avatar update failed", {
          botId: this.botData.id,
          error: (error as Error).message
        });
      }
    }

    if (shouldApply("banner") && this.botData.banner) {
      try {
        const user = this.client.user as unknown as { setBanner?: (banner: string | null) => Promise<unknown> };
        if (typeof user.setBanner === "function") {
          await user.setBanner(this.botData.banner);
        }
      } catch (error) {
        logger.warn("Managed bot banner update failed", {
          botId: this.botData.id,
          error: (error as Error).message
        });
      }
    }

    if (shouldApply("presence") && this.botData.status_text) {
      try {
        await this.client.user.setPresence({
          status: this.botData.online_status ?? "online",
          activities: [{ name: this.botData.status_text, type: toActivityType(this.botData.status_type) }]
        });
      } catch (error) {
        logger.warn("Managed bot presence update failed", {
          botId: this.botData.id,
          error: (error as Error).message
        });
      }
    }
  }

  async refresh(bot: BotEntity): Promise<void> {
    const previousData = this.botData;
    const previousVoice = previousData.voice_channel_id;
    const previousGuild = previousData.guild_id;
    const previousLanguage = this.languageTag();
    this.botData = bot;
    const nextLanguage = this.languageTag();

    const changedProfileSections = new Set<ProfileSection>();
    if ((previousData.name ?? null) !== (bot.name ?? null)) {
      changedProfileSections.add("name");
    }
    if ((previousData.avatar ?? null) !== (bot.avatar ?? null)) {
      changedProfileSections.add("avatar");
    }
    if ((previousData.banner ?? null) !== (bot.banner ?? null)) {
      changedProfileSections.add("banner");
    }
    if (
      (previousData.status_text ?? null) !== (bot.status_text ?? null) ||
      (previousData.status_type ?? null) !== (bot.status_type ?? null) ||
      (previousData.online_status ?? null) !== (bot.online_status ?? null)
    ) {
      changedProfileSections.add("presence");
    }

    if (previousLanguage !== nextLanguage) {
      try {
        await this.syncManagedCommands();
      } catch (error) {
        logger.warn("Managed bot command localization refresh failed", {
          botId: this.botData.id,
          error: (error as Error).message
        });
      }
    }

    if (changedProfileSections.size > 0) {
      await this.applyProfile(changedProfileSections);
    }

    if (previousGuild !== bot.guild_id || previousVoice !== bot.voice_channel_id) {
      this.voiceKeepAliveDisabledReason = null;
      this.startVoiceKeepAlive();
    }

    if ((previousGuild !== bot.guild_id || previousVoice !== bot.voice_channel_id) && bot.voice_channel_id) {
      await this.joinAssignedVoice();
    }
  }

  private languageTag(): "ar" | "en" {
    return this.botData.language === "en" ? "en" : "ar";
  }

  private normalizePresence(value: string): BotEntity["online_status"] | null {
    const normalized = value.trim().toLowerCase();
    if (normalized === "offline") {
      return "invisible";
    }
    if (normalized === "online" || normalized === "idle" || normalized === "dnd" || normalized === "invisible") {
      return normalized;
    }
    return null;
  }

  private normalizeLanguage(value: string): "ar" | "en" | null {
    const normalized = value.trim().toLowerCase();
    if (normalized === "ar" || normalized === "en") {
      return normalized;
    }
    return null;
  }

  private isSnowflake(value: string): boolean {
    return /^\d{17,20}$/.test(value);
  }

  private async updateHealth(
    patch: Partial<Pick<BotEntity, "runtime_state" | "last_error" | "last_ready_at" | "last_command_at" | "health_updated_at">>
  ): Promise<void> {
    this.botData = {
      ...this.botData,
      ...patch
    };
    await this.runtimeActions.updateHealth(this.botData.id, patch);
  }

  private async handlePlayerFault(reason: string): Promise<void> {
    if (this.isStopping) {
      return;
    }

    logger.warn("Managed bot player fault detected", {
      botId: this.botData.id,
      reason
    });

    if (this.onRuntimeFault) {
      await this.onRuntimeFault(this.botData.id, reason);
    }
  }

  private async connectAndAddWithRecovery(
    channel: VoiceBasedChannel,
    query: string,
    requestedBy: string,
    context: { commandType: "slash" | "prefix"; userId: string }
  ): Promise<EnqueueResult> {
    this.voiceCommandInProgress = true;
    try {
      if (this.joinPromise) {
        await this.joinPromise.catch(() => undefined);
      }
      try {
        await this.player.connect(channel);
        return await this.player.add(query, requestedBy);
      } catch (error) {
        const message = this.toErrorMessage(error);
        if (!this.isRecoverablePlaybackStartError(message)) {
          throw error;
        }

        logger.warn("Managed bot playback recovery starting", {
          botId: this.botData.id,
          userId: context.userId,
          commandType: context.commandType,
          channelId: channel.id,
          query,
          error: message
        });

        this.player.clear();
        this.player.disconnect();
        await this.wait(2_500);
        await this.player.connect(channel);
        return this.player.add(query, requestedBy);
      }
    } finally {
      this.voiceCommandInProgress = false;
    }
  }

  private isRecoverablePlaybackStartError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("unexpected error response from lavalink server") ||
      normalized.includes("unexpected server response: 429") ||
      normalized.includes("session not found") ||
      normalized.includes("no lavalink node") ||
      normalized.includes("no lavalink nodes available") ||
      normalized.includes("can't find any nodes to connect on") ||
      normalized.includes("voice connection did not become ready") ||
      normalized.includes("the operation was aborted") ||
      normalized.includes("destroyed") ||
      normalized.includes("4017") ||
      normalized.includes("connection not established")
    );
  }

  private initialVoiceJoinJitterMs(): number {
    let hash = 0;
    for (const char of this.botData.id) {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    return hash % VOICE_AUTO_JOIN_JITTER_MS;
  }

  private isLavalinkPressureError(error: unknown): boolean {
    const message = this.toErrorMessage(error).toLowerCase();
    return (
      message.includes("unexpected error response from lavalink server") ||
      message.includes("unexpected server response: 429") ||
      message.includes("429") ||
      message.includes("no lavalink node") ||
      message.includes("no lavalink nodes available") ||
      message.includes("can't find any nodes to connect on") ||
      message.includes("voice connection is not established")
    );
  }

  private recordVoiceJoinSuccess(): void {
    this.voiceJoinFailureCount = 0;
    this.nextJoinAllowedAt = 0;
    this.lastSuccessfulVoiceJoinAt = Date.now();
  }

  private recordVoiceJoinFailure(error: unknown): void {
    this.voiceJoinFailureCount += 1;
    const pressureDelayMs = this.isLavalinkPressureError(error)
      ? Math.min(60_000, env.voiceRejoinMaxDelayMs * 6)
      : env.voiceRejoinMaxDelayMs;
    const delayMs = Math.min(
      pressureDelayMs,
      env.voiceRejoinBaseDelayMs * 2 ** Math.min(this.voiceJoinFailureCount, 6)
    );
    this.nextJoinAllowedAt = Date.now() + delayMs;
  }

  private async wait(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private async syncManagedCommands(): Promise<void> {
    const guild = await this.client.guilds.fetch(this.botData.guild_id);
    await guild.commands.set([
      {
        name: "play",
        description: this.t("Play music by URL or search query", "تشغيل موسيقى عبر رابط أو بحث"),
        options: [{ name: "query", description: this.t("URL or song name", "رابط أو اسم الأغنية"), type: 3, required: true }]
      },
      { name: "skip", description: this.t("Skip current track", "تخطي المقطع الحالي") },
      { name: "stop", description: this.t("Stop playback and clear queue", "إيقاف التشغيل ومسح القائمة") },
      { name: "pause", description: this.t("Pause current track", "إيقاف المقطع مؤقتًا") },
      { name: "resume", description: this.t("Resume playback", "استئناف التشغيل") },
      { name: "queue", description: this.t("Show queue", "عرض قائمة التشغيل") },
      { name: "nowplaying", description: this.t("Show currently playing song", "عرض الأغنية الحالية") },
      {
        name: "remove",
        description: this.t("Remove queue item", "حذف عنصر من القائمة"),
        options: [{ name: "index", description: this.t("Queue index", "رقم العنصر"), type: 4, required: true }]
      },
      { name: "clear", description: this.t("Clear queue", "مسح القائمة") },
      { name: "shuffle", description: this.t("Shuffle queue", "خلط القائمة") },
      {
        name: "loop",
        description: this.t("Set loop mode", "تحديد وضع التكرار"),
        options: [
          {
            name: "mode",
            description: this.t("off / track / queue", "off / track / queue"),
            type: 3,
            required: true,
            choices: [
              { name: this.t("off", "off"), value: "off" },
              { name: this.t("track", "track"), value: "track" },
              { name: this.t("queue", "queue"), value: "queue" }
            ]
          }
        ]
      },
      {
        name: "volume",
        description: this.t("Set volume (1-200)", "تحديد مستوى الصوت (1-200)"),
        options: [{ name: "percent", description: this.t("Volume", "الصوت"), type: 4, required: true }]
      },
      { name: "lyrics", description: this.t("Get lyrics for current song", "عرض كلمات الأغنية الحالية") },
      { name: "help", description: this.t("Show command help", "عرض مساعدة الأوامر") },
      { name: "status", description: this.t("Show bot and playback status", "عرض حالة البوت والتشغيل") },
      { name: "diagnostics", description: this.t("Show bot diagnostics", "عرض تشخيص البوت") },
      { name: "setup", description: this.t("Open bot setup panel", "فتح لوحة إعداد البوت") }
    ]);
  }

  private t(en: string, ar: string): string {
    return this.languageTag() === "en" ? en : ar;
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error && typeof error.message === "string" && error.message.trim()) {
      return error.message;
    }
    if (typeof error === "string" && error.trim()) {
      return error;
    }
    if (error && typeof error === "object") {
      const details = error as {
        message?: unknown;
        detail?: unknown;
        reason?: unknown;
        error?: unknown;
      };
      for (const value of [details.message, details.detail, details.reason, details.error]) {
        if (typeof value === "string" && value.trim()) {
          return value;
        }
      }
      try {
        const serialized = JSON.stringify(error);
        if (serialized && serialized !== "{}") {
          return serialized;
        }
      } catch {
        // Ignore serialization failures and fall through to String().
      }
    }
    return String(error ?? "Unknown error");
  }

  private async replyWithFallback(message: Message, content: string): Promise<void> {
    try {
      await message.reply(content);
      return;
    } catch (replyError) {
      try {
        const channel = message.channel;
        if (channel && channel.isTextBased() && "send" in channel && typeof channel.send === "function") {
          await channel.send(content);
          return;
        }
      } catch (sendError) {
        logger.warn("Managed bot fallback reply failed", {
          botId: this.botData.id,
          error: this.toErrorMessage(sendError)
        });
      }

      logger.warn("Managed bot reply failed", {
        botId: this.botData.id,
        error: this.toErrorMessage(replyError)
      });
    }
  }

  private stopLyricsUpdates(): void {
    if (this.lyricsUpdateTimer) {
      clearInterval(this.lyricsUpdateTimer);
      this.lyricsUpdateTimer = null;
    }
    this.lyricsPlaybackState = null;
    this.lyricsPlaybackSessionId += 1;
  }

  private getActiveLyricLine(lines: SyncedLyricLine[], elapsedMs: number): { currentIndex: number; nextIndex: number } {
    if (!lines.length) {
      return { currentIndex: -1, nextIndex: -1 };
    }

    let currentIndex = -1;
    for (let index = 0; index < lines.length; index++) {
      if (lines[index]!.timeMs <= elapsedMs) {
        currentIndex = index;
        continue;
      }
      break;
    }

    return { currentIndex, nextIndex: Math.min(currentIndex + 1, lines.length - 1) };
  }

  private async startLyricsUpdates(track: Track, message: Message): Promise<void> {
    this.stopLyricsUpdates();

    const sessionId = this.lyricsPlaybackSessionId;
    const synced = await fetchSyncedLyrics(track);
    if (this.isStopping || sessionId !== this.lyricsPlaybackSessionId || !synced?.lines.length) {
      return;
    }

    this.lyricsPlaybackState = {
      sessionId,
      trackTitle: track.title,
      trackUrl: track.url,
      message,
      lines: synced.lines,
      startedAt: Date.now(),
      lastLineIndex: -1
    };

    await this.refreshLyricsMessage();

    this.lyricsUpdateTimer = setInterval(() => {
      void this.refreshLyricsMessage();
    }, 3000);
  }

  private async refreshLyricsMessage(): Promise<void> {
    const state = this.lyricsPlaybackState;
    if (!state || this.isStopping || state.sessionId !== this.lyricsPlaybackSessionId) {
      return;
    }

    const nowPlaying = this.player.getNowPlaying();
    if (!nowPlaying || nowPlaying.title !== state.trackTitle || nowPlaying.url !== state.trackUrl) {
      this.stopLyricsUpdates();
      return;
    }

    const elapsedMs = Date.now() - state.startedAt;
    const { currentIndex, nextIndex } = this.getActiveLyricLine(state.lines, elapsedMs);
    if (currentIndex === state.lastLineIndex) {
      return;
    }

    state.lastLineIndex = currentIndex;
    const currentLine = currentIndex >= 0 ? state.lines[currentIndex]?.text ?? null : null;
    const nextLine = nextIndex >= 0 ? state.lines[nextIndex]?.text ?? null : null;

    try {
      await state.message.edit({
        embeds: [this.trackEmbed(this.t("🎵 Now Playing", "🎵 يتم التشغيل الآن"), nowPlaying, currentLine ?? undefined, nextLine ?? undefined)],
        components: [this.controlMenuRow()]
      });
    } catch (error) {
      logger.warn("Managed bot lyrics update failed", {
        botId: this.botData.id,
        error: (error as Error).message
      });
      this.stopLyricsUpdates();
    }
  }

  private async sendLog(text: string): Promise<void> {
    if (!this.botData.log_channel_id) {
      return;
    }
    try {
      const channel = await this.client.channels.fetch(this.botData.log_channel_id);
      if (!channel || !channel.isTextBased()) {
        return;
      }
      if (!("send" in channel) || typeof channel.send !== "function") {
        return;
      }
      await channel.send(`🧾 ${text}`);
    } catch (error) {
      logger.warn("Managed bot log channel send failed", {
        botId: this.botData.id,
        channelId: this.botData.log_channel_id,
        error: (error as Error).message
      });
    }
  }

  private async announceTrackStart(track: Track): Promise<void> {
    if (!this.musicAnnouncementChannelId) {
      return;
    }

    try {
      const channel = await this.client.channels.fetch(this.musicAnnouncementChannelId);
      if (!channel || !channel.isTextBased() || !("send" in channel) || typeof channel.send !== "function") {
        return;
      }

      const announcement = await channel.send({
        embeds: [this.trackEmbed(this.t("🎵 Now Playing", "🎵 يتم التشغيل الآن"), track)],
        components: [this.controlMenuRow()]
      });
      void this.startLyricsUpdates(track, announcement);
    } catch (error) {
      logger.warn("Managed bot now-playing announce failed", {
        botId: this.botData.id,
        channelId: this.musicAnnouncementChannelId,
        error: (error as Error).message
      });
    }
  }

  private startVoiceKeepAlive(): void {
    if (this.voiceKeepAliveDisabledReason) {
      return;
    }
    if (this.voiceKeepAliveInterval) {
      clearInterval(this.voiceKeepAliveInterval);
    }

    this.voiceKeepAliveInterval = setInterval(async () => {
      if (this.isStopping || this.voiceKeepAliveDisabledReason || !this.botData.voice_channel_id || this.joinPromise || this.voiceCommandInProgress) {
        return;
      }

      if (await this.isBotStillInAssignedVoice()) {
        return;
      }

      try {
        await this.joinAssignedVoice();
      } catch (error) {
        if (isUnknownGuildError(error)) {
          await this.disableVoiceKeepAlive("Configured guild is unavailable to this bot");
          return;
        }
        logger.warn("Managed bot keep-alive reconnect failed", {
          botId: this.botData.id,
          channelId: this.botData.voice_channel_id,
          error: (error as Error).message
        });
      }
    }, VOICE_KEEP_ALIVE_INTERVAL_MS);
  }

  private async disableVoiceKeepAlive(reason: string): Promise<void> {
    if (this.voiceKeepAliveInterval) {
      clearInterval(this.voiceKeepAliveInterval);
      this.voiceKeepAliveInterval = null;
    }
    if (this.voiceKeepAliveDisabledReason === reason) {
      return;
    }

    this.voiceKeepAliveDisabledReason = reason;
    logger.warn("Managed bot voice keep-alive disabled", {
      botId: this.botData.id,
      guildId: this.botData.guild_id,
      channelId: this.botData.voice_channel_id,
      reason
    });
    await this.updateHealth({
      runtime_state: "degraded",
      last_error: reason,
      health_updated_at: new Date().toISOString()
    });
  }

  private async joinAssignedVoice(): Promise<void> {
    if (await this.isBotStillInAssignedVoice()) {
      return;
    }
    const now = Date.now();
    if (now < this.nextJoinAllowedAt) {
      return;
    }
    if (now - this.lastJoinAttemptAt < env.voiceRejoinBaseDelayMs) {
      return;
    }
    this.lastJoinAttemptAt = now;
    if (this.joinPromise) {
      return this.joinPromise;
    }
    this.joinPromise = this.joinAssignedVoiceInternal();
    try {
      await this.joinPromise;
    } catch (error) {
      this.recordVoiceJoinFailure(error);
      throw error;
    } finally {
      this.joinPromise = null;
    }
  }

  private async joinAssignedVoiceInternal(): Promise<void> {
    if (!this.botData.voice_channel_id) {
      return;
    }
    logger.debug("Managed bot auto-join attempt starting");
    const guild = await this.client.guilds.fetch(this.botData.guild_id);
    const me = await guild.members.fetchMe().catch(() => null);
    if (me?.voice.channelId === this.botData.voice_channel_id && this.player.hasActiveVoiceSession()) {
      return;
    }
    const channel = await guild.channels.fetch(this.botData.voice_channel_id);
    if (!channel || !channel.isVoiceBased()) {
      throw new Error("Assigned channel is missing or not voice-based");
    }
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 1; attempt++) {
      try {
        await withVoiceJoinSlot(() => this.player.connect(channel));
        const joinedName = this.client.user?.username ?? this.botData.name ?? "Unnamed Bot";
        logger.info(`Managed bot joined assigned voice: ${joinedName}`);
        this.recordVoiceJoinSuccess();
        await this.updateHealth({
          runtime_state: "active",
          last_error: null,
          health_updated_at: new Date().toISOString()
        });
        return;
      } catch (error) {
        lastError = error as Error;
        logger.warn("Managed bot join attempt failed", {
          botId: this.botData.id,
          channelId: this.botData.voice_channel_id,
          attempt: attempt + 1,
          error: lastError.message
        });
      }
    }
    await this.updateHealth({
      ...(lastError && isTransientNetworkError(lastError) ? {} : { runtime_state: "degraded" }),
      last_error: lastError?.message ?? "Failed to join assigned voice channel",
      health_updated_at: new Date().toISOString()
    });
    throw lastError ?? new Error("Failed to join assigned voice channel");
  }
}
