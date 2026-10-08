import type {
  GameActionEnvelope,
  GameActionResult,
  GameServerPlugin,
  GameSession,
  GameSessionContext,
  GameSettingValue,
  GameViewer
} from "@gamehub/game-sdk";
import { egyptianWarManifest } from "./definition.js";
import {
  applyEgyptianWarAction,
  createEgyptianWarState,
  createPublicEgyptianWarState,
  EgyptianWarRuleError,
  isEgyptianWarPileSlappable,
  removeEgyptianWarPlayer,
  resolveEgyptianWarTurnTimeout,
  type EgyptianWarAction,
  type EgyptianWarSettings,
  type EgyptianWarState
} from "./engine.js";
import {
  defaultSlapJitterMs,
  selectWeightedSlapWinner,
  slapCollectionWindowMs
} from "./slapArbitration.js";

type SlapCandidate = {
  playerId: string;
  adjustedArrivalTime: number;
  jitterMs: number;
};

type SlapAttempt = {
  playerId: string;
  delayMs: number;
  isWinner: boolean;
};

const reconnectTurnGraceMs = 5_000;

class EgyptianWarSession implements GameSession {
  private readonly state: EgyptianWarState;
  private readonly turnTimerSeconds: number;
  private isPaused = false;
  private isAnimating = false;
  private animationId = 0;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private turnDeadlineAt: number | null = null;
  private turnTimeRemainingMs: number | null = null;
  private reconnectGracePlayerId: string | null = null;
  private reconnectGraceUsedThisTurn = false;
  private pendingSlaps: {
    timer: ReturnType<typeof setTimeout>;
    candidates: Map<string, SlapCandidate>;
  } | null = null;
  private disconnectPausedPlayerId: string | null = null;
  private wasPausedBeforeDisconnect = false;
  private disposed = false;

  constructor(
    private readonly context: GameSessionContext,
    settings: Readonly<Record<string, GameSettingValue>>
  ) {
    const engineSettings: EgyptianWarSettings = {
      deckCount: typeof settings.deckCount === "number" ? settings.deckCount : 1,
      includeJokers: settings.includeJokers === true,
      allowDoubles: settings.allowDoubles === true,
      allowSandwiches: settings.allowSandwiches === true,
      allowFourInARow: settings.allowFourInARow === true,
      allowTopBottom: settings.allowTopBottom === true,
      allowTens: settings.allowTens === true,
      allowMarriage: settings.allowMarriage === true,
      falseSlapPenaltyCards:
        typeof settings.falseSlapPenaltyCards === "number"
          ? settings.falseSlapPenaltyCards
          : 2
    };
    this.turnTimerSeconds =
      typeof settings.turnTimerSeconds === "number"
        ? settings.turnTimerSeconds
        : 15;
    const players = context.members()
      .filter((member) => member.role === "player")
      .map(({ id, name, avatar }) => ({ id, name, avatar }));
    this.state = createEgyptianWarState(
      players,
      engineSettings,
      (maximum) => context.randomInteger(maximum)
    );
  }

  start(): void {
    this.startTurnTimer();
  }

  getLifecycleState() {
    return {
      isPaused: this.isPaused,
      isBusy: this.isAnimating || this.pendingSlaps !== null
    };
  }

  getPublicState(_viewer: GameViewer): unknown {
    const connectedIds = new Set(
      this.context.members()
        .filter((member) => member.role === "player" && member.isConnected)
        .map((member) => member.id)
    );
    return createPublicEgyptianWarState(
      this.state,
      this.isPaused,
      this.isAnimating,
      this.turnTimerSeconds,
      this.getTurnTimeRemainingMs(),
      this.disconnectPausedPlayerId !== null
        ? "A player disconnected; the host may resume the game."
        : this.isPaused
          ? "Game paused by the host."
          : null,
      connectedIds
    );
  }

  handleAction(memberId: string, action: GameActionEnvelope) {
    if (action.type !== "play-card" && action.type !== "slap") {
      return { success: false, message: "That game action is not supported." };
    }
    const actionType = action.type as EgyptianWarAction;
    return new Promise<GameActionResult>((resolve) => {
      this.applyAction(memberId, actionType, resolve);
    });
  }

