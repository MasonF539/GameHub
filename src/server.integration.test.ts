import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { io as createClient, type Socket } from "socket.io-client";
import type { PublicEgyptianWarState } from "./games/egyptianWarEngine.js";

type Ack = { success: boolean; message?: string; roomCode?: string };

function emitAck(socket: Socket, event: string, data: unknown): Promise<Ack> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} acknowledgement timed out`)), 4_000);
    socket.emit(event, data, (response: Ack) => {
      clearTimeout(timeout);
      resolve(response);
    });
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

test("live probes feed slap arbitration and accepted slaps survive disconnect pause", { timeout: 45_000 }, async () => {
  const port = 32_000 + Math.floor(Math.random() * 1_000);
  const url = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(process.cwd(), "dist", "server.js")], {
    env: { ...process.env, PORT: String(port), LATENCY_PROBE_INTERVAL_MS: "25" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const host = createClient(url, { transports: ["websocket"], reconnection: true });
  let guest: Socket | null = null;

  try {
    await waitForEvent(host, "connect", () => true, 8_000);
    let hostProbeCount = 0;
    host.on("latency-probe", (acknowledge: () => void) => {
      hostProbeCount += 1;
      acknowledge();
    });

    const created = await emitAck(host, "create-room", { playerName: "Host", avatar: "🐱" });
    assert.equal(created.success, true);
    const roomCode = created.roomCode;
    assert.ok(roomCode);

    guest = await connect(url);
    let guestProbeCount = 0;
    guest.on("latency-probe", (acknowledge: () => void) => {
      guestProbeCount += 1;
      setTimeout(acknowledge, 10);
    });
    assert.equal((await emitAck(guest, "join-room", { roomCode, playerName: "Guest", avatar: "🐶" })).success, true);
    assert.equal((await emitAck(host, "select-game", { roomCode, gameId: "egyptian-war" })).success, true);
    assert.equal((await emitAck(host, "update-game-settings", {
      roomCode,
      settings: {
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
    host.on("egyptian-war-state", (state: PublicEgyptianWarState) => {
      latestState = state;
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
          : await waitForEvent<PublicEgyptianWarState>(
            host,
            "egyptian-war-state",
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
      assert.equal((await emitAck(currentSocket, "play-card", { roomCode })).success, true);
    }

    assert.ok(latestState?.isSlappable, "expected the shuffled game to reach a valid slap");
    while (hostProbeCount < 4 || guestProbeCount < 4) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const animationPromise = waitForEvent<{
      action: string;
      slapAttempts: Array<{ playerId: string; delayMs: number; isWinner: boolean }>;
    }>(host, "egyptian-war-animation", (value) => value.action === "slap", 5_000);

    assert.equal((await emitAck(host, "slap", { roomCode })).success, true);
    const pauseResponse = await emitAck(host, "toggle-game-pause", { roomCode, isPaused: true });
    assert.equal(pauseResponse.success, false);
    assert.match(pauseResponse.message ?? "", /slap decision/i);
    assert.equal((await emitAck(guest, "slap", { roomCode })).success, true);
    guest.disconnect();

    const animation = await animationPromise;
    assert.equal(animation.slapAttempts.length, 2);
    assert.equal(animation.slapAttempts.filter((attempt) => attempt.isWinner).length, 1);
    assert.ok(animation.slapAttempts.every((attempt) => Number.isFinite(attempt.delayMs)));
    assert.ok(hostProbeCount >= 4);
    assert.ok(guestProbeCount >= 4);

    const pausedState = await waitForEvent<PublicEgyptianWarState>(
      host,
      "egyptian-war-state",
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
