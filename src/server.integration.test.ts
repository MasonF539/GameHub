import assert from "node:assert/strict";
import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { io as createClient, type Socket } from "socket.io-client";
import type { PublicEgyptianWarState } from "./games/egyptianWar/engine.js";

type Ack = {
  success: boolean;
  message?: string;
  roomCode?: string;
  resumeToken?: string;
  role?: "player" | "spectator";
};

function emitAck(socket: Socket, event: string, data: unknown): Promise<Ack> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} acknowledgement timed out`)), 4_000);
    socket.emit(event, data, (response: Ack) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

function emitEgyptianWarAction(
  socket: Socket,
  roomCode: string,
  type: "play-card" | "slap"
): Promise<Ack> {
  return emitAck(socket, "game-action", {
    roomCode,
    gameId: "egyptian-war",
    action: { type }
  });
}

function waitForEvent<T>(
  socket: Socket,
  event: string,
  predicate: (value: T) => boolean = () => true,
  timeoutMs = 5_000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`${event} timed out`));
    }, timeoutMs);
    const handler = (value: T): void => {
      if (!predicate(value)) return;
      clearTimeout(timeout);
      socket.off(event, handler);
      resolve(value);
    };
    socket.on(event, handler);
  });
}

function waitForEgyptianWarState(
  socket: Socket,
  predicate: (state: PublicEgyptianWarState) => boolean = () => true,
  timeoutMs = 5_000
): Promise<PublicEgyptianWarState> {
  return waitForEvent<{
    gameId: string;
    state: PublicEgyptianWarState;
  }>(
    socket,
    "game-state",
    (envelope) =>
      envelope.gameId === "egyptian-war" &&
      predicate(envelope.state),
    timeoutMs
  ).then((envelope) => envelope.state);
}

function waitForEgyptianWarEvent<T>(
  socket: Socket,
  eventType: string,
  predicate: (payload: T) => boolean = () => true,
  timeoutMs = 5_000
): Promise<T> {
  return waitForEvent<{
    gameId: string;
    event: { type: string; payload: T };
  }>(
    socket,
    "game-event",
    (envelope) =>
      envelope.gameId === "egyptian-war" &&
      envelope.event.type === eventType &&
      predicate(envelope.event.payload),
    timeoutMs
  ).then((envelope) => envelope.event.payload);
}

async function connect(url: string): Promise<Socket> {
  const socket = createClient(url, { transports: ["websocket"], reconnection: false });
  if (socket.connected) return socket;
  await waitForEvent(socket, "connect");
  return socket;
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) return;
  server.kill();
  await new Promise<void>((resolve) => server.once("exit", () => resolve()));
}

async function startServer(): Promise<{
  server: ChildProcess;
  url: string;
}> {
  const server = fork(
    path.join(process.cwd(), "dist", "server.js"),
    [],
    {
      env: {
        ...process.env,
        PORT: "0",
        NODE_ENV: "test",
        GAMEHUB_DETERMINISTIC_DECK: "true"
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"]
    }
  );
  let stderr = "";
  server.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.kill();
      reject(new Error(`Server startup timed out. ${stderr}`));
    }, 8_000);
    const finishWithError = (error: Error): void => {
      clearTimeout(timeout);
      reject(error);
    };

    server.once("error", finishWithError);
    server.once("exit", (code) => {
      finishWithError(
        new Error(`Server exited during startup with code ${code}. ${stderr}`)
      );
    });
    server.on("message", (message: unknown) => {
      if (
        typeof message !== "object" ||
        message === null ||
        !("type" in message) ||
        message.type !== "server-listening" ||
        !("port" in message) ||
        typeof message.port !== "number"
      ) {
        return;
      }

      clearTimeout(timeout);
      resolve({
        server,
        url: `http://127.0.0.1:${message.port}`
      });
    });
  });
}