  pause(): GameActionResult {
    if (this.pendingSlaps !== null) {
      return {
        success: false,
        message: "Wait for the accepted slap decision before pausing."
      };
    }
    if (this.isPaused) return { success: true };
    this.suspendTurnTimer();
    if (this.disconnectPausedPlayerId !== null) {
      this.wasPausedBeforeDisconnect = true;
    }
    this.isPaused = true;
    this.emitPauseChanged();
    this.context.broadcastState();
    return { success: true };
  }

  resume(): GameActionResult {
    if (!this.isPaused) return { success: true };
    if (this.disconnectPausedPlayerId !== null) {
      this.wasPausedBeforeDisconnect = false;
    }
    this.isPaused = false;
    this.startTurnTimer();
    this.emitPauseChanged();
    this.context.broadcastState();
    return { success: true };
  }

  memberDisconnected(memberId: string): void {
    if (this.state.status !== "playing") return;
    this.suspendTurnTimer();
    if (this.disconnectPausedPlayerId === null) {
      this.wasPausedBeforeDisconnect = this.isPaused;
      this.disconnectPausedPlayerId = memberId;
    }
    this.isPaused = true;
    this.isAnimating = false;
    this.animationId += 1;
    const player = this.state.players.find((candidate) => candidate.id === memberId);
    this.state.activityMessage =
      `${player?.name ?? "A player"} disconnected. The game is paused until they return.`;
    this.emitPauseChanged();
    this.context.broadcastState();
  }

  memberReconnected(memberId: string, previousMemberId = memberId): void {
    if (previousMemberId !== memberId) {
      this.remapMemberId(previousMemberId, memberId);
    }
    const player = this.state.players.find((candidate) => candidate.id === memberId);
    if (this.disconnectPausedPlayerId === memberId) {
      const disconnected = this.context.members().find(
        (member) =>
          member.role === "player" &&
          member.id !== memberId &&
          !member.isConnected
      );
      this.disconnectPausedPlayerId = disconnected?.id ?? null;
      if (this.disconnectPausedPlayerId === null) {
        this.isPaused = this.wasPausedBeforeDisconnect;
        this.wasPausedBeforeDisconnect = false;
      }
      this.state.activityMessage = this.disconnectPausedPlayerId !== null
        ? `${player?.name ?? "A player"} reconnected. The game remains paused until the other player returns.`
        : this.isPaused
          ? `${player?.name ?? "A player"} reconnected. The host can resume the game.`
          : `${player?.name ?? "A player"} reconnected. The game is continuing.`;
    }
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (this.state.status === "playing" && currentPlayer?.id === memberId) {
      const remaining = this.getTurnTimeRemainingMs() ?? this.turnTimerSeconds * 1000;
      this.clearTurnTimer(false);
      this.turnTimeRemainingMs = remaining;
      if (!this.reconnectGraceUsedThisTurn) {
        this.reconnectGracePlayerId = memberId;
        this.reconnectGraceUsedThisTurn = true;
      } else {
        this.reconnectGracePlayerId = null;
      }
    }
    if (!this.isPaused && this.turnTimer === null) this.startTurnTimer();
    this.emitPauseChanged();
    this.context.broadcastState();
  }

