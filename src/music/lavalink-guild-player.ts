import { Connectors, LoadType, Shoukaku, type Node as LavalinkNode, type NodeOption, type Player as LavalinkPlayer, type Track as LavalinkTrack } from "shoukaku";
import type { Client, VoiceBasedChannel } from "discord.js";
import { env } from "../config/env.js";
import { logger } from "../core/logger.js";
import { pickBestSearchIndex } from "./search-match.js";
import { canonicalYoutubeVideoUrl, extractYoutubeVideoId, searchYoutube, type YoutubeSearchHit } from "./youtube-search.js";
import type { EnqueueResult, LoopMode, Track, TrackStartHandler } from "./types.js";

interface InternalTrack extends Track {
  encoded: string;
  lengthMs: number;
  alternatives?: InternalTrack[];
}

type EndReason = "finished" | "loadFailed" | "stopped" | "replaced" | "cleanup";

interface NodeHealthState {
  failureCount: number;
  cooldownUntil: number;
  lastError: string;
}

const NODE_HEALTH_PRESSURE_BASE_COOLDOWN_MS = 5_000;
const NODE_HEALTH_GENERIC_BASE_COOLDOWN_MS = 5_000;
const NODE_HEALTH_MAX_COOLDOWN_MS = 10 * 60_000;

export class LavalinkGuildPlayer {
  private static readonly managers = new WeakMap<Client, Shoukaku>();
  private static readonly nodeEventLogAt = new Map<string, number>();
  private static readonly nodeHealth = new Map<string, NodeHealthState>();

  /**
   * Cleanly destroys the Shoukaku manager bound to the given Discord client.
   * Call this before client.destroy() to avoid "Too many websocket connections" (code 4000).
   */
  static destroyManager(client: Client): void {
    const manager = LavalinkGuildPlayer.managers.get(client);
    if (!manager) {
      return;
    }
    try {
      for (const node of manager.nodes.values()) {
        try {
          node.disconnect(1000, "Bot runtime stopping");
        } catch {
          // Ignore individual node disconnect errors during shutdown.
        }
      }
    } catch {
      // Ignore errors when iterating nodes on teardown.
    }
    LavalinkGuildPlayer.managers.delete(client);
  }

  private readonly queue: InternalTrack[] = [];
  private nowPlaying: InternalTrack | null = null;
  private loopMode: LoopMode = "off";
  private volume = 80;
  private guildId: string | null = null;
  private lastError: string | null = null;
  private paused = false;
  private isAdvancing = false;
  private skipRequested = false;
  private stopRequested = false;
  private shoukaku: Shoukaku | null = null;
  private lavalinkPlayer: LavalinkPlayer | null = null;
  private listenersBound = false;
  private nodeFaultTimer: NodeJS.Timeout | null = null;
  private trackStartHandler: TrackStartHandler | null = null;

  constructor(
    private readonly runtimeId: string,
    private readonly onRuntimeFault?: (reason: string) => Promise<void>
  ) {}

