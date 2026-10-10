import express from "express";
import { randomBytes, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "http";
import path from "path";
import { Server, type Socket } from "socket.io";
import {
  GamePluginRegistry,
  type GamePluginPackage,
  type GameSetting
} from "@gamehub/game-sdk";
import type {
  GameActionEnvelope,
  GameEvent,
  GameSession,
  GameViewer
} from "@gamehub/game-sdk";
import { FailedAttemptLimiter } from "./failedAttemptLimiter.js";
import { resolveClientAddress } from "./clientAddress.js";
import { RateLimiter } from "./rateLimiter.js";

type GameSettingValue = boolean | number;

type Player = {
  id: string;
  name: string;
  avatar: string;
  isConnected: boolean;
};

type Room = {
  hostId: string;
  players: Map<string, Player>;
  spectators: Map<string, Player>;
  selectedGameId: string | null;
  gameSettings: Record<string, GameSettingValue>;
  isLocked: boolean;
  activeGameId: string | null;
  gameSession: GameSession | null;
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

const gameHubConfiguration = JSON.parse(
  readFileSync(path.join(process.cwd(), "gamehub.config.json"), "utf8")
) as { gamePackages?: unknown };
const defaultGamePackages = Array.isArray(gameHubConfiguration.gamePackages)
  ? gameHubConfiguration.gamePackages.filter(
    (packageName): packageName is string =>
      typeof packageName === "string" && packageName.trim() !== ""
  )
  : [];
const configuredGamePackages = process.env.GAMEHUB_GAME_PACKAGES === undefined
  ? defaultGamePackages
  : process.env.GAMEHUB_GAME_PACKAGES
    .split(",")
    .map((packageName) => packageName.trim())
    .filter(Boolean);

function loadGamePackage(packageName: string): GamePluginPackage {
  const packageExports = require(packageName) as {
    gameHubPlugin?: GamePluginPackage;
  };
  if (!packageExports.gameHubPlugin) {
    throw new Error(
      `Installed game package ${packageName} does not export gameHubPlugin.`
    );
  }
  const gamePackage = packageExports.gameHubPlugin;
  if (
    typeof gamePackage.publicDirectory !== "string" ||
    gamePackage.publicDirectory.trim() === "" ||
    typeof gamePackage.server?.createSession !== "function"
  ) {
    throw new Error(
      `Installed game package ${packageName} has an invalid runtime export.`
    );
  }
  if (
    gamePackage.server.manifest.apiVersion !== gamePackage.manifest.apiVersion ||
    gamePackage.server.manifest.definition.id !==
    gamePackage.manifest.definition.id
  ) {
    throw new Error(
      `Installed game package ${packageName} has mismatched client and server manifests.`
    );
  }
  return gamePackage;
}

const installedGamePackages = configuredGamePackages.map(loadGamePackage);
const gamePackagesById = new Map(
  installedGamePackages.map((gamePackage) => [
    gamePackage.manifest.definition.id,
    gamePackage
  ])
);
const gamePluginRegistry = new GamePluginRegistry(
  installedGamePackages.map((gamePackage) => gamePackage.manifest)
);
const availableGames = gamePluginRegistry.listDefinitions();

function getGameDefinition(gameId: string | null) {
  return gameId === null
    ? null
    : gamePluginRegistry.getDefinition(gameId);
}

const app = express();
const server = http.createServer(app);
const indexShell = readFileSync(
  path.join(process.cwd(), "public", "index.html"),
  "utf8"
);
const gameMarkupMarker = "<!-- game-plugin-markup -->";
const gameStyleMarker = "<!-- game-plugin-styles -->";
const gameScriptMarker = "<!-- game-plugin-scripts -->";
const gameHubConfigMarker = "<!-- gamehub-config -->";

function replaceRequiredMarker(
  html: string,
  marker: string,
  replacement: string
): string {
  if (!html.includes(marker)) {
    throw new Error(`GameHub index is missing required marker: ${marker}`);
  }
  // A function replacer keeps "$&" and friends in plugin markup literal.
  return html.replace(marker, () => replacement);
}

function gamePublicUrl(gameId: string, resourcePath: string): string {
  return `/games/${gameId}/${resourcePath}`;
}

const gameMarkup = installedGamePackages.flatMap((gamePackage) => {
  const gameId = gamePackage.manifest.definition.id;
  const markupPath = gamePackage.manifest.client.markupPath;
  return markupPath
    ? [
      `<div data-game-plugin-root="${gameId}" hidden>`,
      readFileSync(path.join(gamePackage.publicDirectory, markupPath), "utf8"),
      "</div>"
    ].join("\n")
    : [];
}).join("\n");
const gameStyles = installedGamePackages.flatMap((gamePackage) => {
  const gameId = gamePackage.manifest.definition.id;
  return (gamePackage.manifest.client.stylePaths ?? []).map(
    (stylePath) =>
      `<link rel="stylesheet" href="${gamePublicUrl(gameId, stylePath)}" ` +
      `data-game-plugin-style="${gameId}" disabled>`
  );
}).join("\n  ");
const gameScripts = installedGamePackages.flatMap((gamePackage) => {
  const gameId = gamePackage.manifest.definition.id;
  const moduleEntryPath = gamePackage.manifest.client.delivery === "module"
    ? gamePackage.manifest.client.entryPath
    : null;
  const classicScripts = (gamePackage.manifest.client.entryPaths ?? [])
    .filter((entryPath) => entryPath !== moduleEntryPath)
    .map(
      (entryPath) =>
        `<script src="${gamePublicUrl(gameId, entryPath)}"></script>`
    );
  if (gamePackage.manifest.client.delivery !== "module") {
    return classicScripts;
  }
  return [
    ...classicScripts,
    `<script type="module" src="${gamePublicUrl(gameId, gamePackage.manifest.client.entryPath)}"></script>`
  ];
}).join("\n  ");

let renderedIndex = replaceRequiredMarker(
  indexShell,
  gameMarkupMarker,
  gameMarkup
);
renderedIndex = replaceRequiredMarker(renderedIndex, gameStyleMarker, gameStyles);
renderedIndex = replaceRequiredMarker(renderedIndex, gameScriptMarker, gameScripts);
renderedIndex = replaceRequiredMarker(
  renderedIndex,
  gameHubConfigMarker,
  JSON.stringify({ avatars: availableAvatars }).replace(/</g, "\\u003c")
);
// Tests may shorten the recovery period; production always uses two minutes.
const testReconnectGracePeriodMs = Number(
  process.env.GAMEHUB_TEST_RECONNECT_GRACE_MS
);
const reconnectGracePeriodMs =
  process.env.NODE_ENV === "test" && testReconnectGracePeriodMs > 0
    ? testReconnectGracePeriodMs
    : 120_000;
const io = new Server(server, {
  connectionStateRecovery: {
    maxDisconnectionDuration: reconnectGracePeriodMs,
    skipMiddlewares: true
  }
});

const configuredPort = Number(process.env.PORT);
const port =
  Number.isInteger(configuredPort) &&
    configuredPort >= 0 &&
    configuredPort <= 65_535
    ? configuredPort
    : 3000;
const deterministicTestRandomInteger =
  process.env.NODE_ENV === "test" &&
    process.env.GAMEHUB_DETERMINISTIC_DECK === "true"
    ? (maxExclusive: number): number => maxExclusive - 1
    : randomInt;
const maxLobbyPlayers = 12;
const rooms = new Map<string, Room>();
const socketRoomCodes = new Map<string, string>();
const disconnectedPlayerTimers =
  new Map<string, ReturnType<typeof setTimeout>>();
const playerResumeTokens = new Map<
  string,
  { roomCode: string; playerId: string; createdAt: number }
>();
const revokedResumeTokenMessages = new Map<string, string>();
const revokedSocketMessages = new Map<string, string>();
const invalidJoinLimiter = new FailedAttemptLimiter(10, 60_000);
// Only believe Cloudflare's client-address header when the operator says
// GameHub really is behind Cloudflare. Otherwise anyone can forge it.
const trustCloudflareHeader =
  process.env.GAMEHUB_TRUST_CLOUDFLARE_IP === "true";
const configuredMaxRooms = Number(process.env.GAMEHUB_MAX_ROOMS);
const maxRooms =
  Number.isInteger(configuredMaxRooms) && configuredMaxRooms > 0
    ? configuredMaxRooms
    : 200;
const resumeTokenMaxAgeMs = 24 * 60 * 60 * 1000;
const roomCreationLimiter = new RateLimiter(6, 10 * 60_000);
const socketRequestLimiter = new RateLimiter(120, 10_000);
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self'",
  "font-src 'self'",
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

app.disable("x-powered-by");
app.use((_request, response, next) => {
  response.setHeader("Content-Security-Policy", contentSecurityPolicy);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  next();
});

app.use(
  "/vendor/bootstrap",
  express.static(
    path.join(process.cwd(), "node_modules", "bootstrap", "dist")
  )
);

app.get(["/", "/index.html"], (_request, response) => {
  response.type("html").send(renderedIndex);
});

for (const gamePackage of installedGamePackages) {
  app.use(
    `/games/${gamePackage.manifest.definition.id}`,
    express.static(gamePackage.publicDirectory)
  );
}

app.use(express.static(path.join(process.cwd(), "public")));

function generateRoomCode(): string {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  do {
    code = "";

    for (let index = 0; index < 6; index += 1) {
      const randomIndex = randomInt(characters.length);
      code += characters[randomIndex];
    }
  } while (rooms.has(code));

  return code;
}

function sendRoomMemberLists(roomCode: string, room: Room): void {
  const players = Array.from(room.players.values()).map((player) => ({
    ...player,
    isHost: player.id === room.hostId
  }));
  const spectators = Array.from(room.spectators.values());

  io.to(roomCode).emit("player-list", players);
  io.to(roomCode).emit("spectator-list", spectators);
}

function getRoomMember(
  room: Room,
  memberId: string
): { member: Player; role: "player" | "spectator" } | null {
  const player = room.players.get(memberId);
  if (player) {
    return { member: player, role: "player" };
  }

  const spectator = room.spectators.get(memberId);
  return spectator
    ? { member: spectator, role: "spectator" }
    : null;
}

function promoteSpectatorsToPlayers(
  roomCode: string,
  room: Room
): void {
  for (const [spectatorId, spectator] of room.spectators) {
    room.spectators.delete(spectatorId);
    room.players.set(spectatorId, spectator);
  }

  sendRoomMemberLists(roomCode, room);
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

        const rttMs = performance.now() - startedAt;
        if (Number.isFinite(rttMs) && rttMs >= 0) {
          socket.emit("latency-update", { rttMs });
        }
      }
    );
  };

  measureRoundTripTime();
  const interval = setInterval(measureRoundTripTime, 5_000);
  socket.on("disconnect", () => clearInterval(interval));
}

