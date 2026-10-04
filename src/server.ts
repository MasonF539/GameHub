import express from "express";
import { randomBytes, randomInt } from "node:crypto";
import http from "http";
import path from "path";
import { Server, type Socket } from "socket.io";
import { egyptianWar } from "./games/egyptianWar.js";
import {
  applyEgyptianWarAction,
  createEgyptianWarState,
  createPublicEgyptianWarState,
  isEgyptianWarPileSlappable,
  removeEgyptianWarPlayer,
  resolveEgyptianWarTurnTimeout,
  type EgyptianWarAction,
  EgyptianWarRuleError,
  type EgyptianWarSettings,
  type EgyptianWarState
} from "./games/egyptianWarEngine.js";
import type { GameSetting } from "./games/gameDefinition.js";
import {
  estimateSlapLatencyCorrection,
  getSlapCandidatesWithinTieWindow,
  slapCollectionWindowMs
} from "./games/slapArbitration.js";

type GameSettingValue = boolean | number;

type Player = {
  id: string;
  name: string;
  avatar: string;
  isConnected: boolean;
};

type PendingSlapCandidate = {
  playerId: string;
  adjustedArrivalTime: number;
};

type Room = {
  hostId: string;
  players: Map<string, Player>;
  selectedGameId: string | null;
  gameSettings: Record<string, GameSettingValue>;
  isLocked: boolean;
  activeGameId: string | null;
  gameState: EgyptianWarState | null;
  isPaused: boolean;
  isAnimating: boolean;
  animationId: number;
  turnTimer: ReturnType<typeof setTimeout> | null;
  turnDeadlineAt: number | null;
  turnTimeRemainingMs: number | null;
  reconnectGracePlayerId: string | null;
  reconnectGraceUsedThisTurn: boolean;
  pendingSlapResolution: {
    timer: ReturnType<typeof setTimeout>;
    candidates: Map<string, PendingSlapCandidate>;
  } | null;
  disconnectPausedPlayerId: string | null;
  wasPausedBeforeDisconnect: boolean;
};

const availableAvatars = [
  "🐱",
  "🐶",
  "🦊",
  "🐸",
  "🐼",
  "🐯",
  "🐵",
  "🐙",
  "🦄",
  "🐲",
  "🤖",
  "👻",
  "👽",
  "🥷",
  "🧙"
];

const availableGames = [
  egyptianWar
];

const app = express();
const server = http.createServer(app);
const reconnectGracePeriodMs = 120_000;
const reconnectTurnGraceMs = 5_000;
const gameEndAnimationMs = 3_600;
const io = new Server(server, {
  connectionStateRecovery: {
    maxDisconnectionDuration: reconnectGracePeriodMs,
    skipMiddlewares: true
  }
});

const port = Number(process.env.PORT) || 3000;
const maxLobbyPlayers = 12;
const rooms = new Map<string, Room>();
const socketRoomCodes = new Map<string, string>();
const disconnectedPlayerTimers =
  new Map<string, ReturnType<typeof setTimeout>>();
const playerResumeTokens =
  new Map<string, { roomCode: string; playerId: string }>();
const revokedResumeTokenMessages = new Map<string, string>();
const revokedSocketMessages = new Map<string, string>();
const socketRoundTripTimes = new Map<string, number>();

app.use(
  "/vendor/bootstrap",
  express.static(
    path.join(process.cwd(), "node_modules", "bootstrap", "dist")
  )
);

app.use(express.static(path.join(process.cwd(), "public")));

function generateRoomCode(): string {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  do {
    code = "";

    for (let index = 0; index < 6; index += 1) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      code += characters[randomIndex];
    }
  } while (rooms.has(code));

  return code;
}

function sendPlayerList(roomCode: string, room: Room): void {
  const players = Array.from(room.players.values()).map((player) => ({
    ...player,
    isHost: player.id === room.hostId
  }));

  io.to(roomCode).emit("player-list", players);
}

function monitorSocketLatency(socket: Socket): void {
  const measureRoundTripTime = (): void => {
    const startedAt = performance.now();
    socket.timeout(3_000).emit(
      "latency-probe",
      (error: Error | null) => {
        if (error || !socket.connected) {
          return;
        }

        const sample = performance.now() - startedAt;
        const previous = socketRoundTripTimes.get(socket.id);
        socketRoundTripTimes.set(
          socket.id,
          previous === undefined
            ? sample
            : previous * 0.8 + sample * 0.2
        );
      }
    );
  };

  measureRoundTripTime();
  const interval = setInterval(measureRoundTripTime, 5_000);
  socket.on("disconnect", () => {
    clearInterval(interval);
    socketRoundTripTimes.delete(socket.id);
  });
}

function createPlayerResumeToken(
  roomCode: string,
  playerId: string
): string {
  const token = randomBytes(32).toString("base64url");
  playerResumeTokens.set(token, { roomCode, playerId });
  return token;
}

function removePlayerResumeTokens(
  playerId: string,
  revokedMessage?: string
): void {
  for (const [token, session] of playerResumeTokens) {
    if (session.playerId === playerId) {
      playerResumeTokens.delete(token);
      if (revokedMessage) {
        revokedResumeTokenMessages.set(token, revokedMessage);
        setTimeout(() => {
          revokedResumeTokenMessages.delete(token);
        }, reconnectGracePeriodMs);
      }
    }
  }
}

function markPlayerReconnected(
  roomCode: string,
  playerId: string,
  room: Room
): void {
  const reconnectTimer = disconnectedPlayerTimers.get(playerId);

  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    disconnectedPlayerTimers.delete(playerId);
  }

  const player = room.players.get(playerId);

  if (player) {
    player.isConnected = true;
  }

  if (room.disconnectPausedPlayerId === playerId) {
    const stillDisconnectedPlayer = Array.from(
      room.players.values()
    ).find((candidate) => !candidate.isConnected);

    room.disconnectPausedPlayerId =
      stillDisconnectedPlayer?.id ?? null;

    if (room.disconnectPausedPlayerId === null) {
      room.isPaused = room.wasPausedBeforeDisconnect;
      room.wasPausedBeforeDisconnect = false;
    }

    if (room.gameState && player) {
      room.gameState.activityMessage =
        room.disconnectPausedPlayerId !== null
          ? `${player.name} reconnected. The game remains paused until the other player returns.`
          : room.isPaused
            ? `${player.name} reconnected. The host can resume the game.`
            : `${player.name} reconnected. The game is continuing.`;
    }
  }

  const currentPlayer =
    room.gameState?.players[room.gameState.currentPlayerIndex];
  if (
    room.gameState?.status === "playing" &&
    currentPlayer?.id === playerId
  ) {
    const remainingMs =
      getTurnTimeRemainingMs(room) ??
      getTurnTimerSeconds(room) * 1000;
    clearTurnTimer(room, false);
    room.turnTimeRemainingMs = remainingMs;
    if (!room.reconnectGraceUsedThisTurn) {
      room.reconnectGracePlayerId = playerId;
      room.reconnectGraceUsedThisTurn = true;
    } else {
      room.reconnectGracePlayerId = null;
    }
  }

  if (
    !room.isPaused &&
    room.activeGameId !== null &&
    room.turnTimer === null
  ) {
    startTurnTimer(roomCode, room);
  }
}