  memberRemoved(memberId: string): GameActionResult {
    if (this.isAnimating) {
      return { success: false, message: "Wait for the current game animation to finish." };
    }
    if (this.pendingSlaps !== null) {
      return { success: false, message: "Wait for the slap decision to finish." };
    }
    const member = this.context.members().find((candidate) => candidate.id === memberId);
    if (member?.isConnected) {
      return { success: false, message: "Only disconnected players can be kicked during a game." };
    }
    const currentBefore = this.state.players[this.state.currentPlayerIndex]?.id ?? null;
    if (this.turnTimer !== null) this.suspendTurnTimer();
    try {
      removeEgyptianWarPlayer(this.state, memberId);
    } catch (error) {
      return {
        success: false,
        message: error instanceof EgyptianWarRuleError
          ? error.message
          : "Unable to remove that player from the game."
      };
    }
    if (this.reconnectGracePlayerId === memberId) this.reconnectGracePlayerId = null;
    if (this.disconnectPausedPlayerId === memberId) {
      const other = this.context.members().find(
        (candidate) =>
          candidate.role === "player" &&
          candidate.id !== memberId &&
          !candidate.isConnected
      );
      this.disconnectPausedPlayerId = other?.id ?? null;
      if (this.disconnectPausedPlayerId === null) {
        this.isPaused = this.wasPausedBeforeDisconnect;
        this.wasPausedBeforeDisconnect = false;
      }
    }
    const currentAfter = this.state.players[this.state.currentPlayerIndex]?.id ?? null;
    if (currentBefore !== currentAfter) {
      this.turnTimeRemainingMs = null;
      this.reconnectGraceUsedThisTurn = false;
    }
    if (this.state.status === "finished") {
      this.presentRemovalWin(memberId);
    } else {
      if (!this.isPaused && this.turnTimer === null) this.startTurnTimer();
      this.context.broadcastState();
    }
    return { success: true, message: this.state.activityMessage };
  }

  dispose(): void {
    this.disposed = true;
    this.clearTurnTimer();
    this.cancelPendingSlaps();
  }

  private emitPauseChanged(): void {
    this.context.emitEvent({
      type: "pause-changed",
      payload: { isPaused: this.isPaused }
    });
  }

  private getTurnTimeRemainingMs(): number | null {
    return this.turnDeadlineAt === null
      ? this.turnTimeRemainingMs
      : Math.max(0, this.turnDeadlineAt - this.context.now());
  }

  private clearTurnTimer(clearRemaining = true): void {
    if (this.turnTimer !== null) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.turnDeadlineAt = null;
    if (clearRemaining) this.turnTimeRemainingMs = null;
  }

  private suspendTurnTimer(): void {
    this.turnTimeRemainingMs = this.getTurnTimeRemainingMs();
    this.clearTurnTimer(false);
  }