function createPlayerResumeToken(
  roomCode: string,
  playerId: string
): string {
  const token = randomBytes(32).toString("base64url");
  playerResumeTokens.set(token, {
    roomCode,
    playerId,
    createdAt: Date.now()
  });
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

function normalizeRoomCode(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function clearDisconnectTimer(memberId: string): void {
  const timer = disconnectedPlayerTimers.get(memberId);

  if (timer !== undefined) {
    clearTimeout(timer);
    disconnectedPlayerTimers.delete(memberId);
  }
}

function markPlayerReconnected(
  roomCode: string,
  playerId: string,
  room: Room
): void {
  clearDisconnectTimer(playerId);

  const player = room.players.get(playerId);

  if (player) {
    player.isConnected = true;
  }
  room.gameSession?.memberReconnected?.(playerId);
}

// Names may not contain control characters, invisible characters or bidi
// overrides, which could be used to impersonate other players.
const disallowedNameCharacters =
  /[\u0000-\u001F\u007F\u061C\u200B\u200E\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/;

function isValidPlayerName(playerName: string): boolean {
  return playerName.length >= 1 &&
    playerName.length <= 20 &&
    !disallowedNameCharacters.test(playerName);
}

function isPlayerNameTaken(room: Room, playerName: string): boolean {
  const wanted = playerName.toLocaleLowerCase();

  return [...room.players.values(), ...room.spectators.values()].some(
    (member) => member.name.toLocaleLowerCase() === wanted
  );
}

type SocketResponse = (response: unknown) => void;

function onSocketRequest(
  socket: Socket,
  event: string,
  handler: (data: any, respond: SocketResponse) => void
): void {
  socket.on(event, (data: any, candidateResponse?: unknown) => {
    const respond: SocketResponse = typeof candidateResponse === "function"
      ? candidateResponse as SocketResponse
      : () => undefined;

    if (!socketRequestLimiter.consume(socket.id)) {
      respond({
        success: false,
        message: "You are sending requests too quickly. Please slow down."
      });
      return;
    }

    try {
      handler(data, respond);
    } catch (error) {
      console.error(`Unable to process Socket.IO request ${event}:`, error);
      respond({
        success: false,
        message: "Unable to process that request."
      });
    }
  });
}

function getSocketClientAddress(socket: Socket): string {
  return resolveClientAddress(
    socket.handshake.headers,
    socket.handshake.address,
    trustCloudflareHeader
  );
}

function sendRoomResumed(
  socket: Socket,
  roomCode: string,
  room: Room
): void {
  socket.emit("room-resumed", {
    roomCode,
    isHost: room.hostId === socket.id,
    role: room.spectators.has(socket.id) ? "spectator" : "player",
    isLocked: room.isLocked,
    selectedGameId: room.selectedGameId,
    gameSettings: room.gameSettings,
    activeGameId: room.activeGameId,
    isPaused: room.gameSession?.getLifecycleState().isPaused ?? false,
    chatEnabled:
      getGameDefinition(room.activeGameId)?.chatEnabled ?? false
  });

  if (room.activeGameId !== null) {
    sendActiveGameState(roomCode, room, socket);
  }
}

// Lock state, selected game and member lists: what a (re)joining browser needs.
function sendLobbyState(socket: Socket, roomCode: string, room: Room): void {
  socket.emit("room-lock-changed", { isLocked: room.isLocked });

  if (room.selectedGameId !== null) {
    socket.emit("game-selected", {
      gameId: room.selectedGameId,
      settings: room.gameSettings
    });
  }

  sendRoomMemberLists(roomCode, room);
}

function sendRoomSnapshot(
  socket: Socket,
  roomCode: string,
  room: Room,
  rotatedResumeToken?: string
): void {
  sendRoomResumed(socket, roomCode, room);

  if (rotatedResumeToken !== undefined) {
    socket.emit("room-resume-token", rotatedResumeToken);
  }

  sendLobbyState(socket, roomCode, room);
}

function closeRoom(roomCode: string, room: Room, logMessage: string): void {
  disposeGameSession(room);
  io.to(roomCode).emit("room-closed");

  const memberIds = new Set([
    ...room.players.keys(),
    ...room.spectators.keys()
  ]);

  for (const memberId of memberIds) {
    socketRoomCodes.delete(memberId);
    removePlayerResumeTokens(memberId);
    clearDisconnectTimer(memberId);
    socketRequestLimiter.forget(memberId);
  }

  io.in(roomCode).socketsLeave(roomCode);
  rooms.delete(roomCode);
  console.log(logMessage);
}

// Takes a member out of a room. Pass `kickedMessage` when the host removed
// them: they are told why, and a reconnecting browser sees the same message.
function removeMemberFromRoom(
  roomCode: string,
  room: Room,
  memberId: string,
  role: "player" | "spectator",
  kickedMessage?: string
): void {
  (role === "player" ? room.players : room.spectators).delete(memberId);
  socketRoomCodes.delete(memberId);
  removePlayerResumeTokens(memberId, kickedMessage);
  clearDisconnectTimer(memberId);

  if (kickedMessage !== undefined) {
    revokedSocketMessages.set(memberId, kickedMessage);
    setTimeout(
      () => revokedSocketMessages.delete(memberId),
      reconnectGracePeriodMs
    );
  }

  const memberSocket = io.sockets.sockets.get(memberId);

  if (memberSocket) {
    if (kickedMessage !== undefined) {
      memberSocket.emit("kicked-from-room", { message: kickedMessage });
    }
    memberSocket.leave(roomCode);
  }

  sendRoomMemberLists(roomCode, room);
}

// Starts the recovery countdown for a disconnected member. When it ends:
// a missing host closes the room (even mid-game, since only the host can
// resume or remove players), a lobby player or spectator is removed, and a
// player in an active game is left for the host to deal with.
function scheduleDisconnectExpiry(
  roomCode: string,
  room: Room,
  memberId: string
): void {
  clearDisconnectTimer(memberId);

  const timer = setTimeout(() => {
    disconnectedPlayerTimers.delete(memberId);

    if (rooms.get(roomCode) !== room) {
      return;
    }

    const found = getRoomMember(room, memberId);

    if (!found || found.member.isConnected) {
      return;
    }

    if (found.role === "player" && room.hostId === memberId) {
      closeRoom(
        roomCode,
        room,
        `Room ${roomCode} closed after host recovery expired`
      );
      return;
    }

    if (found.role === "player" && room.gameSession !== null) {
      return;
    }

    removeMemberFromRoom(roomCode, room, memberId, found.role);
    console.log(
      `Removed disconnected ${found.role} ${found.member.name} from room ${roomCode}`
    );
  }, reconnectGracePeriodMs);

  disconnectedPlayerTimers.set(memberId, timer);
}

function createDefaultSettings(
  gameId: string
): Record<string, GameSettingValue> | null {
  const game = getGameDefinition(gameId);

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

function validateGameSetting(
  setting: GameSetting,
  value: unknown
): value is GameSettingValue {
  if (setting.type === "number") {
    if (typeof value !== "number" || !Number.isInteger(value)) return false;
    if (setting.control === "range") {
      return value >= setting.min &&
        value <= setting.max &&
        (value - setting.min) % setting.step === 0;
    }
    return setting.options.includes(value);
  }
  return typeof value === "boolean";
}

function disposeGameSession(room: Room): void {
  const session = room.gameSession;
  room.gameSession = null;
  try {
    session?.dispose();
  } catch (error) {
    console.error("Unable to dispose a game session cleanly:", error);
  }
}

function getGameViewer(room: Room, memberId: string): GameViewer | null {
  if (room.players.has(memberId)) return { memberId, role: "player" };
  if (room.spectators.has(memberId)) return { memberId, role: "spectator" };
  return null;
}

function sendActiveGameState(
  roomCode: string,
  room: Room,
  targetSocket?: Socket
): void {
  if (room.activeGameId === null || room.gameSession === null) return;
  const send = (memberId: string, target: Socket) => {
    const viewer = getGameViewer(room, memberId);
    if (!viewer || room.activeGameId === null || room.gameSession === null) return;
    target.emit("game-state", {
      gameId: room.activeGameId,
      state: room.gameSession.getPublicState(viewer)
    });
  };
  if (targetSocket) {
    send(targetSocket.id, targetSocket);
    return;
  }
  for (const member of [...room.players.values(), ...room.spectators.values()]) {
    if (!member.isConnected) continue;
    const target = io.sockets.sockets.get(member.id);
    if (target) send(member.id, target);
  }
}

function finishActiveGame(
  roomCode: string,
  room: Room,
  winnerId: string | null,
  message: string
): void {
  if (rooms.get(roomCode) !== room || room.activeGameId === null) return;
  disposeGameSession(room);
  room.activeGameId = null;
  promoteSpectatorsToPlayers(roomCode, room);

  // Players who dropped during the game never got an expiry timer.
  for (const member of [...room.players.values(), ...room.spectators.values()]) {
    if (!member.isConnected && !disconnectedPlayerTimers.has(member.id)) {
      scheduleDisconnectExpiry(roomCode, room, member.id);
    }
  }

  io.to(roomCode).emit("game-ended", { winnerId, message });
}

io.on("connection", (socket) => {
  monitorSocketLatency(socket);
  console.log(`Browser connected: ${socket.id}`);
  socket.emit("available-games", availableGames);

  if (socket.recovered) {
    const roomCode = socketRoomCodes.get(socket.id);
    const room = roomCode ? rooms.get(roomCode) : undefined;
    const roomMember = room ? getRoomMember(room, socket.id) : null;

    if (roomCode && room && roomMember) {
      if (roomMember.role === "player") {
        markPlayerReconnected(roomCode, socket.id, room);
      } else {
        clearDisconnectTimer(socket.id);
        roomMember.member.isConnected = true;
      }
      socket.join(roomCode);
      sendRoomSnapshot(socket, roomCode, room);
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

  onSocketRequest(socket, "resume-room", (data, respond) => {
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

    if (Date.now() - session.createdAt > resumeTokenMaxAgeMs) {
      playerResumeTokens.delete(token);
      respond({
        success: false,
        message: "That saved room session has expired."
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
    const roomMember = room
      ? getRoomMember(room, session.playerId)
      : null;

    if (!room || !roomMember) {
      respond({
        success: false,
        message: "That saved room session is no longer available."
      });
      return;
    }

    const { member, role } = roomMember;
    const oldPlayerId = session.playerId;
    if (
      oldPlayerId === socket.id &&
      connectedRoomCode === session.roomCode &&
      member.isConnected
    ) {
      socket.join(session.roomCode);
      sendRoomSnapshot(socket, session.roomCode, room);
      respond({ success: true, role });
      return;
    }

    const previousSocket = io.sockets.sockets.get(oldPlayerId);
    const memberMap = role === "player"
      ? room.players
      : room.spectators;
    memberMap.delete(oldPlayerId);
    member.id = socket.id;
    member.isConnected = true;
    memberMap.set(socket.id, member);
    socketRoomCodes.delete(oldPlayerId);
    socketRoomCodes.set(socket.id, session.roomCode);

    if (role === "player" && room.hostId === oldPlayerId) {
      room.hostId = socket.id;
    }

    if (previousSocket && oldPlayerId !== socket.id) {
      previousSocket.emit("room-session-replaced");
      previousSocket.leave(session.roomCode);
    }

    clearDisconnectTimer(oldPlayerId);
    socketRequestLimiter.forget(oldPlayerId);

    // Replaces every token this member held (including the one just used).
    removePlayerResumeTokens(oldPlayerId);
    const rotatedResumeToken = createPlayerResumeToken(
      session.roomCode,
      socket.id
    );
    socket.join(session.roomCode);
    if (role === "player") {
      room.gameSession?.memberReconnected?.(socket.id, oldPlayerId);
    }
    sendRoomSnapshot(socket, session.roomCode, room, rotatedResumeToken);
    respond({ success: true, role });
  });

  onSocketRequest(socket, "create-room", (data, respond) => {
    if (socketRoomCodes.has(socket.id)) {
      respond({
        success: false,
        message: "You are already in a room."
      });
      return;
    }

    const playerName = String(data?.playerName ?? "").trim();
    const avatar = String(data?.avatar ?? "");

    if (!isValidPlayerName(playerName)) {
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

    if (rooms.size >= maxRooms) {
      respond({
        success: false,
        message: "The server is busy right now. Try again later."
      });
      return;
    }

    if (!roomCreationLimiter.consume(getSocketClientAddress(socket))) {
      respond({
        success: false,
        message: "You are creating rooms too quickly. Try again in a few minutes."
      });
      return;
    }

    const roomCode = generateRoomCode();

    const room: Room = {
      hostId: socket.id,
      players: new Map(),
      spectators: new Map(),
      selectedGameId: null,
      gameSettings: {},
      isLocked: false,
      activeGameId: null,
      gameSession: null
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

    sendRoomMemberLists(roomCode, room);
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

  onSocketRequest(socket, "join-room", (data, respond) => {
    if (socketRoomCodes.has(socket.id)) {
      respond({
        success: false,
        message: "You are already in a room."
      });
      return;
    }

    const roomCode = normalizeRoomCode(data?.roomCode);
    const playerName = String(data?.playerName ?? "").trim();
    const avatar = String(data?.avatar ?? "");
    const joinLimitKey = getSocketClientAddress(socket);

    if (invalidJoinLimiter.isBlocked(joinLimitKey)) {
      respond({
        success: false,
        message: "Too many unsuccessful join attempts. Try again in a minute."
      });
      return;
    }

    if (roomCode.length !== 6) {
      invalidJoinLimiter.recordFailure(joinLimitKey);
      respond({
        success: false,
        message: "Enter a valid six-character room code."
      });
      return;
    }

    if (!isValidPlayerName(playerName)) {
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
      invalidJoinLimiter.recordFailure(joinLimitKey);
      respond({
        success: false,
        message: "That room does not exist."
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

    if (room.players.size + room.spectators.size >= maxLobbyPlayers) {
      respond({
        success: false,
        message:
          `This room is full. It only allows up to ` +
          `${maxLobbyPlayers} people.`
      });
      return;
    }

    if (isPlayerNameTaken(room, playerName)) {
      respond({
        success: false,
        message: "That name is already taken in this room. Pick another one."
      });
      return;
    }

    const role = room.activeGameId === null
      ? "player"
      : "spectator";
    const roomMember = {
      id: socket.id,
      name: playerName,
      avatar,
      isConnected: true
    };

    if (role === "player") {
      room.players.set(socket.id, roomMember);
    } else {
      room.spectators.set(socket.id, roomMember);
    }

    // Failures are deliberately not cleared on success: otherwise a guesser
    // could reset their own counter by joining a room they created.
    socketRoomCodes.set(socket.id, roomCode);
    socket.join(roomCode);
    sendLobbyState(socket, roomCode, room);

    console.log(
      `${playerName} joined room ${roomCode} as a ${role}`
    );
    const resumeToken = createPlayerResumeToken(
      roomCode,
      socket.id
    );

    respond({
      success: true,
      roomCode,
      playerName,
      resumeToken,
      role,
      activeGameId: room.activeGameId,
      gameSettings: room.gameSettings,
      isPaused: room.gameSession?.getLifecycleState().isPaused ?? false,
      chatEnabled:
        getGameDefinition(room.activeGameId)?.chatEnabled ?? false
    });

    if (role === "spectator" && room.activeGameId !== null) {
      sendActiveGameState(roomCode, room, socket);
    }
  });

  onSocketRequest(socket, "select-game", (data, respond) => {
    const roomCode = normalizeRoomCode(data?.roomCode);

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

    const game = getGameDefinition(gameId);

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

  onSocketRequest(socket, "update-game-settings", (data, respond) => {
    const roomCode = normalizeRoomCode(data?.roomCode);

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

    const game = getGameDefinition(room.selectedGameId);

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

  onSocketRequest(socket, "set-room-locked", (data, respond) => {
    const roomCode = normalizeRoomCode(data?.roomCode);

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

  onSocketRequest(socket, "kick-player", (data, respond) => {
    const roomCode = normalizeRoomCode(data?.roomCode);
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

    const spectator = room.spectators.get(playerId);
    if (spectator) {
      removeMemberFromRoom(
        roomCode,
        room,
        playerId,
        "spectator",
        "You were removed from the spectators."
      );
      console.log(`${spectator.name} was removed from room ${roomCode}`);
      respond({
        success: true,
        message: "Spectator removed from the game."
      });
      return;
    }

    if (playerId === room.hostId) {
      respond({ success: false, message: "The host cannot remove themselves." });
      return;
    }

    const player = room.players.get(playerId);
    if (!player) {
      respond({ success: false, message: "That player is no longer in the room." });
      return;
    }

    const wasInActiveGame = room.gameSession !== null;
    const removalResult = room.gameSession?.memberRemoved?.(playerId) ??
      (wasInActiveGame
        ? { success: false, message: "Players cannot be removed during this game." }
        : { success: true, message: "Player removed from the lobby." });
    if (!removalResult.success) {
      respond(removalResult);
      return;
    }

    const kickedMessage = wasInActiveGame
      ? "You were kicked from the game while disconnected."
      : player.isConnected
        ? "You were removed from the lobby by the host."
        : "You were kicked from the lobby while disconnected.";
    removeMemberFromRoom(roomCode, room, playerId, "player", kickedMessage);
    console.log(`${player.name} was removed from room ${roomCode}`);
    respond({
      success: true,
      message: removalResult.message ?? "Player removed."
    });
  });

  onSocketRequest(socket, "leave-lobby", (_data, respond) => {
    const roomCode = socketRoomCodes.get(socket.id);
    const room = roomCode ? rooms.get(roomCode) : undefined;
    const found = room ? getRoomMember(room, socket.id) : null;

    if (!roomCode || !room || !found) {
      respond({ success: false, message: "You are not in a room." });
      return;
    }

    if (room.hostId === socket.id) {
      respond({
        success: false,
        message: "The host closes the lobby instead of leaving it."
      });
      return;
    }

    removeMemberFromRoom(roomCode, room, socket.id, found.role);
    console.log(`${found.member.name} left lobby ${roomCode}`);
    respond({ success: true });
  });

  onSocketRequest(socket, "leave-game", (_data, respond) => {
    const roomCode = socketRoomCodes.get(socket.id);
    const room = roomCode ? rooms.get(roomCode) : undefined;
    const found = room ? getRoomMember(room, socket.id) : null;

    if (!roomCode || !room || !found) {
      respond({ success: false, message: "You are not in a room." });
      return;
    }

    if (room.hostId === socket.id) {
      respond({
        success: false,
        message: "The host cannot leave the game."
      });
      return;
    }

    if (found.role !== "player" || room.gameSession === null) {
      respond({
        success: false,
        message: "You are not in an active game."
      });
      return;
    }

    const result =
      room.gameSession.memberRemoved?.(
        socket.id,
        { voluntary: true }
      ) ?? {
        success: false,
        message: "You cannot leave during this game."
      };

    if (!result.success) {
      respond(result);
      return;
    }

    // IMPORTANT: do NOT call removeMemberFromRoom().
    // The player is leaving the game but staying in the lobby.
    console.log(`${found.member.name} left game ${roomCode}`);
    respond({ success: true });
  });

  onSocketRequest(socket, "start-game", (data, respond) => {
    const roomCode = normalizeRoomCode(data?.roomCode);

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

    const game = getGameDefinition(room.selectedGameId);

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

    const gamePackage = gamePackagesById.get(game.id);
    if (!gamePackage) {
      respond({ success: false, message: "The selected game package is unavailable." });
      return;
    }

    let createdSession: GameSession | null = null;
    try {
      createdSession = gamePackage.server.createSession({
        roomCode,
        members: () => [
          ...Array.from(room.players.values(), (member) => ({
            ...member,
            role: "player" as const
          })),
          ...Array.from(room.spectators.values(), (member) => ({
            ...member,
            role: "spectator" as const
          }))
        ],
        broadcastState: () => sendActiveGameState(roomCode, room),
        emitEvent: (event) => {
          io.to(roomCode).emit("game-event", { gameId: game.id, event });
        },
        finish: ({ winnerId, reason }) => {
          if (room.gameSession === createdSession) {
            finishActiveGame(roomCode, room, winnerId, reason);
          }
        },
        now: Date.now,
        randomInteger: deterministicTestRandomInteger
      }, room.gameSettings);
    } catch (error) {
      console.error(`Unable to initialize ${game.name} in room ${roomCode}:`, error);
      respond({
        success: false,
        message: "Unable to initialize the game. Please try again."
      });
      return;
    }

    room.activeGameId = game.id;
    room.gameSession = createdSession;

    try {
      room.gameSession.start?.();
    } catch (error) {
      console.error(`Unable to start ${game.name} in room ${roomCode}:`, error);
      disposeGameSession(room);
      room.activeGameId = null;
      respond({
        success: false,
        message: "Unable to start the game. Please try again."
      });
      return;
    }

    io.to(roomCode).emit("game-started", {
      gameId: game.id,
      name: game.name,
      chatEnabled: game.chatEnabled,
      settings: room.gameSettings
    });
    sendActiveGameState(roomCode, room);

    console.log(`${game.name} started in room ${roomCode}`);

    respond({
      success: true
    });
  });

  onSocketRequest(socket, "toggle-game-pause", (data, respond) => {
    const roomCode = normalizeRoomCode(data?.roomCode);
    const room = rooms.get(roomCode);

    if (!room || room.activeGameId === null || room.gameSession === null) {
      respond({
        success: false,
        message: "No game is active in that room."
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

    const lifecycle = room.gameSession.getLifecycleState();
    if (data.isPaused === lifecycle.isPaused) {
      respond({ success: true });
      return;
    }
    const result = data.isPaused
      ? room.gameSession.pause?.()
      : room.gameSession.resume?.();
    respond(result ?? {
      success: false,
      message: "This game does not support pausing."
    });
  });

  onSocketRequest(socket, "close-room", (data, respond) => {
    const roomCode = normalizeRoomCode(data?.roomCode);
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

    respond({ success: true });
    closeRoom(roomCode, room, `Room ${roomCode} closed by its host`);
  });

  onSocketRequest(socket, "close-game-to-lobby", (data, respond) => {
    const roomCode = normalizeRoomCode(data?.roomCode);
    const room = rooms.get(roomCode);

    if (!room || room.activeGameId === null || room.gameSession === null) {
      respond({
        success: false,
        message: "No game is active in that room."
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

    finishActiveGame(
      roomCode,
      room,
      null,
      "The host ended the game and returned everyone to the lobby."
    );
    respond({ success: true });
  });

  onSocketRequest(socket, "game-chat-send", (data, respond) => {
    const roomCode = normalizeRoomCode(data?.roomCode);
    const room = rooms.get(roomCode);
    const roomMember = room
      ? getRoomMember(room, socket.id)
      : null;

    if (
      !room ||
      !roomMember ||
      room.activeGameId === null
    ) {
      respond({
        success: false,
        message: "Join an active game before sending chat messages."
      });
      return;
    }

    const game = getGameDefinition(room.activeGameId);

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
      senderId: roomMember.member.id,
      senderName: roomMember.member.name,
      message,
      sentAt: now
    });
    respond({ success: true });
  });

  onSocketRequest(socket, "game-action", (data, respond) => {
    const roomCode = normalizeRoomCode(data?.roomCode);
    const gameId = String(data?.gameId ?? "");
    const actionType = String(data?.action?.type ?? "");

    const room = rooms.get(roomCode);
    if (
      !room ||
      room.activeGameId !== gameId ||
      room.gameSession === null
    ) {
      respond({
        success: false,
        message: "That game is not active in this room."
      });
      return;
    }

    if (!getRoomMember(room, socket.id)) {
      respond({
        success: false,
        message: "Join this room before submitting game actions."
      });
      return;
    }

    Promise.resolve().then(() => room.gameSession?.handleAction(socket.id, {
      type: actionType,
      payload: data?.action?.payload
    })).then((result) => {
      respond(result ?? {
        success: false,
        message: "That game is no longer active."
      });
    }).catch((error) => {
      console.error(
        "Unable to process " + gameId +
        " action in room " + roomCode + ":",
        error
      );
      respond({
        success: false,
        message: "Unable to process that game action."
      });
    });
  });

  socket.on("disconnect", () => {
    console.log(`Browser disconnected: ${socket.id}`);
    socketRequestLimiter.forget(socket.id);

    const roomCode = socketRoomCodes.get(socket.id);
    const room = roomCode ? rooms.get(roomCode) : undefined;
    const found = room ? getRoomMember(room, socket.id) : null;

    if (!roomCode || !room || !found) {
      socketRoomCodes.delete(socket.id);
      return;
    }

    found.member.isConnected = false;

    if (found.role === "player") {
      room.gameSession?.memberDisconnected?.(socket.id);
    }

    sendRoomMemberLists(roomCode, room);

    // In an active game the host decides what happens to a missing player, so
    // only spectators and the host (whose absence would strand the game) get
    // an expiry countdown there. Lobby members always do.
    if (
      found.role === "spectator" ||
      room.gameSession === null ||
      room.hostId === socket.id
    ) {
      scheduleDisconnectExpiry(roomCode, room, socket.id);
    }
  });
});

server.listen(port, "0.0.0.0", () => {
  const address = server.address();
  const listeningPort =
    typeof address === "object" && address !== null
      ? address.port
      : port;
  console.log(`GameHub is running on http://localhost:${listeningPort}`);
  if (process.send) {
    process.send({ type: "server-listening", port: listeningPort });
  }
});