  async connect(channel: VoiceBasedChannel): Promise<void> {
    this.guildId = channel.guild.id;

    const manager = this.getOrCreateManager(channel.client);
    this.shoukaku = manager;
    const existingConnection = manager.connections.get(channel.guild.id);
    const existingPlayer = manager.players.get(channel.guild.id);

    const reusableConnection = existingConnection?.state === 0 || existingConnection?.state === 1;
    const hasLiveVoiceSession = Boolean(
      existingConnection?.sessionId &&
      existingConnection?.serverUpdate &&
      existingPlayer &&
      reusableConnection
    );

    if (existingConnection?.channelId === channel.id && existingPlayer && hasLiveVoiceSession) {
      this.lavalinkPlayer = existingPlayer;
      this.bindPlayerListeners();
      try {
        await existingPlayer.setGlobalVolume(this.volume);
        return;
      } catch (error) {
        if (!this.isSessionNotFoundError(error)) {
          throw this.toError(error);
        }
        await this.resetStaleLavalinkSession(manager, channel.guild.id);
      }
    }

    if (existingConnection || existingPlayer) {
      const sameChannel = existingConnection?.channelId === channel.id;
      if (!sameChannel || !hasLiveVoiceSession) {
        await manager.leaveVoiceChannel(channel.guild.id).catch(() => undefined);
        await this.forceDiscordVoiceDisconnect(channel);
      }
      this.lavalinkPlayer = null;
      this.listenersBound = false;
    } else {
      await this.forceDiscordVoiceDisconnect(channel);
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.waitForIdealNode(manager, 20_000);
      const selectedNode = manager.getIdealNode();

      try {
        const player = await manager.joinVoiceChannel({
          guildId: channel.guild.id,
          channelId: channel.id,
          shardId: channel.guild.shardId,
          deaf: true,
          mute: false
        });

        this.lavalinkPlayer = player;
        this.bindPlayerListeners();
        await player.setGlobalVolume(this.volume);
        if (selectedNode) {
          this.clearNodeHealth(selectedNode.name);
        }
        return;
      } catch (error) {
        lastError = this.toError(error);
        const message = lastError.message.toLowerCase();
        if (selectedNode && this.isNodePressureError(message)) {
          this.recordNodeFailure(selectedNode.name, lastError.message);
        }
        if (this.isSessionNotFoundError(error)) {
          await this.resetStaleLavalinkSession(manager, channel.guild.id);
          if (attempt < 1) {
            continue;
          }
        }
        if (this.isVoiceConnectionTimeout(error)) {
          await this.forceDiscordVoiceDisconnect(channel);
        }
        if (
          attempt < 1 &&
          (message.includes("can't find any nodes to connect on") || this.isNodePressureError(message) || this.isVoiceConnectionTimeout(error))
        ) {
          await new Promise((resolve) => setTimeout(resolve, 750));
          continue;
        }
        throw lastError;
      }
    }

    throw lastError ?? new Error("Failed to establish Lavalink voice connection");
  }

  async add(queryInput: string, requestedBy: string): Promise<EnqueueResult> {
    const query = this.normalizeQuery(queryInput);
    const tracks = await this.resolveTracks(query, requestedBy);
    if (!tracks.length) {
      throw new Error("No playable track found");
    }

    const wasIdle = this.nowPlaying === null;
    for (const track of tracks) {
      this.queue.push(track);
    }

    await this.advance();

    if (wasIdle && !this.nowPlaying) {
      throw new Error(this.lastError ?? "Playback failed to start for the selected track");
    }

    return {
      added: tracks,
      startedPlayback: wasIdle && this.nowPlaying !== null,
      nowPlaying: this.nowPlaying
    };
  }

  skip(): void {
    if (!this.lavalinkPlayer || !this.nowPlaying) {
      return;
    }
    this.skipRequested = true;
    this.runPlayerCommand(this.lavalinkPlayer.stopTrack());
  }

  pause(): boolean {
    if (!this.lavalinkPlayer || !this.nowPlaying) {
      return false;
    }
    this.paused = true;
    this.runPlayerCommand(this.lavalinkPlayer.setPaused(true));
    return true;
  }

  resume(): boolean {
    if (!this.lavalinkPlayer || !this.nowPlaying) {
      return false;
    }
    this.paused = false;
    this.runPlayerCommand(this.lavalinkPlayer.setPaused(false));
    return true;
  }

  stop(): void {
    this.stopRequested = true;
    this.skipRequested = false;
    this.queue.length = 0;
    this.nowPlaying = null;
    this.paused = false;

    if (this.lavalinkPlayer) {
      this.runPlayerCommand(this.lavalinkPlayer.stopTrack());
    }

  }

  disconnect(): void {
    if (this.shoukaku && this.guildId) {
      void this.shoukaku.leaveVoiceChannel(this.guildId).catch(() => undefined);
    }
    this.lavalinkPlayer = null;
    this.listenersBound = false;
  }

  reset(): void {
    this.stopRequested = false;
    this.skipRequested = false;
    this.queue.length = 0;
    this.nowPlaying = null;
    this.disconnect();
  }

  clear(): void {
    this.queue.length = 0;
  }