function sendRoomResumed(
  socket: Socket,
  roomCode: string,
  room: Room
): void {
  socket.emit("room-resumed", {
    roomCode,
    isHost: room.hostId === socket.id,
    isLocked: room.isLocked,
    selectedGameId: room.selectedGameId,
    gameSettings: room.gameSettings,
    activeGameId: room.activeGameId,
    isPaused: room.isPaused,
    chatEnabled: availableGames.find(
      (game) => game.id === room.activeGameId
    )?.chatEnabled ?? false
  });

  if (room.activeGameId === egyptianWar.id) {
    sendEgyptianWarState(roomCode, room);
  }
}

function createDefaultSettings(
  gameId: string
): Record<string, GameSettingValue> | null {
  const game = availableGames.find((item) => item.id === gameId);

  if (!game) {
    return null;
  }

  return Object.fromEntries(
    game.settings.map((setting) => [
      setting.key,
      setting.defaultValue
    ])
  );
}

function getTurnTimerSeconds(room: Room): number {
  const configuredSeconds = room.gameSettings.turnTimerSeconds;

  return typeof configuredSeconds === "number"
    ? configuredSeconds
    : 15;
}

function getTurnTimeRemainingMs(room: Room): number | null {
  if (room.turnDeadlineAt !== null) {
    return Math.max(0, room.turnDeadlineAt - Date.now());
  }

  return room.turnTimeRemainingMs;
}

function clearTurnTimer(room: Room, clearRemaining = true): void {
  if (room.turnTimer !== null) {
    clearTimeout(room.turnTimer);
  }

  room.turnTimer = null;
  room.turnDeadlineAt = null;

  if (clearRemaining) {
    room.turnTimeRemainingMs = null;
  }
}

function suspendTurnTimer(room: Room): void {
  room.turnTimeRemainingMs = getTurnTimeRemainingMs(room);
  clearTurnTimer(room, false);
}

function startTurnTimer(
  roomCode: string,
  room: Room,
  remainingMs = room.turnTimeRemainingMs ?? getTurnTimerSeconds(room) * 1000
): void {
  if (
    room.gameState === null ||
    room.gameState.status !== "playing" ||
    room.isPaused ||
    room.isAnimating ||
    room.pendingSlapResolution !== null
  ) {
    return;
  }

  clearTurnTimer(room);
  const timerDurationMs = getTurnTimerSeconds(room) * 1000;
  const currentPlayerId =
    room.gameState.players[room.gameState.currentPlayerIndex]?.id ?? null;
  if (
    room.reconnectGracePlayerId !== null &&
    room.reconnectGracePlayerId !== currentPlayerId
  ) {
    room.reconnectGracePlayerId = null;
  }
  const reconnectGraceMs =
    room.reconnectGracePlayerId === currentPlayerId
      ? reconnectTurnGraceMs
      : 0;
  if (reconnectGraceMs > 0) {
    room.reconnectGracePlayerId = null;
  }
  const delayMs =
    Math.max(
      0,
      Math.min(timerDurationMs, remainingMs + reconnectGraceMs)
    );
  room.turnTimeRemainingMs = delayMs;
  room.turnDeadlineAt = Date.now() + delayMs;
  room.turnTimer = setTimeout(() => {
    room.turnTimer = null;
    room.turnDeadlineAt = null;
    room.turnTimeRemainingMs = null;

    if (
      rooms.get(roomCode) !== room ||
      room.gameState === null ||
      room.gameState.status !== "playing" ||
      room.isPaused ||
      room.isAnimating
    ) {
      return;
    }

    const currentPlayer =
      room.gameState.players[room.gameState.currentPlayerIndex];

    if (!currentPlayer) {
      return;
    }

    handleEgyptianWarAction(
      roomCode,
      currentPlayer.id,
      "play-card",
      (response) => {
        if (!response.success && rooms.get(roomCode) === room) {
          startTurnTimer(roomCode, room);
          sendEgyptianWarState(roomCode, room);
        }
      },
      true
    );
  }, delayMs);
}

function collectValidSlap(
  roomCode: string,
  playerId: string,
  room: Room,
  respond: (response: { success: boolean; message?: string }) => void
): void {
  let resolution = room.pendingSlapResolution;

  if (resolution === null) {
    resolution = {
      timer: setTimeout(() => {
        resolveCollectedSlaps(roomCode, room);
      }, slapCollectionWindowMs),
      candidates: new Map()
    };
    room.pendingSlapResolution = resolution;
    suspendTurnTimer(room);
  }

  if (!resolution.candidates.has(playerId)) {
    const roundTripTime = socketRoundTripTimes.get(playerId) ?? 0;
    const latencyCorrection =
      estimateSlapLatencyCorrection(roundTripTime);
    resolution.candidates.set(playerId, {
      playerId,
      adjustedArrivalTime: performance.now() - latencyCorrection
    });
  }

  respond({ success: true });
}

function resolveCollectedSlaps(
  roomCode: string,
  room: Room
): void {
  const resolution = room.pendingSlapResolution;
  room.pendingSlapResolution = null;

  if (
    !resolution ||
    rooms.get(roomCode) !== room ||
    room.gameState === null ||
    room.gameState.status !== "playing"
  ) {
    return;
  }

  const candidates = Array.from(resolution.candidates.values());
  if (candidates.length === 0) {
    if (!room.isPaused) {
      startTurnTimer(roomCode, room);
    }
    return;
  }

  const tiedCandidates =
    getSlapCandidatesWithinTieWindow(candidates);
  const winner = tiedCandidates[randomInt(tiedCandidates.length)];

  if (!winner) {
    throw new Error("No slap candidate was selected.");
  }

  handleEgyptianWarAction(
    roomCode,
    winner.playerId,
    "slap",
    () => {},
    false,
    true
  );
}