  private startTurnTimer(
    remainingMs = this.turnTimeRemainingMs ?? this.turnTimerSeconds * 1000
  ): void {
    if (
      this.disposed ||
      this.state.status !== "playing" ||
      this.isPaused ||
      this.isAnimating ||
      this.pendingSlaps !== null
    ) return;
    this.clearTurnTimer();
    const duration = this.turnTimerSeconds * 1000;
    const currentId = this.state.players[this.state.currentPlayerIndex]?.id ?? null;
    if (this.reconnectGracePlayerId !== null && this.reconnectGracePlayerId !== currentId) {
      this.reconnectGracePlayerId = null;
    }
    const grace = this.reconnectGracePlayerId === currentId ? reconnectTurnGraceMs : 0;
    if (grace > 0) this.reconnectGracePlayerId = null;
    const delay = Math.max(0, Math.min(duration, remainingMs + grace));
    this.turnTimeRemainingMs = delay;
    this.turnDeadlineAt = this.context.now() + delay;
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      this.turnDeadlineAt = null;
      this.turnTimeRemainingMs = null;
      if (this.disposed || this.state.status !== "playing" || this.isPaused || this.isAnimating) return;
      const current = this.state.players[this.state.currentPlayerIndex];
      if (!current) return;
      this.applyAction(current.id, "play-card", (result) => {
        if (!result.success && !this.disposed) {
          this.startTurnTimer();
          this.context.broadcastState();
        }
      }, true);
    }, delay);
  }

  private collectSlap(memberId: string, respond: (result: GameActionResult) => void): void {
    if (this.pendingSlaps === null) {
      this.pendingSlaps = {
        timer: setTimeout(() => this.resolveSlaps(), slapCollectionWindowMs),
        candidates: new Map()
      };
      this.suspendTurnTimer();
    }
    if (!this.pendingSlaps.candidates.has(memberId)) {
      this.pendingSlaps.candidates.set(memberId, {
        playerId: memberId,
        adjustedArrivalTime: performance.now(),
        jitterMs: defaultSlapJitterMs
      });
    }
    respond({ success: true });
  }

  private cancelPendingSlaps(): void {
    if (this.pendingSlaps === null) return;
    clearTimeout(this.pendingSlaps.timer);
    this.pendingSlaps = null;
  }

  private resolveSlaps(): void {
    const resolution = this.pendingSlaps;
    this.pendingSlaps = null;
    if (!resolution || this.disposed || this.state.status !== "playing" || this.isAnimating) return;
    const candidates = [...resolution.candidates.values()];
    if (candidates.length === 0) {
      if (!this.isPaused) this.startTurnTimer();
      return;
    }
    const winner = selectWeightedSlapWinner(candidates);
    if (!winner) throw new Error("No slap candidate was selected.");
    const ordered = [
      winner,
      ...candidates
        .filter((candidate) => candidate.playerId !== winner.playerId)
        .sort((first, second) => first.adjustedArrivalTime - second.adjustedArrivalTime)
    ];
    let capped = 0;
    const attempts = ordered.map((candidate) => {
      const difference = Math.max(0, candidate.adjustedArrivalTime - winner.adjustedArrivalTime);
      const scaled = difference * 1.5;
      let delayMs = Math.round(Math.min(scaled, slapCollectionWindowMs));
      if (scaled >= slapCollectionWindowMs) delayMs += capped++ * 8;
      return {
        playerId: candidate.playerId,
        delayMs,
        isWinner: candidate.playerId === winner.playerId
      };
    });
    this.applyAction(winner.playerId, "slap", (result) => {
      if (!result.success && !this.disposed && this.state.status === "playing" && !this.isPaused) {
        this.startTurnTimer();
        this.context.broadcastState();
      }
    }, false, true, attempts);
  }

  private applyAction(
    memberId: string,
    action: EgyptianWarAction,
    respond: (result: GameActionResult) => void,
    isTurnTimeout = false,
    isResolvedSlap = false,
    slapAttempts: SlapAttempt[] = []
  ): void {
    if (this.disposed || this.state.status !== "playing") {
      respond({ success: false, message: "Egyptian War is not active." });
      return;
    }
    if (!this.context.members().some((member) => member.id === memberId && member.role === "player")) {
      respond({ success: false, message: "You are not a player in that room." });
      return;
    }
    if (this.isPaused && !isResolvedSlap) {
      respond({ success: false, message: "The host has paused the game." });
      return;
    }
    if (this.isAnimating) {
      respond({ success: false, message: "Wait for the current action to finish." });
      return;
    }
    if (
      action === "slap" &&
      !isTurnTimeout &&
      !isResolvedSlap &&
      this.state.pile.length > this.state.penaltyPileCardCount &&
      isEgyptianWarPileSlappable(
        this.state.pile.slice(this.state.penaltyPileCardCount),
        this.state.settings
      )
    ) {
      this.collectSlap(memberId, respond);
      return;
    }
    if (this.pendingSlaps !== null && !isResolvedSlap) {
      respond({ success: false, message: "A slap is being resolved. Please wait." });
      return;
    }
    const current = this.state.players[this.state.currentPlayerIndex];
    const currentBefore = current?.id ?? null;
    const resolvingWindow = isTurnTimeout && this.state.pendingPileWinnerId !== null;
    const playedCard =
      !resolvingWindow && action === "play-card" && current?.id === memberId && current.cards.length > 0
        ? current.cards[0]
        : null;
    const wasSlappable = action === "slap" && isEgyptianWarPileSlappable(
      this.state.pile.slice(this.state.penaltyPileCardCount),
      this.state.settings
    );
    const previousPileCount = this.state.pile.length;
    const previousCounts = new Map(
      this.state.players.map((player) => [player.id, player.cards.length])
    );
    try {
      if (isTurnTimeout) resolveEgyptianWarTurnTimeout(this.state);
      else applyEgyptianWarAction(this.state, memberId, action);
    } catch (error) {
      respond({
        success: false,
        message: error instanceof EgyptianWarRuleError
          ? error.message
          : "Unable to process that game action."
      });
      return;
    }
    this.suspendTurnTimer();
    const currentAfter = this.state.players[this.state.currentPlayerIndex]?.id ?? null;
    if (action !== "slap" || (wasSlappable && memberId === currentBefore) || currentAfter !== currentBefore) {
      this.turnTimeRemainingMs = null;
      this.reconnectGraceUsedThisTurn = false;
    }
    const status = (this.state as EgyptianWarState).status;
    const pileWinner = this.state.players.find(
      (player) => player.cards.length > (previousCounts.get(player.id) ?? player.cards.length)
    ) ?? (status === "finished"
      ? this.state.players.find((player) => player.id === this.state.winnerId)
      : undefined);
    const penaltyCount = action === "slap" && !wasSlappable
      ? (previousCounts.get(memberId) ?? 0) -
        (this.state.players.find((player) => player.id === memberId)?.cards.length ?? 0)
      : 0;
    const transferCount = pileWinner
      ? previousPileCount + (playedCard === null ? 0 : 1) + penaltyCount
      : 0;
    const isFinalWin = status === "finished";
    const animation = {
      id: ++this.animationId,
      action: resolvingWindow ? "timeout" : action,
      actorId: memberId,
      slapAttempts: action === "slap" ? slapAttempts : [],
      playedCard,
      isValidSlap: action === "slap" && wasSlappable,
      winnerId: pileWinner?.id ?? this.state.winnerId,
      transferCardCount: transferCount,
      pileCardCountBeforeTransfer: transferCount,
      penaltyCardCount: penaltyCount,
      isFinalWin
    };
    this.isAnimating = true;
    this.context.emitEvent({ type: "animation", payload: animation });
    this.context.broadcastState();
    respond({ success: true });
    const duration = isFinalWin
      ? 3600
      : transferCount > 0
        ? 2400
        : action === "slap"
          ? 1050
          : playedCard
            ? 650
            : 450;
    setTimeout(() => {
      if (this.disposed || this.animationId !== animation.id) return;
      this.isAnimating = false;
      if (this.state.status === "finished") {
        this.finish();
        return;
      }
      this.startTurnTimer();
      this.context.broadcastState();
    }, duration);
  }

  private presentRemovalWin(removedId: string): void {
    const winner = this.state.players.find((player) => player.id === this.state.winnerId);
    const animation = {
      id: ++this.animationId,
      action: "kick",
      actorId: removedId,
      playedCard: null,
      isValidSlap: false,
      winnerId: winner?.id ?? null,
      transferCardCount: this.state.totalCardCount,
      pileCardCountBeforeTransfer: this.state.totalCardCount,
      penaltyCardCount: 0,
      isFinalWin: winner !== undefined
    };
    this.isAnimating = true;
    this.context.emitEvent({ type: "animation", payload: animation });
    this.context.broadcastState();
    setTimeout(() => {
      if (!this.disposed && this.animationId === animation.id) this.finish();
    }, 3600);
  }

  private finish(): void {
    this.clearTurnTimer();
    this.cancelPendingSlaps();
    this.context.finish({
      winnerId: this.state.winnerId,
      reason: this.state.activityMessage
    });
  }

  private remapMemberId(previousId: string, memberId: string): void {
    const player = this.state.players.find((candidate) => candidate.id === previousId);
    if (player) player.id = memberId;
    if (this.state.challenge?.challengerId === previousId) {
      this.state.challenge.challengerId = memberId;
    }
    if (this.state.challenge?.responderId === previousId) {
      this.state.challenge.responderId = memberId;
    }
    if (this.state.pendingPileWinnerId === previousId) {
      this.state.pendingPileWinnerId = memberId;
    }
    if (this.reconnectGracePlayerId === previousId) {
      this.reconnectGracePlayerId = memberId;
    }
    if (this.disconnectPausedPlayerId === previousId) {
      this.disconnectPausedPlayerId = memberId;
    }
    const candidate = this.pendingSlaps?.candidates.get(previousId);
    if (candidate) {
      this.pendingSlaps?.candidates.delete(previousId);
      candidate.playerId = memberId;
      this.pendingSlaps?.candidates.set(memberId, candidate);
    }
  }
}

export const egyptianWarServer: GameServerPlugin = {
  manifest: egyptianWarManifest,
  createSession(context, settings) {
    return new EgyptianWarSession(context, settings);
  }
};