  shuffle(): void {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = this.queue[i];
      this.queue[i] = this.queue[j];
      this.queue[j] = tmp;
    }
  }

  remove(index: number): Track | null {
    if (index < 0 || index >= this.queue.length) {
      return null;
    }
    const [removed] = this.queue.splice(index, 1);
    return removed ?? null;
  }

  setLoop(mode: LoopMode): void {
    this.loopMode = mode;
  }

  getLoop(): LoopMode {
    return this.loopMode;
  }

  setVolume(percent: number): void {
    this.volume = Math.max(1, Math.min(200, percent));
    if (this.lavalinkPlayer) {
      this.runPlayerCommand(this.lavalinkPlayer.setGlobalVolume(this.volume));
    }
  }

  getVolume(): number {
    return this.volume;
  }

  getQueue(): Track[] {
    return [...this.queue];
  }

  getNowPlaying(): Track | null {
    return this.nowPlaying;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  hasActiveVoiceSession(): boolean {
    if (!this.shoukaku || !this.guildId) {
      return false;
    }

    const connection = this.shoukaku.connections.get(this.guildId);
    const player = this.shoukaku.players.get(this.guildId);
    const connectionReady = connection?.state === 0 || connection?.state === 1;

    return Boolean(
      connection &&
      player &&
      connectionReady &&
      connection.sessionId &&
      connection.serverUpdate
    );
  }

  setTrackStartHandler(handler: TrackStartHandler | null): void {
    this.trackStartHandler = handler;
  }

  private getOrCreateManager(client: Client): Shoukaku {
    // Prefer multi-node config from env.lavalinkNodes, fallback to legacy single node
    const nodes: NodeOption[] = Array.isArray(env.lavalinkNodes) && env.lavalinkNodes.length > 0
      ? env.lavalinkNodes
      : [
          {
            name: "main",
            url: env.lavalinkHost,
            auth: env.lavalinkPassword,
            secure: env.lavalinkSecure
          }
        ];
    const nodeResolver = (nodeMap: Map<string, LavalinkNode>): LavalinkNode | undefined => this.resolveHealthyNode(nodeMap);

    const existing = LavalinkGuildPlayer.managers.get(client);
    if (existing) {
      this.shoukaku = existing;
      this.ensureConnectorReady(existing, client, nodes);
      return existing;
    }

    const manager = new Shoukaku(
      new Connectors.DiscordJS(client),
      nodes,
      {
        resume: true,
        resumeTimeout: 30,
        reconnectTries: 5,
        reconnectInterval: 10,
        restTimeout: 60,
        voiceConnectionTimeout: 60,
        moveOnDisconnect: true,
        resumeByLibrary: true,
        nodeResolver
      }
    );
    this.shoukaku = manager;

    manager.on("ready", (name) => {
      this.clearNodeHealth(name);
      this.logNodeEvent("ready", name, "debug", 60_000);
      this.clearPendingNodeFault();
    });
    manager.on("error", (name, error: unknown) => {
      const message = this.toErrorMessage(error);
      this.recordNodeFailure(name, message);
      this.logNodeEvent(`error:${message}`, name, "warn", 30_000, message);
      this.lastError = message;
    });
    manager.on("close", (name, code, reason) => {
      const detail = `code=${code} reason=${reason}`;
      this.recordNodeFailure(name, detail);
      if (this.logNodeEvent("closed", name, "warn", 60_000, detail)) {
        // Only fault the runtime when ALL nodes are gone — a single node
        // closing while others remain healthy should not restart the bot.
        const remainingHealthy = [...manager.nodes.values()].filter(
          (n) => n.name !== name && n.state === 1
        );
        if (remainingHealthy.length === 0) {
          this.scheduleNodeFault(`Lavalink node closed: ${name} ${detail}`);
        } else {
          logger.warn(`Lavalink node closed but ${remainingHealthy.length} node(s) still healthy — skipping fault`, {
            runtimeId: this.runtimeId,
            nodeName: name,
            detail
          });
        }
      }
    });

    this.ensureConnectorReady(manager, client, nodes);

    LavalinkGuildPlayer.managers.set(client, manager);
    return manager;
  }

  private ensureConnectorReady(manager: Shoukaku, client: Client, nodes: NodeOption[]): void {
    if (manager.id || !client.isReady()) {
      return;
    }

    const connector = manager.connector as unknown as { ready: (nodeOptions: NodeOption[]) => void };
    connector.ready(nodes);
  }

  private async waitForIdealNode(manager: Shoukaku, timeoutMs: number): Promise<void> {
    const startedAt = Date.now();
    while (!manager.getIdealNode()) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error("No Lavalink nodes available");
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  private isSessionNotFoundError(error: unknown): boolean {
    if (error && typeof error === "object") {
      const restError = error as { status?: unknown; path?: unknown; message?: unknown };
      if (restError.status === 404 && typeof restError.path === "string" && restError.path.includes("/sessions/")) {
        return true;
      }
      if (typeof restError.message === "string" && restError.message.toLowerCase().includes("session not found")) {
        return true;
      }
    }

    return this.toErrorMessage(error).toLowerCase().includes("session not found");
  }

  private isVoiceConnectionTimeout(error: unknown): boolean {
    return this.toErrorMessage(error).toLowerCase().includes("voice connection is not established");
  }

  private async forceDiscordVoiceDisconnect(channel: VoiceBasedChannel): Promise<void> {
    const me = await channel.guild.members.fetchMe().catch(() => null);
    if (!me?.voice.channelId) {
      return;
    }

    await me.voice.disconnect().catch(() => undefined);

    const startedAt = Date.now();
    while (Date.now() - startedAt < 5_000) {
      const refreshed = await channel.guild.members.fetchMe().catch(() => null);
      if (!refreshed?.voice.channelId) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
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

  private toError(error: unknown): Error {
    if (error instanceof Error && typeof error.message === "string" && error.message.trim()) {
      return error;
    }
    return new Error(this.toErrorMessage(error));
  }

  private resolveHealthyNode(nodes: Map<string, LavalinkNode>): LavalinkNode | undefined {
    const connectedNodes = [...nodes.values()]
      .filter((node) => node.state === 1)
      .sort((a, b) => {
        const aLoad = [...a.manager.players.values()].filter((p) => p.node.name === a.name).length;
        const bLoad = [...b.manager.players.values()].filter((p) => p.node.name === b.name).length;
        if (aLoad !== bLoad) {
          return aLoad - bLoad;
        }
        return a.penalties - b.penalties;
      });

    if (!connectedNodes.length) {
      return undefined;
    }

    const healthyNodes = connectedNodes.filter((node) => !this.isNodeCoolingDown(node.name));
    return healthyNodes[0] ?? connectedNodes[0] ?? undefined;
  }

  private getHealthyConnectedNodes(manager: Shoukaku): LavalinkNode[] {
    const connectedNodes = [...manager.nodes.values()]
      .filter((node) => node.state === 1)
      .sort((a, b) => {
        const aLoad = [...a.manager.players.values()].filter((p) => p.node.name === a.name).length;
        const bLoad = [...b.manager.players.values()].filter((p) => p.node.name === b.name).length;
        if (aLoad !== bLoad) {
          return aLoad - bLoad;
        }
        return a.penalties - b.penalties;
      });

    const healthyNodes = connectedNodes.filter((node) => !this.isNodeCoolingDown(node.name));
    return healthyNodes.length ? healthyNodes : connectedNodes;
  }

  private isNodeCoolingDown(nodeName: string): boolean {
    const health = LavalinkGuildPlayer.nodeHealth.get(nodeName);
    return Boolean(health && health.cooldownUntil > Date.now());
  }

  private clearNodeHealth(nodeName: string): void {
    LavalinkGuildPlayer.nodeHealth.delete(nodeName);
  }

  private recordNodeFailure(nodeName: string, reason: string): void {
    if (!nodeName) {
      return;
    }

    if (this.shoukaku) {
      const activeNodes = [...this.shoukaku.nodes.values()].filter(
        (node) => node.state === 1 && !this.isNodeCoolingDown(node.name)
      );

      if (activeNodes.some((n) => n.name === nodeName) && activeNodes.length <= 1) {
        logger.warn(`Skipping cooldown for Lavalink node ${nodeName} - no fallback available`, {
          runtimeId: this.runtimeId,
          nodeName
        });
        return;
      }
    }

    const now = Date.now();
    const existing = LavalinkGuildPlayer.nodeHealth.get(nodeName);
    const failureCount = Math.min((existing?.failureCount ?? 0) + 1, 12);
    const pressureIssue = this.isNodePressureError(reason);
    const baseCooldownMs = pressureIssue ? NODE_HEALTH_PRESSURE_BASE_COOLDOWN_MS : NODE_HEALTH_GENERIC_BASE_COOLDOWN_MS;
    const cooldownMs = Math.min(
      NODE_HEALTH_MAX_COOLDOWN_MS,
      baseCooldownMs * 2 ** Math.min(failureCount - 1, 5)
    );

    LavalinkGuildPlayer.nodeHealth.set(nodeName, {
      failureCount,
      cooldownUntil: now + cooldownMs,
      lastError: reason
    });

    this.logNodeEvent("cooldown", nodeName, "warn", cooldownMs, reason);
  }

  private isNodePressureError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("unexpected error response from lavalink server") ||
      normalized.includes("unexpected server response: 5") ||
      normalized.includes("unexpected server response: 429") ||
      normalized.includes("429") ||
      normalized.includes("too many requests") ||
      normalized.includes("websocket closed before a connection was established") ||
      normalized.includes("no lavalink node") ||
      normalized.includes("no lavalink nodes available") ||
      normalized.includes("can't find any nodes to connect on")
    );
  }

  private logNodeEvent(
    kind: string,
    nodeName: string,
    level: "debug" | "info" | "warn" | "error",
    cooldownMs: number,
    detail?: string
  ): boolean {
    const key = `${kind}:${nodeName}`;
    const now = Date.now();
    const lastLoggedAt = LavalinkGuildPlayer.nodeEventLogAt.get(key) ?? 0;
    if (now - lastLoggedAt < cooldownMs) {
      return false;
    }

    LavalinkGuildPlayer.nodeEventLogAt.set(key, now);

    const suffix = detail ? ` ${detail}` : "";
    logger[level](`Lavalink node ${kind}: ${nodeName}${suffix}`, {
      runtimeId: this.runtimeId,
      nodeName,
      kind,
      detail
    });

    return true;
  }

  private clearPendingNodeFault(): void {
    if (this.nodeFaultTimer) {
      clearTimeout(this.nodeFaultTimer);
      this.nodeFaultTimer = null;
    }
  }

  private scheduleNodeFault(reason: string): void {
    const onRuntimeFault = this.onRuntimeFault;
    if (!onRuntimeFault) {
      return;
    }

    this.clearPendingNodeFault();
    this.nodeFaultTimer = setTimeout(() => {
      this.nodeFaultTimer = null;
      void onRuntimeFault(reason);
    }, 20_000);
  }

  private async resetStaleLavalinkSession(manager: Shoukaku, guildId: string): Promise<void> {
    await manager.leaveVoiceChannel(guildId).catch(() => undefined);
    this.lavalinkPlayer = null;
    this.listenersBound = false;

    for (const node of manager.nodes.values()) {
      if (node.sessionId) {
        node.disconnect(4000, "Resetting stale Lavalink session");
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  private runPlayerCommand(operation: Promise<unknown>): void {
    void operation.catch((error: unknown) => {
      this.lastError = this.toErrorMessage(error);
      if (this.isSessionNotFoundError(error) && this.shoukaku && this.guildId) {
        void this.resetStaleLavalinkSession(this.shoukaku, this.guildId);
      }
    });
  }

  private bindPlayerListeners(): void {
    if (!this.lavalinkPlayer || this.listenersBound) {
      return;
    }

    this.lavalinkPlayer.on("end", (event) => {
      void this.handleTrackEnd(event.reason as EndReason);
    });

    this.lavalinkPlayer.on("start", (event) => {
      this.nowPlaying = this.mergeNowPlayingWithStartedTrack(event.track);
      this.paused = false;
    });

    this.lavalinkPlayer.on("exception", (event) => {
      this.lastError = this.toErrorMessage(event.exception);
      void this.handleTrackEnd("loadFailed");
    });

    this.listenersBound = true;
  }

  private async handleTrackEnd(reason: EndReason): Promise<void> {
    if (reason === "replaced") {
      return;
    }

    if (reason === "stopped") {
      if (this.stopRequested) {
        this.stopRequested = false;
        return;
      }
      if (!this.skipRequested) {
        return;
      }
    }

    if (this.nowPlaying) {
      if (this.loopMode === "track" && reason !== "loadFailed") {
        this.queue.unshift(this.nowPlaying);
      } else if (this.loopMode === "queue" && reason !== "loadFailed") {
        this.queue.push(this.nowPlaying);
      }
    }

    this.skipRequested = false;
    this.nowPlaying = null;
    this.paused = false;
    await this.advance();
    await this.advance(true);
  }

  private async advance(announce = false): Promise<void> {
    if (this.isAdvancing) {
      return;
    }
    if (!this.lavalinkPlayer) {
      return;
    }

    if (this.nowPlaying || this.stopRequested || this.skipRequested) {
      return;
    }

    const next = this.queue.shift();
    if (!next) {
      this.nowPlaying = null;
      return;
    }

    this.isAdvancing = true;
    try {
      const prepared = await this.prepareTrackForPlayback(next);
      const playingTrack = await this.playPreparedTrack(prepared);
      this.nowPlaying = playingTrack;
      const videoId = extractYoutubeVideoId(playingTrack.url);
      const nodeName = this.lavalinkPlayer.node.name;
      console.log(
        `[LavalinkGuildPlayer ${this.runtimeId}] Playing ${playingTrack.title}${videoId ? ` (youtube:${videoId})` : ""} via node ${nodeName}`
      );
      this.lastError = null;
      if (announce && this.trackStartHandler) {
        await this.trackStartHandler(playingTrack);
      }
    } catch (error) {
      this.lastError = this.toErrorMessage(error);
      this.nowPlaying = null;
    } finally {
      this.isAdvancing = false;
    }

    if (!this.nowPlaying) {
      await this.advance();
    }
  }

  private async resolveTracks(query: string, requestedBy: string): Promise<InternalTrack[]> {
    if (!this.shoukaku) {
      throw new Error("Lavalink manager is not initialized");
    }

    if (this.isHttpUrl(query)) {
      const canonical = canonicalYoutubeVideoUrl(query);
      if (canonical) {
        try {
          const resolved = await this.resolveUrlWithLavalink(canonical, requestedBy, query);
          return [{ ...resolved, url: canonical }];
        } catch {
          return [this.trackFromYoutubeUrl(canonical, requestedBy, query)];
        }
      }
      return this.resolveSourceWithLavalink(query, requestedBy, query);
    }

    const hit = await searchYoutube(query);
    return [this.trackFromSearchHit(hit, requestedBy, query)];
  }

  private trackFromSearchHit(hit: YoutubeSearchHit, requestedBy: string, sourceQuery: string): InternalTrack {
    return {
      title: hit.title,
      url: hit.url,
      duration: hit.duration,
      thumbnail: hit.thumbnail,
      requestedBy,
      sourceQuery,
      durationSeconds: hit.durationSeconds,
      encoded: "",
      lengthMs: (hit.durationSeconds ?? 0) * 1000
    };
  }

  private trackFromYoutubeUrl(url: string, requestedBy: string, sourceQuery: string): InternalTrack {
    const canonical = canonicalYoutubeVideoUrl(url) ?? url;
    return {
      title: sourceQuery,
      url: canonical,
      duration: "Live",
      thumbnail: null,
      requestedBy,
      sourceQuery,
      encoded: "",
      lengthMs: 0
    };
  }

  private async playPreparedTrack(track: InternalTrack): Promise<InternalTrack> {
    if (!this.lavalinkPlayer) {
      throw new Error("Lavalink player is not connected");
    }

    if (!track.encoded) {
      const resolved = await this.resolveUrlWithLavalink(track.url, track.requestedBy, track.sourceQuery ?? track.url);
      await this.lavalinkPlayer.playTrack({
        track: { encoded: resolved.encoded }
      });
      return resolved;
    }

    await this.lavalinkPlayer.playTrack({
      track: { encoded: track.encoded }
    });
    return track;
  }

  private async resolveSourceWithLavalink(source: string, requestedBy: string, sourceQuery: string): Promise<InternalTrack[]> {
    if (!this.shoukaku) {
      throw new Error("Lavalink manager is not initialized");
    }

    const nodes = this.getResolveNodes(this.shoukaku);
    if (!nodes.length) {
      throw new Error("No Lavalink node is available");
    }

    let lastError: Error | null = null;

    nodeLoop: for (const node of nodes) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await node.rest.resolve(source);
          this.clearNodeHealth(node.name);
          return this.extractTracksFromResolveResult(result, requestedBy, sourceQuery);
        } catch (error) {
          const err = this.toError(error);
          lastError = err;
          const message = err.message.toLowerCase();

          if (this.isSessionNotFoundError(error) && this.shoukaku && this.guildId) {
            await this.resetStaleLavalinkSession(this.shoukaku, this.guildId);
          }

          if (this.isNodePressureError(message)) {
            this.recordNodeFailure(node.name, err.message);
            continue nodeLoop;
          }

          if (attempt < 1 && this.isTransientResolveError(message)) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }

          break;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error(`Failed to resolve "${source}" on Lavalink`);
  }

  private async resolveUrlWithLavalink(url: string, requestedBy: string, sourceQuery: string): Promise<InternalTrack> {
    if (!this.shoukaku) {
      throw new Error("Lavalink manager is not initialized");
    }

    const canonicalUrl = canonicalYoutubeVideoUrl(url) ?? url;
    const nodes = this.getResolveNodes(this.shoukaku);
    if (!nodes.length) {
      throw new Error("No Lavalink node is available");
    }

    let lastError: Error | null = null;

    nodeLoop: for (const node of nodes) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await node.rest.resolve(canonicalUrl);
          const track = this.extractSingleTrackFromResolveResult(result, requestedBy, sourceQuery);
          if (!track) {
            lastError = new Error(`Lavalink did not return a playable track for ${canonicalUrl}`);
            break;
          }

          const expectedId = extractYoutubeVideoId(canonicalUrl);
          const resolvedId = this.extractTrackVideoId(track);
          if (expectedId) {
            if (!resolvedId) {
              lastError = new Error(`Lavalink resolved a track without a usable video ID for requested ID ${expectedId}`);
              this.recordNodeFailure(node.name, lastError.message);
              continue nodeLoop;
            }
            if (expectedId !== resolvedId) {
              lastError = new Error(`Lavalink resolved a different video (${resolvedId}) than requested (${expectedId})`);
              this.recordNodeFailure(node.name, lastError.message);
              continue nodeLoop;
            }
          }

          this.clearNodeHealth(node.name);
          return track;
        } catch (error) {
          const err = this.toError(error);
          lastError = err;
          const message = err.message.toLowerCase();

          if (this.isSessionNotFoundError(error) && this.shoukaku && this.guildId) {
            await this.resetStaleLavalinkSession(this.shoukaku, this.guildId);
          }

          if (this.isNodePressureError(message)) {
            this.recordNodeFailure(node.name, err.message);
            continue nodeLoop;
          }

          if (attempt < 1 && this.isTransientResolveError(message)) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }

          break;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error(`Failed to resolve "${url}" on Lavalink`);
  }

  private extractTracksFromResolveResult(result: unknown, requestedBy: string, query: string): InternalTrack[] {
    if (!result || typeof result !== "object" || !("loadType" in result)) {
      throw new Error(`No results found for "${query}"`);
    }

    const resolved = result as {
      loadType: LoadType;
      data: LavalinkTrack | { tracks: LavalinkTrack[] } | LavalinkTrack[] | { message?: string };
    };

    if (resolved.loadType === LoadType.EMPTY) {
      throw new Error(`No results found for "${query}"`);
    }
    if (resolved.loadType === LoadType.ERROR) {
      const data = resolved.data as { message?: string };
      throw new Error(data?.message || "Lavalink failed to resolve this track");
    }

    if (resolved.loadType === LoadType.TRACK) {
      return [this.toTrack(resolved.data as LavalinkTrack, requestedBy, query)];
    }

    if (resolved.loadType === LoadType.PLAYLIST) {
      const playlist = resolved.data as { tracks: LavalinkTrack[] };
      const tracks = playlist.tracks.slice(0, 50).map((track) => this.toTrack(track, requestedBy, query));
      if (!tracks.length) {
        throw new Error("Playlist found, but no playable videos were available.");
      }
      return tracks;
    }

    if (resolved.loadType === LoadType.SEARCH) {
      const searchResults = resolved.data as LavalinkTrack[];
      const bestIndex = pickBestSearchIndex(
        searchResults,
        query,
        (track) => track.info.title,
        (track) => track.info.author
      );
      const first = searchResults[bestIndex];
      if (!first) {
        throw new Error(`No valid result found for "${query}".`);
      }
      const alternatives = searchResults
        .filter((_, index) => index !== bestIndex)
        .slice(0, 4)
        .map((track) => this.toTrack(track, requestedBy, query));
      return [this.toTrack(first, requestedBy, query, alternatives)];
    }

    throw new Error("Unsupported Lavalink resolve result");
  }

  private extractSingleTrackFromResolveResult(
    result: unknown,
    requestedBy: string,
    sourceQuery: string
  ): InternalTrack | null {
    if (!result || typeof result !== "object" || !("loadType" in result)) {
      return null;
    }

    const resolved = result as {
      loadType: LoadType;
      data: LavalinkTrack | { message?: string };
    };

    if (resolved.loadType === LoadType.TRACK) {
      return this.toTrack(resolved.data as LavalinkTrack, requestedBy, sourceQuery);
    }

    return null;
  }

  private async prepareTrackForPlayback(track: InternalTrack): Promise<InternalTrack> {
    const canonical = canonicalYoutubeVideoUrl(track.url);
    if (canonical) {
      return { ...track, url: canonical };
    }

    if (!this.shoukaku || !this.isHttpUrl(track.url)) {
      return track;
    }

    if (track.encoded) {
      return track;
    }

    return this.resolveUrlWithLavalink(track.url, track.requestedBy, track.sourceQuery ?? track.url);
  }

  private getResolveNodes(manager: Shoukaku): LavalinkNode[] {
    const connected = this.getHealthyConnectedNodes(manager);
    const playbackNode = this.lavalinkPlayer?.node;
    if (!playbackNode || playbackNode.state !== 1) {
      return connected;
    }

    return [playbackNode, ...connected.filter((node) => node.name !== playbackNode.name)];
  }

  private extractTrackVideoId(track: InternalTrack | LavalinkTrack): string | null {
    if ("info" in track) {
      const identifier = track.info.identifier?.trim();
      if (identifier && /^[a-zA-Z0-9_-]{11}$/.test(identifier)) {
        return identifier;
      }
      return extractYoutubeVideoId(track.info.uri ?? "");
    }

    return extractYoutubeVideoId(track.url);
  }

  private isTransientResolveError(message: string): boolean {
    return (
      message.includes("operation was aborted") ||
      message.includes("aborted") ||
      message.includes("timed out") ||
      message.includes("timeout") ||
      message.includes("temporarily unavailable") ||
      message.includes("websocket closed before a connection was established")
    );
  }

  private mergeNowPlayingWithStartedTrack(startedTrack: LavalinkTrack): InternalTrack {
    const current = this.nowPlaying;
    const base = this.toTrack(
      startedTrack,
      current?.requestedBy ?? "unknown",
      current?.sourceQuery ?? startedTrack.info.title ?? "unknown"
    );

    return {
      ...base,
      requestedBy: current?.requestedBy ?? base.requestedBy,
      sourceQuery: current?.sourceQuery ?? base.sourceQuery,
      alternatives: current?.alternatives
    };
  }

  private toTrack(track: LavalinkTrack, requestedBy: string, sourceQuery: string, alternatives: InternalTrack[] = []): InternalTrack {
    return {
      title: track.info.title || "Unknown Title",
      url: track.info.uri ?? `https://www.youtube.com/watch?v=${track.info.identifier}`,
      duration: this.formatDuration(track.info.length),
      thumbnail: track.info.artworkUrl ?? null,
      requestedBy,
      sourceQuery,
      artistName: track.info.author || undefined,
      durationSeconds: Math.floor(track.info.length / 1000),
      encoded: track.encoded,
      lengthMs: track.info.length,
      alternatives: alternatives.length ? alternatives : undefined
    };
  }

  private normalizeQuery(query: string): string {
    const trimmed = query.trim();
    if (!trimmed) {
      throw new Error("Please provide a song name or URL.");
    }
    if (trimmed.toLowerCase().startsWith("query:")) {
      return trimmed.slice("query:".length).trim();
    }
    return trimmed;
  }

  private isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  private formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) {
      return "Live";
    }
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${m}:${String(s).padStart(2, "0")}`;
  }
}