function sendEgyptianWarState(roomCode: string, room: Room): void {
  if (room.gameState === null) {
    return;
  }

  io.to(roomCode).emit(
    "egyptian-war-state",
    createPublicEgyptianWarState(
      room.gameState,
      room.isPaused,
      room.isAnimating,
      getTurnTimerSeconds(room),
      getTurnTimeRemainingMs(room),
      room.disconnectPausedPlayerId !== null
        ? "A player disconnected; the host may resume the game."
        : room.isPaused
          ? "Game paused by the host."
          : null,
      new Set(
        Array.from(room.players.values())
          .filter((player) => player.isConnected)
          .map((player) => player.id)
      )
    )
  );
}

function completeEgyptianWar(roomCode: string, room: Room): void {
  const state = room.gameState;

  if (state === null || state.status !== "finished") {
    return;
  }

  clearTurnTimer(room);
  if (room.pendingSlapResolution !== null) {
    clearTimeout(room.pendingSlapResolution.timer);
    room.pendingSlapResolution = null;
  }
  room.activeGameId = null;
  room.gameState = null;
  room.isPaused = false;
  room.isAnimating = false;
  io.to(roomCode).emit("game-ended", {
    winnerId: state.winnerId,
    message: state.activityMessage
  });
}

function validateGameSetting(
  setting: GameSetting,
  value: unknown
): value is GameSettingValue {
  if (setting.type === "number") {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return false;
    }

    if (setting.control === "range") {
      return value >= setting.min &&
        value <= setting.max &&
        (value - setting.min) % setting.step === 0;
    }

    return setting.options.includes(value);
  }

  return typeof value === "boolean";
}

