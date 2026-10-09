import assert from "node:assert/strict";
import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { io as createClient, type Socket } from "socket.io-client";

type Ack = {
  success: boolean;
  message?: string;
  roomCode?: string;
  resumeToken?: string;
  role?: "player" | "spectator";
};

type FixtureState = {
  actionCount: number;
  isPaused: boolean;
  viewerRole: "player" | "spectator";
  members: Array<{
    id: string;
    name: string;
    isConnected: boolean;
    role: "player" | "spectator";
  }>;
};

const fixtureGameId = "fixture-game";

function emitAck(socket: Socket, event: string, data: unknown): Promise<Ack> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${event} acknowledgement timed out`)),
      4_000
    );
    socket.emit(event, data, (response: Ack) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

function emitGameAction(
  socket: Socket,
  roomCode: string,
  type: string
): Promise<Ack> {
  return emitAck(socket, "game-action", {
    roomCode,
    gameId: fixtureGameId,
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

function waitForFixtureState(
  socket: Socket,
  predicate: (state: FixtureState) => boolean = () => true,
  timeoutMs = 5_000
): Promise<FixtureState> {
  return waitForEvent<{ gameId: string; state: FixtureState }>(
    socket,
    "game-state",
    (envelope) =>
      envelope.gameId === fixtureGameId && predicate(envelope.state),
    timeoutMs
  ).then((envelope) => envelope.state);
}

async function connect(url: string): Promise<Socket> {
  const socket = createClient(url, {
    transports: ["websocket"],
    reconnection: false
  });
  if (socket.connected) return socket;
  await waitForEvent(socket, "connect");
  return socket;
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) return;
  server.kill();
  await new Promise<void>((resolve) => server.once("exit", () => resolve()));
}

async function startServer(): Promise<{ server: ChildProcess; url: string }> {
  const fixturePackage = path.join(
    process.cwd(),
    "test",
    "fixtures",
    "minimal-game-plugin",
    "index.js"
  );
  const server = fork(path.join(process.cwd(), "dist", "server.js"), [], {
    env: {
      ...process.env,
      PORT: "0",
      NODE_ENV: "test",
      GAMEHUB_GAME_PACKAGES: fixturePackage
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });
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

test(
  "a configured plugin receives generic actions, spectators, and lifecycle events",
  { timeout: 30_000 },
  async () => {
    const { server, url } = await startServer();
    const host = await connect(url);
    let guest: Socket | null = null;
    let spectator: Socket | null = null;
    let resumedSpectator: Socket | null = null;
    let outsider: Socket | null = null;

    try {
      const pageResponse = await fetch(url);
      const pageHtml = await pageResponse.text();
      assert.equal(pageResponse.status, 200);
      assert.match(pageHtml, /id="game-root"/);
      assert.match(pageHtml, /id="fixture-game-view"/);
      assert.match(pageHtml, /data-game-plugin-root="fixture-game"/);
      assert.match(
        pageHtml,
        /\/games\/fixture-game\/style\.css[^>]+data-game-plugin-style="fixture-game"[^>]+disabled/
      );
      assert.match(
        pageHtml,
        /<script type="module" src="\/games\/fixture-game\/client\.js"><\/script>/
      );
      assert.match(pageHtml, /"avatars":\[/);
      assert.doesNotMatch(pageHtml, /egyptian-war/i);

      host.emit("create-room", { playerName: "", avatar: "" });

      const controlCharacterName = await emitAck(host, "create-room", {
        playerName: "Bad\nName",
        avatar: "\u{1F431}"
      });
      assert.equal(controlCharacterName.success, false);

      const created = await emitAck(host, "create-room", {
        playerName: "Host",
        avatar: "\u{1F431}"
      });
      assert.equal(created.success, true);
      const roomCode = created.roomCode;
      assert.ok(roomCode);

      guest = await connect(url);
      assert.equal((await emitAck(guest, "join-room", {
        roomCode,
        playerName: "Guest",
        avatar: "\u{1F436}"
      })).success, true);
      assert.equal((await emitAck(host, "select-game", {
        roomCode,
        gameId: fixtureGameId
      })).success, true);

      const initialStatePromise = waitForFixtureState(host);
      assert.equal((await emitAck(host, "start-game", { roomCode })).success, true);
      const initialState = await initialStatePromise;
      assert.equal(initialState.viewerRole, "player");
      assert.equal(initialState.members.length, 2);

      outsider = await connect(url);
      const outsiderAction = await emitGameAction(
        outsider,
        roomCode,
        "advance"
      );
      assert.equal(outsiderAction.success, false);
      assert.match(outsiderAction.message ?? "", /join this room/i);

      const failedPluginAction = await emitGameAction(host, roomCode, "throw");
      assert.equal(failedPluginAction.success, false);
      assert.match(failedPluginAction.message ?? "", /unable to process/i);

      const advancedStatePromise = waitForFixtureState(
        host,
        (state) => state.actionCount === 1
      );
      assert.equal((await emitGameAction(host, roomCode, "advance")).success, true);
      assert.equal((await advancedStatePromise).actionCount, 1);

      const pausedStatePromise = waitForFixtureState(
        guest,
        (state) => state.isPaused
      );
      assert.equal((await emitAck(host, "toggle-game-pause", {
        roomCode,
        isPaused: true
      })).success, true);
      assert.equal((await pausedStatePromise).isPaused, true);

      const resumedStatePromise = waitForFixtureState(
        guest,
        (state) => !state.isPaused
      );
      assert.equal((await emitAck(host, "toggle-game-pause", {
        roomCode,
        isPaused: false
      })).success, true);
      assert.equal((await resumedStatePromise).isPaused, false);

      spectator = await connect(url);
      const spectatorStatePromise = waitForFixtureState(spectator);
      const spectatorListPromise = waitForEvent<Array<{
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
        avatar: "\u{1F98A}"
      });
      assert.equal(joined.success, true);
      assert.equal(joined.role, "spectator");
      assert.equal((await spectatorStatePromise).viewerRole, "spectator");
      assert.equal((await spectatorListPromise)[0]?.name, "Viewer");

      const spectatorAction = await emitGameAction(
        spectator,
        roomCode,
        "advance"
      );
      assert.equal(spectatorAction.success, false);
      assert.match(spectatorAction.message ?? "", /not a player/i);

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

      resumedSpectator = await connect(url);
      const reconnectedStatePromise = waitForFixtureState(resumedSpectator);
      assert.ok(joined.resumeToken);
      const resumed = await emitAck(resumedSpectator, "resume-room", {
        resumeToken: joined.resumeToken
      });
      assert.equal(resumed.success, true);
      assert.equal(resumed.role, "spectator");
      assert.equal((await reconnectedStatePromise).viewerRole, "spectator");

      const promotedPlayersPromise = waitForEvent<Array<{
        name: string;
        isConnected: boolean;
      }>>(
        host,
        "player-list",
        (players) => players.some((player) => player.name === "Viewer")
      );
      assert.equal((await emitAck(host, "close-game-to-lobby", {
        roomCode
      })).success, true);
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
      outsider?.disconnect();
      await stopServer(server);
    }
  }
);