test("accepted slaps survive disconnect pause", { timeout: 45_000 }, async () => {
  const { server, url } = await startServer();
  const host = createClient(url, { transports: ["websocket"], reconnection: true });
  let guest: Socket | null = null;

  try {
    await waitForEvent(host, "connect", () => true, 8_000);
    const created = await emitAck(host, "create-room", { playerName: "Host", avatar: "🐱" });
    assert.equal(created.success, true);
    const roomCode = created.roomCode;
    assert.ok(roomCode);

    guest = await connect(url);
    assert.equal((await emitAck(guest, "join-room", { roomCode, playerName: "Guest", avatar: "🐶" })).success, true);
    assert.equal((await emitAck(host, "select-game", { roomCode, gameId: "egyptian-war" })).success, true);
    assert.equal((await emitAck(host, "update-game-settings", {
      roomCode,
      settings: {
        deckCount: 1,
        includeJokers: true,
        allowDoubles: true,
        allowSandwiches: true,
        allowFourInARow: true,
        allowTopBottom: true,
        allowTens: true,
        allowMarriage: true,
        falseSlapPenaltyCards: 2,
        turnTimerSeconds: 120
      }
    })).success, true);

    let latestState: PublicEgyptianWarState | null = null;
    host.on("game-state", (envelope: {
      gameId: string;
      state: PublicEgyptianWarState;
    }) => {
      if (envelope.gameId === "egyptian-war") {
        latestState = envelope.state;
      }
    });
    assert.equal((await emitAck(host, "start-game", { roomCode })).success, true);

    const sockets = new Map([[host.id!, host], [guest.id!, guest]]);
    for (let turns = 0; turns < 54; turns += 1) {
      const currentLatestState =
        latestState as PublicEgyptianWarState | null;
      const readyState: PublicEgyptianWarState =
        currentLatestState !== null &&
        !currentLatestState.isAnimating &&
        !currentLatestState.isPaused
          ? currentLatestState
          : await waitForEgyptianWarState(
            host,
            (state) => !state.isAnimating && !state.isPaused,
            5_000
          );
      assert.ok(readyState);
      latestState = readyState;
      if (readyState.isSlappable) break;
      const currentSocket = readyState.currentPlayerId
        ? sockets.get(readyState.currentPlayerId)
        : undefined;
      assert.ok(currentSocket);
      latestState = null;
      assert.equal(
        (await emitEgyptianWarAction(currentSocket, roomCode, "play-card"))
          .success,
        true
      );
    }

    assert.ok(latestState?.isSlappable, "expected the shuffled game to reach a valid slap");
    const animationPromise = waitForEgyptianWarEvent<{
      action: string;
      slapAttempts: Array<{ playerId: string; delayMs: number; isWinner: boolean }>;
    }>(host, "animation", (value) => value.action === "slap", 5_000);

    assert.equal(
      (await emitEgyptianWarAction(host, roomCode, "slap")).success,
      true
    );
    const pauseResponse = await emitAck(host, "toggle-game-pause", { roomCode, isPaused: true });
    assert.equal(pauseResponse.success, false);
    assert.match(pauseResponse.message ?? "", /slap decision/i);
    assert.equal(
      (await emitEgyptianWarAction(guest, roomCode, "slap")).success,
      true
    );
    guest.disconnect();

    const animation = await animationPromise;
    assert.equal(animation.slapAttempts.length, 2);
    assert.equal(animation.slapAttempts.filter((attempt) => attempt.isWinner).length, 1);
    assert.ok(animation.slapAttempts.every((attempt) => Number.isFinite(attempt.delayMs)));
    const pausedState = await waitForEgyptianWarState(
      host,
      (state) => state.isPaused,
      5_000
    );
    assert.equal(pausedState.isPaused, true);
  } finally {
    host.disconnect();
    guest?.disconnect();
    await stopServer(server);
  }
});