function handleEgyptianWarAction(
  roomCode: string,
  playerId: string,
  action: EgyptianWarAction,
  respond: (response: { success: boolean; message?: string }) => void,
  isTurnTimeout = false,
  isResolvedSlap = false
): void {
  const room = rooms.get(roomCode);

  if (
    !room ||
    room.activeGameId !== egyptianWar.id ||
    room.gameState === null ||
    room.gameState.status !== "playing"
  ) {
    respond({
      success: false,
      message: "Egyptian War is not active in that room."
    });
    return;
  }

  if (!room.players.has(playerId)) {
    respond({
      success: false,
      message: "You are not a player in that room."
    });
    return;
  }

  if (room.isPaused && !isResolvedSlap) {
    respond({
      success: false,
      message: "The host has paused the game."
    });
    return;
  }

  if (room.isAnimating && !isResolvedSlap) {
    respond({
      success: false,
      message: "Wait for the current action to finish."
    });
    return;
  }

  const state = room.gameState;
  if (
    action === "slap" &&
    !isTurnTimeout &&
    !isResolvedSlap &&
    state.pile.length > state.penaltyPileCardCount &&
    isEgyptianWarPileSlappable(
      state.pile.slice(state.penaltyPileCardCount),
      state.settings
    )
  ) {
    collectValidSlap(roomCode, playerId, room, respond);
    return;
  }

  if (room.pendingSlapResolution !== null && !isResolvedSlap) {
    respond({
      success: false,
      message: "A slap is being resolved. Please wait."
    });
    return;
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  const currentPlayerIdBeforeAction = currentPlayer?.id ?? null;
  const isResolvingSlapWindow =
    isTurnTimeout && state.pendingPileWinnerId !== null;
  const playedCard =
    !isResolvingSlapWindow &&
    action === "play-card" &&
    currentPlayer?.id === playerId &&
    currentPlayer.cards.length > 0
      ? currentPlayer.cards[0]
      : null;
  const wasSlappable =
    action === "slap" &&
    isEgyptianWarPileSlappable(
      state.pile.slice(state.penaltyPileCardCount),
      state.settings
    );
  const previousPileCount = state.pile.length;
  const previousCardCounts = new Map(
    state.players.map((player) => [player.id, player.cards.length])
  );

  try {
    if (isTurnTimeout) {
      resolveEgyptianWarTurnTimeout(state);
    } else {
      applyEgyptianWarAction(state, playerId, action);
    }
  } catch (error) {
    if (!(error instanceof EgyptianWarRuleError)) {
      console.error(
        `Unexpected error while processing ${action} in room ${roomCode}:`,
        error
      );
      respond({
        success: false,
        message: "Unable to process that game action."
      });
      return;
    }

    respond({
      success: false,
      message: error.message
    });
    return;
  }

  suspendTurnTimer(room);
  const currentPlayerIdAfterAction =
    state.players[state.currentPlayerIndex]?.id ?? null;

  if (
    action !== "slap" ||
    (wasSlappable && playerId === currentPlayerIdBeforeAction) ||
    currentPlayerIdAfterAction !== currentPlayerIdBeforeAction
  ) {
    room.turnTimeRemainingMs = null;
    room.reconnectGraceUsedThisTurn = false;
  }

  const pileWinner = state.players.find((player) =>
    player.cards.length >
    (previousCardCounts.get(player.id) ?? player.cards.length)
  ) ?? (
    state.status === "finished"
      ? state.players.find((player) => player.id === state.winnerId)
      : undefined
  );
  const pileWasAwarded =
    pileWinner !== undefined &&
    (previousPileCount > 0 || playedCard !== null);
  const isFinalWin = state.status === "finished";
  const penaltyCardCount =
    action === "slap" && !wasSlappable
      ? (previousCardCounts.get(playerId) ?? 0) -
        (state.players.find((player) => player.id === playerId)?.cards.length ?? 0)
      : 0;
  const collectedPileCardCount = pileWinner
    ? previousPileCount +
      (playedCard === null ? 0 : 1) +
      penaltyCardCount
    : 0;

  room.animationId += 1;
  const animation = {
    id: room.animationId,
    action: isResolvingSlapWindow ? "timeout" : action,
    actorId: playerId,
    playedCard,
    isValidSlap: action === "slap" && wasSlappable,
    winnerId: pileWinner?.id ?? state.winnerId,
    transferCardCount: collectedPileCardCount,
    pileCardCountBeforeTransfer: collectedPileCardCount,
    penaltyCardCount,
    isFinalWin
  };

  room.isAnimating = true;
  io.to(roomCode).emit("egyptian-war-animation", animation);
  sendEgyptianWarState(roomCode, room);
  respond({ success: true });

  const animationDuration = isFinalWin
    ? 3600
    : animation.transferCardCount > 0
      ? 2400
      : action === "slap"
        ? 1050
        : playedCard
          ? 650
          : 450;

  setTimeout(() => {
    if (
      rooms.get(roomCode) !== room ||
      room.animationId !== animation.id ||
      room.gameState === null
    ) {
      return;
    }

    room.isAnimating = false;

    if (room.gameState.status === "finished") {
      completeEgyptianWar(roomCode, room);
      return;
    }

    startTurnTimer(roomCode, room);
    sendEgyptianWarState(roomCode, room);
  }, animationDuration);
}

io.on("connection", (socket) => {
  console.log(`Browser connected: ${socket.id}`);
  monitorSocketLatency(socket);

  socket.emit("available-games", availableGames);

  if (socket.recovered) {
    const roomCode = socketRoomCodes.get(socket.id);
    const room = roomCode ? rooms.get(roomCode) : undefined;
    const player = room?.players.get(socket.id);

    if (roomCode && room && player) {
      markPlayerReconnected(roomCode, socket.id, room);
      socket.join(roomCode);
      sendRoomResumed(socket, roomCode, room);
      socket.emit("room-lock-changed", {
        isLocked: room.isLocked
      });

      if (room.selectedGameId !== null) {
        socket.emit("game-selected", {
          gameId: room.selectedGameId,
          settings: room.gameSettings
        });
      }

      sendPlayerList(roomCode, room);
      if (room.disconnectPausedPlayerId === null) {
        io.to(roomCode).emit("egyptian-war-pause-changed", {
          isPaused: room.isPaused
        });
      }
    } else {
      const revokedMessage = revokedSocketMessages.get(socket.id);
      if (revokedMessage) {
        revokedSocketMessages.delete(socket.id);
      }
      socket.emit(
        "room-resume-failed",
        revokedMessage ?? null
      );
    }
  }

  socket.on("resume-room", (data, respond) => {
    const token = String(data?.resumeToken ?? "");
    const session = playerResumeTokens.get(token);

    if (!session) {
      const revokedMessage = revokedResumeTokenMessages.get(token);
      if (revokedMessage) {
        revokedResumeTokenMessages.delete(token);
      }
      respond({
        success: false,
        message: revokedMessage ??
          "That saved room session is no longer available."
      });
      return;
    }

    const connectedRoomCode = socketRoomCodes.get(socket.id);
    if (
      connectedRoomCode !== undefined &&
      (
        connectedRoomCode !== session.roomCode ||
        session.playerId !== socket.id
      )
    ) {
      respond({
        success: false,
        message: "You are already connected to a room."
      });
      return;
    }

    const room = rooms.get(session.roomCode);
    const player = room?.players.get(session.playerId);

    if (!room || !player) {
      respond({
        success: false,
        message: "That saved room session is no longer available."
      });
      return;
    }

    const oldPlayerId = session.playerId;
    if (
      oldPlayerId === socket.id &&
      connectedRoomCode === session.roomCode &&
      player.isConnected
    ) {
      socket.join(session.roomCode);
      sendRoomResumed(socket, session.roomCode, room);
      socket.emit("room-lock-changed", {
        isLocked: room.isLocked
      });
      if (room.selectedGameId !== null) {
        socket.emit("game-selected", {
          gameId: room.selectedGameId,
          settings: room.gameSettings
        });
      }
      sendPlayerList(session.roomCode, room);
      io.to(session.roomCode).emit("egyptian-war-pause-changed", {
        isPaused: room.isPaused
      });
      respond({ success: true });
      return;
    }

    const previousSocket = io.sockets.sockets.get(oldPlayerId);
    room.players.delete(oldPlayerId);
    player.id = socket.id;
    player.isConnected = true;
    room.players.set(socket.id, player);
    socketRoomCodes.delete(oldPlayerId);
    socketRoomCodes.set(socket.id, session.roomCode);

    if (room.hostId === oldPlayerId) {
      room.hostId = socket.id;
    }

    const gamePlayer = room.gameState?.players.find(
      (candidate) => candidate.id === oldPlayerId
    );

    if (gamePlayer) {
      gamePlayer.id = socket.id;
    }

    if (room.gameState?.challenge) {
      if (room.gameState.challenge.challengerId === oldPlayerId) {
        room.gameState.challenge.challengerId = socket.id;
      }

      if (room.gameState.challenge.responderId === oldPlayerId) {
        room.gameState.challenge.responderId = socket.id;
      }
    }

    if (room.gameState?.pendingPileWinnerId === oldPlayerId) {
      room.gameState.pendingPileWinnerId = socket.id;
    }

    if (room.reconnectGracePlayerId === oldPlayerId) {
      room.reconnectGracePlayerId = socket.id;
    }

    const pendingSlapCandidate =
      room.pendingSlapResolution?.candidates.get(oldPlayerId);
    if (pendingSlapCandidate) {
      room.pendingSlapResolution?.candidates.delete(oldPlayerId);
      pendingSlapCandidate.playerId = socket.id;
      room.pendingSlapResolution?.candidates.set(
        socket.id,
        pendingSlapCandidate
      );
    }

    if (previousSocket && oldPlayerId !== socket.id) {
      previousSocket.emit("room-session-replaced");
      previousSocket.leave(session.roomCode);
    }

    const reconnectTimer = disconnectedPlayerTimers.get(oldPlayerId);

    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      disconnectedPlayerTimers.delete(oldPlayerId);
    }

    if (room.disconnectPausedPlayerId === oldPlayerId) {
      room.disconnectPausedPlayerId = socket.id;
    }

    removePlayerResumeTokens(oldPlayerId);
    const rotatedResumeToken = createPlayerResumeToken(
      session.roomCode,
      socket.id
    );
    playerResumeTokens.delete(token);
    socket.join(session.roomCode);
    markPlayerReconnected(session.roomCode, socket.id, room);
    sendRoomResumed(socket, session.roomCode, room);
    socket.emit("room-resume-token", rotatedResumeToken);
    socket.emit("room-lock-changed", {
      isLocked: room.isLocked
    });

    if (room.selectedGameId !== null) {
      socket.emit("game-selected", {
        gameId: room.selectedGameId,
        settings: room.gameSettings
      });
    }

    sendPlayerList(session.roomCode, room);
    io.to(session.roomCode).emit("egyptian-war-pause-changed", {
      isPaused: room.isPaused
    });
    respond({ success: true });
  });

  socket.on("create-room", (data, respond) => {
    if (socketRoomCodes.has(socket.id)) {
      respond({
        success: false,
        message: "You are already in a room."
      });
      return;
    }

    const playerName = String(data?.playerName ?? "").trim();
    const avatar = String(data?.avatar ?? "");

    if (playerName.length < 1 || playerName.length > 20) {
      respond({
        success: false,
        message: "Enter a name between 1 and 20 characters."
      });
      return;
    }

    if (!availableAvatars.includes(avatar)) {
      respond({
        success: false,
        message: "Select a valid avatar."
      });
      return;
    }

    const roomCode = generateRoomCode();

    const room: Room = {
      hostId: socket.id,
      players: new Map(),
      selectedGameId: null,
      gameSettings: {},
      isLocked: false,
      activeGameId: null,
      gameState: null,
      isPaused: false,
      isAnimating: false,
      animationId: 0,
      turnTimer: null,
      turnDeadlineAt: null,
      turnTimeRemainingMs: null,
      reconnectGracePlayerId: null,
      reconnectGraceUsedThisTurn: false,
      pendingSlapResolution: null,
      disconnectPausedPlayerId: null,
      wasPausedBeforeDisconnect: false
    };

    room.players.set(socket.id, {
      id: socket.id,
      name: playerName,
      avatar,
      isConnected: true
    });

    rooms.set(roomCode, room);
    socketRoomCodes.set(socket.id, roomCode);
    socket.join(roomCode);

    sendPlayerList(roomCode, room);
    const resumeToken = createPlayerResumeToken(
      roomCode,
      socket.id
    );

    console.log(`Room ${roomCode} created by ${playerName}`);

    respond({
      success: true,
      roomCode,
      playerName,
      resumeToken
    });
  });

  socket.on("join-room", (data, respond) => {
    if (socketRoomCodes.has(socket.id)) {
      respond({
        success: false,
        message: "You are already in a room."
      });
      return;
    }

    const roomCode = String(data?.roomCode ?? "").trim().toUpperCase();
    const playerName = String(data?.playerName ?? "").trim();
    const avatar = String(data?.avatar ?? "");

    if (roomCode.length !== 6) {
      respond({
        success: false,
        message: "Enter a valid six-character room code."
      });
      return;
    }

    if (playerName.length < 1 || playerName.length > 20) {
      respond({
        success: false,
        message: "Enter a name between 1 and 20 characters."
      });
      return;
    }

    if (!availableAvatars.includes(avatar)) {
      respond({
        success: false,
        message: "Select a valid avatar."
      });
      return;
    }

    const room = rooms.get(roomCode);

    if (!room) {
      respond({
        success: false,
        message: "That room does not exist."
      });
      return;
    }

    if (room.activeGameId !== null) {
      respond({
        success: false,
        message:
          "This game is already in progress. Spectator mode is not available yet."
      });
      return;
    }

    if (room.isLocked) {
      respond({
        success: false,
        message: "This lobby is locked by the host."
      });
      return;
    }

    if (room.players.size >= maxLobbyPlayers) {
      respond({
        success: false,
        message:
          `This lobby is full. It only allows up to ` +
          `${maxLobbyPlayers} players.`
      });
      return;
    }

    room.players.set(socket.id, {
      id: socket.id,
      name: playerName,
      avatar,
      isConnected: true
    });

    socketRoomCodes.set(socket.id, roomCode);
    socket.join(roomCode);
    sendPlayerList(roomCode, room);

    socket.emit("room-lock-changed", {
      isLocked: room.isLocked
    });

    if (room.selectedGameId !== null) {
      socket.emit("game-selected", {
        gameId: room.selectedGameId,
        settings: room.gameSettings
      });
    }

    console.log(`${playerName} joined room ${roomCode}`);
    const resumeToken = createPlayerResumeToken(
      roomCode,
      socket.id
    );

    respond({
      success: true,
      roomCode,
      playerName,
      resumeToken
    });
  });

  socket.on("select-game", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "")
      .trim()
      .toUpperCase();

    const gameId = String(data?.gameId ?? "");
    const room = rooms.get(roomCode);

    if (!room) {
      respond({
        success: false,
        message: "That room no longer exists."
      });
      return;
    }

    if (room.hostId !== socket.id) {
      respond({
        success: false,
        message: "Only the host can select a game."
      });
      return;
    }

    if (room.activeGameId !== null) {
      respond({
        success: false,
        message: "A game is already in progress."
      });
      return;
    }

    const game = availableGames.find((item) => item.id === gameId);

    if (!game) {
      respond({
        success: false,
        message: "Select a valid game."
      });
      return;
    }

    const defaultSettings = createDefaultSettings(game.id);

    if (!defaultSettings) {
      respond({
        success: false,
        message: "Unable to create the game settings."
      });
      return;
    }

    room.selectedGameId = game.id;
    room.gameSettings = defaultSettings;

    io.to(roomCode).emit("game-selected", {
      gameId: game.id,
      settings: room.gameSettings
    });

    console.log(`${game.name} selected in room ${roomCode}`);

    respond({
      success: true
    });
  });

  socket.on("update-game-settings", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "")
      .trim()
      .toUpperCase();

    const room = rooms.get(roomCode);

    if (!room) {
      respond({
        success: false,
        message: "That room no longer exists."
      });
      return;
    }

    if (room.hostId !== socket.id) {
      respond({
        success: false,
        message: "Only the host can change game settings."
      });
      return;
    }

    if (room.activeGameId !== null) {
      respond({
        success: false,
        message: "Settings cannot change after the game starts."
      });
      return;
    }

    if (room.selectedGameId === null) {
      respond({
        success: false,
        message: "Select a game before changing its settings."
      });
      return;
    }

    const game = availableGames.find(
      (item) => item.id === room.selectedGameId
    );

    if (!game) {
      respond({
        success: false,
        message: "The selected game is unavailable."
      });
      return;
    }

    const submittedSettings = data?.settings;

    if (
      typeof submittedSettings !== "object" ||
      submittedSettings === null
    ) {
      respond({
        success: false,
        message: "Invalid game settings."
      });
      return;
    }

    const validatedSettings: Record<string, GameSettingValue> = {};

    for (const setting of game.settings) {
      const value = submittedSettings[setting.key];

      if (!validateGameSetting(setting, value)) {
        respond({
          success: false,
          message: `Invalid value for ${setting.label}.`
        });
        return;
      }

      validatedSettings[setting.key] = value;
    }

    room.gameSettings = validatedSettings;

    io.to(roomCode).emit("game-settings-updated", {
      gameId: game.id,
      settings: room.gameSettings
    });

    console.log(`Settings updated in room ${roomCode}`);

    respond({
      success: true
    });
  });

  socket.on("set-room-locked", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "")
      .trim()
      .toUpperCase();

    const room = rooms.get(roomCode);

    if (!room) {
      respond({
        success: false,
        message: "That room no longer exists."
      });
      return;
    }

    if (room.hostId !== socket.id) {
      respond({
        success: false,
        message: "Only the host can lock or unlock the lobby."
      });
      return;
    }

    if (typeof data?.isLocked !== "boolean") {
      respond({
        success: false,
        message: "Invalid lobby lock setting."
      });
      return;
    }

    room.isLocked = data.isLocked;

    io.to(roomCode).emit("room-lock-changed", {
      isLocked: room.isLocked
    });

    console.log(
      `Room ${roomCode} ${room.isLocked ? "locked" : "unlocked"}`
    );

    respond({
      success: true
    });
  });

  socket.on("kick-player", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "")
      .trim()
      .toUpperCase();

    const playerId = String(data?.playerId ?? "");
    const room = rooms.get(roomCode);

    if (!room) {
      respond({
        success: false,
        message: "That room no longer exists."
      });
      return;
    }

    if (room.hostId !== socket.id) {
      respond({
        success: false,
        message: "Only the host can remove players."
      });
      return;
    }

    const isActiveEgyptianWar =
      room.activeGameId === egyptianWar.id &&
      room.gameState?.status === "playing";

    if (isActiveEgyptianWar && room.isAnimating) {
      respond({
        success: false,
        message: "Wait for the current game animation to finish."
      });
      return;
    }

    if (
      isActiveEgyptianWar &&
      room.pendingSlapResolution !== null
    ) {
      respond({
        success: false,
        message: "Wait for the slap decision to finish."
      });
      return;
    }

    if (room.activeGameId !== null && !isActiveEgyptianWar) {
      respond({
        success: false,
        message: "Players cannot be kicked during this game."
      });
      return;
    }

    if (playerId === room.hostId) {
      respond({
        success: false,
        message: "The host cannot remove themselves."
      });
      return;
    }

    const player = room.players.get(playerId);

    if (!player) {
      respond({
        success: false,
        message: "That player is no longer in the room."
      });
      return;
    }

    if (isActiveEgyptianWar && player.isConnected) {
      respond({
        success: false,
        message: "Only disconnected players can be kicked during a game."
      });
      return;
    }

    const currentGamePlayerId =
      room.gameState?.players[room.gameState.currentPlayerIndex]?.id ??
      null;
    if (isActiveEgyptianWar && room.turnTimer !== null) {
      suspendTurnTimer(room);
    }

    if (isActiveEgyptianWar && room.gameState) {
      try {
        removeEgyptianWarPlayer(room.gameState, playerId);
      } catch (error) {
        if (!(error instanceof EgyptianWarRuleError)) {
          console.error(
            `Unable to remove ${player.name} from Egyptian War in room ${roomCode}:`,
            error
          );
          respond({
            success: false,
            message: "Unable to remove that player from the game."
          });
          return;
        }

        respond({
          success: false,
          message: error.message
        });
        return;
      }
    }

    room.players.delete(playerId);
    socketRoomCodes.delete(playerId);
    const kickedMessage = isActiveEgyptianWar
      ? "You were kicked from the game while disconnected."
      : "You were kicked from the lobby while disconnected.";
    removePlayerResumeTokens(playerId, kickedMessage);
    revokedSocketMessages.set(playerId, kickedMessage);
    setTimeout(() => {
      revokedSocketMessages.delete(playerId);
    }, reconnectGracePeriodMs);
    const reconnectTimer = disconnectedPlayerTimers.get(playerId);

    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      disconnectedPlayerTimers.delete(playerId);
    }

    if (room.reconnectGracePlayerId === playerId) {
      room.reconnectGracePlayerId = null;
    }

    if (room.disconnectPausedPlayerId === playerId) {
      const otherDisconnectedPlayer = Array.from(
        room.players.values()
      ).find((candidate) => !candidate.isConnected);
      room.disconnectPausedPlayerId =
        otherDisconnectedPlayer?.id ?? null;

      if (room.disconnectPausedPlayerId === null) {
        room.isPaused = room.wasPausedBeforeDisconnect;
        room.wasPausedBeforeDisconnect = false;
      }
    }

    const playerSocket = io.sockets.sockets.get(playerId);

    if (playerSocket) {
      playerSocket.emit("kicked-from-room", {
        message: kickedMessage
      });

      playerSocket.leave(roomCode);
    }

    const nextGamePlayerId =
      room.gameState?.players[room.gameState.currentPlayerIndex]?.id ??
      null;
    if (
      isActiveEgyptianWar &&
      currentGamePlayerId !== nextGamePlayerId
    ) {
      room.turnTimeRemainingMs = null;
      room.reconnectGraceUsedThisTurn = false;
    }

    sendPlayerList(roomCode, room);
    if (isActiveEgyptianWar && room.gameState) {
      if (room.gameState.status === "finished") {
        room.animationId += 1;
        const finalAnimationId = room.animationId;
        const winner = room.gameState.players.find(
          (gamePlayer) => gamePlayer.id === room.gameState?.winnerId
        );
        room.isAnimating = true;
        io.to(roomCode).emit("egyptian-war-animation", {
          id: finalAnimationId,
          action: "kick",
          actorId: playerId,
          playedCard: null,
          isValidSlap: false,
          winnerId: winner?.id ?? null,
          transferCardCount: room.gameState.totalCardCount,
          pileCardCountBeforeTransfer: room.gameState.totalCardCount,
          penaltyCardCount: 0,
          isFinalWin: winner !== undefined
        });
        sendEgyptianWarState(roomCode, room);
        setTimeout(() => {
          if (
            rooms.get(roomCode) === room &&
            room.animationId === finalAnimationId
          ) {
            completeEgyptianWar(roomCode, room);
          }
        }, gameEndAnimationMs);
      } else {
        if (
          !room.isPaused &&
          !room.isAnimating &&
          room.turnTimer === null
        ) {
          startTurnTimer(roomCode, room);
        }
        sendEgyptianWarState(roomCode, room);
      }
    }

    console.log(
      `${player.name} was removed from room ${roomCode}`
    );

    respond({
      success: true,
      message: isActiveEgyptianWar
        ? room.gameState?.activityMessage ??
          "Disconnected player removed from the game."
        : "Player removed from the lobby."
    });
  });

  socket.on("start-game", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "")
      .trim()
      .toUpperCase();

    const room = rooms.get(roomCode);

    if (!room) {
      respond({
        success: false,
        message: "That room no longer exists."
      });
      return;
    }

    if (room.hostId !== socket.id) {
      respond({
        success: false,
        message: "Only the host can start a game."
      });
      return;
    }

    if (room.activeGameId !== null) {
      respond({
        success: false,
        message: "A game is already in progress."
      });
      return;
    }

    if (
      Array.from(room.players.values()).some(
        (player) => !player.isConnected
      )
    ) {
      respond({
        success: false,
        message:
          "Wait for disconnected players to reconnect or remove them before starting."
      });
      return;
    }

    if (room.selectedGameId === null) {
      respond({
        success: false,
        message: "Select a game first."
      });
      return;
    }

    const game = availableGames.find(
      (item) => item.id === room.selectedGameId
    );

    if (!game) {
      respond({
        success: false,
        message: "The selected game is unavailable."
      });
      return;
    }

    if (!game.isPlayable) {
      respond({
        success: false,
        message: `${game.name} gameplay is still under development.`
      });
      return;
    }

    if (room.players.size < game.minPlayers) {
      respond({
        success: false,
        message:
          `${game.name} requires at least ` +
          `${game.minPlayers} players.`
      });
      return;
    }

    if (room.players.size > game.maxPlayers) {
      respond({
        success: false,
        message:
          `${game.name} supports at most ` +
          `${game.maxPlayers} players.`
      });
      return;
    }

    const settings: EgyptianWarSettings = {
      includeJokers: room.gameSettings.includeJokers === true,
      allowDoubles: room.gameSettings.allowDoubles === true,
      allowSandwiches: room.gameSettings.allowSandwiches === true,
      allowFourInARow: room.gameSettings.allowFourInARow === true,
      allowTopBottom: room.gameSettings.allowTopBottom === true,
      allowTens: room.gameSettings.allowTens === true,
      allowMarriage: room.gameSettings.allowMarriage === true,
      falseSlapPenaltyCards:
        typeof room.gameSettings.falseSlapPenaltyCards === "number"
          ? room.gameSettings.falseSlapPenaltyCards
          : 2
    };

    try {
      room.gameState = createEgyptianWarState(
        Array.from(room.players.values()),
        settings
      );
    } catch (error) {
      console.error(`Unable to initialize ${game.name} in room ${roomCode}:`, error);
      respond({
        success: false,
        message: "Unable to initialize the game. Please try again."
      });
      return;
    }

    room.activeGameId = game.id;
    room.isPaused = false;
    room.isAnimating = false;
    room.reconnectGraceUsedThisTurn = false;
    clearTurnTimer(room);

    io.to(roomCode).emit("game-started", {
      gameId: game.id,
      name: game.name,
      chatEnabled: game.chatEnabled,
      settings: room.gameSettings
    });
    startTurnTimer(roomCode, room);
    sendEgyptianWarState(roomCode, room);

    console.log(`${game.name} started in room ${roomCode}`);

    respond({
      success: true
    });
  });

  socket.on("toggle-game-pause", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "")
      .trim()
      .toUpperCase();
    const room = rooms.get(roomCode);

    if (
      !room ||
      room.activeGameId !== egyptianWar.id ||
      room.gameState === null ||
      room.gameState.status !== "playing"
    ) {
      respond({
        success: false,
        message: "Egyptian War is not active in that room."
      });
      return;
    }

    if (room.hostId !== socket.id) {
      respond({
        success: false,
        message: "Only the host can pause or resume the game."
      });
      return;
    }

    if (typeof data?.isPaused !== "boolean") {
      respond({
        success: false,
        message: "Choose whether to pause or resume the game."
      });
      return;
    }

    if (data.isPaused === room.isPaused) {
      respond({ success: true });
      return;
    }

    if (data.isPaused) {
      suspendTurnTimer(room);
    }

    if (room.disconnectPausedPlayerId !== null) {
      room.wasPausedBeforeDisconnect = data.isPaused;
    }

    room.isPaused = data.isPaused;

    if (!room.isPaused) {
      startTurnTimer(roomCode, room);
    }

    io.to(roomCode).emit("egyptian-war-pause-changed", {
      isPaused: room.isPaused
    });
    sendEgyptianWarState(roomCode, room);
    respond({ success: true });
  });

  socket.on("close-room", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "")
      .trim()
      .toUpperCase();
    const room = rooms.get(roomCode);

    if (!room) {
      respond({
        success: false,
        message: "That room no longer exists."
      });
      return;
    }

    if (room.hostId !== socket.id) {
      respond({
        success: false,
        message: "Only the host can close the lobby."
      });
      return;
    }

    if (room.activeGameId !== null) {
      respond({
        success: false,
        message: "Exit the active game before closing the lobby."
      });
      return;
    }

    clearTurnTimer(room);
    for (const playerId of room.players.keys()) {
      socketRoomCodes.delete(playerId);
      removePlayerResumeTokens(playerId);
      const reconnectTimer = disconnectedPlayerTimers.get(playerId);

      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        disconnectedPlayerTimers.delete(playerId);
      }
    }

    respond({ success: true });
    io.to(roomCode).emit("room-closed");
    io.in(roomCode).socketsLeave(roomCode);
    rooms.delete(roomCode);
    console.log(`Room ${roomCode} closed by its host`);
  });

  socket.on("close-game-to-lobby", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "")
      .trim()
      .toUpperCase();
    const room = rooms.get(roomCode);

    if (
      !room ||
      room.activeGameId !== egyptianWar.id ||
      room.gameState === null
    ) {
      respond({
        success: false,
        message: "Egyptian War is not active in that room."
      });
      return;
    }

    if (room.hostId !== socket.id) {
      respond({
        success: false,
        message: "Only the host can end the game."
      });
      return;
    }

    clearTurnTimer(room);
    room.animationId += 1;
    room.activeGameId = null;
    room.gameState = null;
    room.isPaused = false;
    room.isAnimating = false;
    io.to(roomCode).emit("game-ended", {
      winnerId: null,
      message: "The host ended the game and returned everyone to the lobby."
    });
    respond({ success: true });
  });

  socket.on("game-chat-send", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "")
      .trim()
      .toUpperCase();
    const room = rooms.get(roomCode);
    const player = room?.players.get(socket.id);

    if (
      !room ||
      !player ||
      room.activeGameId === null
    ) {
      respond({
        success: false,
        message: "Join an active game before sending chat messages."
      });
      return;
    }

    const game = availableGames.find(
      (availableGame) => availableGame.id === room.activeGameId
    );

    if (!game?.chatEnabled) {
      respond({
        success: false,
        message: "Chat is not available for this game."
      });
      return;
    }

    const message =
      typeof data?.message === "string"
        ? data.message.trim()
        : "";

    if (message.length === 0 || message.length > 300) {
      respond({
        success: false,
        message: "Chat messages must be between 1 and 300 characters."
      });
      return;
    }

    const now = Date.now();
    const lastMessageAt =
      typeof socket.data.lastGameChatAt === "number"
        ? socket.data.lastGameChatAt
        : 0;

    if (now - lastMessageAt < 750) {
      respond({
        success: false,
        message: "Please wait before sending another message."
      });
      return;
    }

    socket.data.lastGameChatAt = now;
    io.to(roomCode).emit("game-chat-message", {
      senderId: player.id,
      senderName: player.name,
      message,
      sentAt: now
    });
    respond({ success: true });
  });

  socket.on("play-card", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "")
      .trim()
      .toUpperCase();

    handleEgyptianWarAction(
      roomCode,
      socket.id,
      "play-card",
      respond
    );
  });

  socket.on("slap", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "")
      .trim()
      .toUpperCase();

    handleEgyptianWarAction(
      roomCode,
      socket.id,
      "slap",
      respond
    );
  });

  socket.on("disconnect", () => {
    console.log(`Browser disconnected: ${socket.id}`);

    const roomCode = socketRoomCodes.get(socket.id);
    const room = roomCode ? rooms.get(roomCode) : undefined;

    if (!roomCode || !room) {
      socketRoomCodes.delete(socket.id);
      return;
    }

    const player = room.players.get(socket.id);

    if (!player) {
      socketRoomCodes.delete(socket.id);
      return;
    }

    player.isConnected = false;

    if (room.gameState?.status === "playing") {
      suspendTurnTimer(room);
      if (room.disconnectPausedPlayerId === null) {
        room.wasPausedBeforeDisconnect = room.isPaused;
        room.disconnectPausedPlayerId = socket.id;
      }

      room.isPaused = true;
      room.isAnimating = false;
      room.animationId += 1;
      room.gameState.activityMessage =
        `${player.name} disconnected. The game is paused until they return.`;
      io.to(roomCode).emit("egyptian-war-pause-changed", {
        isPaused: true
      });
      sendEgyptianWarState(roomCode, room);
    }

    sendPlayerList(roomCode, room);

    if (room.gameState !== null) {
      return;
    }

    const previousTimer = disconnectedPlayerTimers.get(socket.id);

    if (previousTimer !== undefined) {
      clearTimeout(previousTimer);
    }

    const reconnectTimer = setTimeout(() => {
      disconnectedPlayerTimers.delete(socket.id);

      if (
        rooms.get(roomCode) !== room ||
        room.players.get(socket.id)?.isConnected !== false
      ) {
        return;
      }

      if (room.hostId === socket.id) {
        clearTurnTimer(room);
        io.to(roomCode).emit("room-closed");

        for (const playerId of room.players.keys()) {
          socketRoomCodes.delete(playerId);
          removePlayerResumeTokens(playerId);
          const timer = disconnectedPlayerTimers.get(playerId);

          if (timer !== undefined) {
            clearTimeout(timer);
            disconnectedPlayerTimers.delete(playerId);
          }
        }

        io.in(roomCode).socketsLeave(roomCode);
        rooms.delete(roomCode);
        console.log(`Room ${roomCode} closed after host recovery expired`);
        return;
      }

      if (room.gameState !== null) {
        clearTurnTimer(room);
        room.animationId += 1;
        room.activeGameId = null;
        room.gameState = null;
        room.isPaused = false;
        room.isAnimating = false;
        room.disconnectPausedPlayerId = null;
        room.wasPausedBeforeDisconnect = false;
        io.to(roomCode).emit("game-ended", {
          winnerId: null,
          message:
            `${player.name} did not reconnect in time. The game ended and everyone returned to the lobby.`
        });
      } else if (room.disconnectPausedPlayerId === socket.id) {
        const otherDisconnectedPlayer = Array.from(
          room.players.values()
        ).find(
          (candidate) =>
            candidate.id !== socket.id && !candidate.isConnected
        );

        room.disconnectPausedPlayerId =
          otherDisconnectedPlayer?.id ?? null;
        if (room.disconnectPausedPlayerId === null) {
          room.isPaused = room.wasPausedBeforeDisconnect;
          room.wasPausedBeforeDisconnect = false;
        }
      }

      room.players.delete(socket.id);
      socketRoomCodes.delete(socket.id);
      removePlayerResumeTokens(socket.id);
      sendPlayerList(roomCode, room);
      console.log(
        `Removed disconnected player ${player.name} from room ${roomCode}`
      );
    }, reconnectGracePeriodMs);

    disconnectedPlayerTimers.set(socket.id, reconnectTimer);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`GameHub is running on http://localhost:${port}`);
});