test("late joiners spectate without pausing gameplay and return to the lobby as players", { timeout: 30_000 }, async () => {
  const { server, url } = await startServer();
  const host = await connect(url);
  let guest: Socket | null = null;
  let spectator: Socket | null = null;
  let resumedSpectator: Socket | null = null;

  try {
    const created = await emitAck(host, "create-room", {
      playerName: "Host",
      avatar: "🐱"
    });
    assert.equal(created.success, true);
    const roomCode = created.roomCode;
    assert.ok(roomCode);

    guest = await connect(url);
    assert.equal((await emitAck(guest, "join-room", {
      roomCode,
      playerName: "Guest",
      avatar: "🐶"
    })).success, true);
    assert.equal((await emitAck(host, "select-game", {
      roomCode,
      gameId: "egyptian-war"
    })).success, true);

    const initialStatePromise = waitForEgyptianWarState(host);
    assert.equal((await emitAck(host, "start-game", { roomCode })).success, true);
    const initialState = await initialStatePromise;

    spectator = await connect(url);
    const spectatorStatePromise = waitForEgyptianWarState(spectator);
    const spectatorListPromise = waitForEvent<Array<{
      id: string;
      name: string;
      isConnected: boolean;
    }>>(
      host,
      "spectator-list",
      (spectators) => spectators.some((member) => member.name === "Viewer")
    );
    const joined = await emitAck(spectator, "join-room", {
      roomCode,
      playerName: "Viewer",
      avatar: "🦊"
    });
    assert.equal(joined.success, true);
    assert.equal(joined.role, "spectator");

    const spectatorState = await spectatorStatePromise;
    assert.equal(spectatorState.players.length, 2);
    assert.equal((await spectatorListPromise)[0]?.name, "Viewer");

    const playAttempt = await emitEgyptianWarAction(
      spectator,
      roomCode,
      "play-card"
    );
    assert.equal(playAttempt.success, false);
    assert.match(playAttempt.message ?? "", /not a player/i);
    const slapAttempt = await emitEgyptianWarAction(
      spectator,
      roomCode,
      "slap"
    );
    assert.equal(slapAttempt.success, false);
    assert.match(slapAttempt.message ?? "", /not a player/i);

    const disconnectedListPromise = waitForEvent<Array<{
      name: string;
      isConnected: boolean;
    }>>(
      host,
      "spectator-list",
      (spectators) => spectators.some(
        (member) => member.name === "Viewer" && !member.isConnected
      )
    );
    spectator.disconnect();
    await disconnectedListPromise;

    const sockets = new Map([[host.id!, host], [guest.id!, guest]]);
    const currentSocket = initialState.currentPlayerId
      ? sockets.get(initialState.currentPlayerId)
      : undefined;
    assert.ok(currentSocket);
    assert.equal(
      (await emitEgyptianWarAction(currentSocket, roomCode, "play-card"))
        .success,
      true
    );

    resumedSpectator = await connect(url);
    const resumedStatePromise = waitForEgyptianWarState(resumedSpectator);
    const reconnectedListPromise = waitForEvent<Array<{
      name: string;
      isConnected: boolean;
    }>>(
      host,
      "spectator-list",
      (spectators) => spectators.some(
        (member) => member.name === "Viewer" && member.isConnected
      )
    );
    assert.ok(joined.resumeToken);
    const resumed = await emitAck(resumedSpectator, "resume-room", {
      resumeToken: joined.resumeToken
    });
    assert.equal(resumed.success, true);
    assert.equal(resumed.role, "spectator");
    assert.equal((await resumedStatePromise).players.length, 2);
    await reconnectedListPromise;

    const promotedPlayersPromise = waitForEvent<Array<{
      name: string;
      isConnected: boolean;
    }>>(
      host,
      "player-list",
      (players) => players.some((player) => player.name === "Viewer")
    );
    assert.equal((await emitAck(host, "close-game-to-lobby", { roomCode })).success, true);
    const promotedPlayers = await promotedPlayersPromise;
    assert.equal(
      promotedPlayers.find((player) => player.name === "Viewer")?.isConnected,
      true
    );
  } finally {
    host.disconnect();
    guest?.disconnect();
    spectator?.disconnect();
    resumedSpectator?.disconnect();
    await stopServer(server);
  }
});
