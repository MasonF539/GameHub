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

async function connectWithHeaders(
  url: string,
  extraHeaders: Record<string, string>
): Promise<Socket> {
  const socket = createClient(url, {
    transports: ["websocket"],
    reconnection: false,
    extraHeaders
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

async function startServer(
  extraEnv: Record<string, string> = {}
): Promise<{ server: ChildProcess; url: string }> {
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
      GAMEHUB_GAME_PACKAGES: fixturePackage,
      ...extraEnv
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

const catAvatar = "\u{1F431}";
const dogAvatar = "\u{1F436}";

test("responses carry security headers and hide the framework", async () => {
  const { server, url } = await startServer();

  try {
    const response = await fetch(url);

    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    const policy = response.headers.get("content-security-policy") ?? "";
    assert.match(policy, /default-src 'self'/);
    assert.match(policy, /frame-ancestors 'none'/);
    assert.match(policy, /object-src 'none'/);
  } finally {
    await stopServer(server);
  }
});

test("names must be unique in a room and cannot hide characters", { timeout: 20_000 }, async () => {
  const { server, url } = await startServer();
  const host = await connect(url);
  const guest = await connect(url);

  try {
    const created = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
    const roomCode = created.roomCode;
    assert.ok(roomCode);

    for (const name of ["host", "HOST", "Gu\u200Best", "Gu\u202Eest"]) {
      const result = await emitAck(guest, "join-room", { roomCode, playerName: name, avatar: dogAvatar });
      assert.equal(result.success, false, `name ${JSON.stringify(name)} should be rejected`);
    }

    const joined = await emitAck(guest, "join-room", { roomCode, playerName: "Guest", avatar: dogAvatar });
    assert.equal(joined.success, true);
  } finally {
    host.close();
    guest.close();
    await stopServer(server);
  }
});

test("a guest can leave a room, but the host cannot leave it", { timeout: 20_000 }, async () => {
  const { server, url } = await startServer();
  const host = await connect(url);
  const guest = await connect(url);

  try {
    const created = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
    const roomCode = created.roomCode;
    assert.ok(roomCode);
    assert.equal((await emitAck(guest, "join-room", { roomCode, playerName: "Guest", avatar: dogAvatar })).success, true);

    const hostLeave = await emitAck(host, "leave-lobby", { roomCode });
    assert.equal(hostLeave.success, false); 

    const listAfterLeave = waitForEvent<Array<{ name: string }>>(
      host,
      "player-list",
      (players) => players.length === 1
    );
    assert.equal((await emitAck(guest, "leave-lobby", { roomCode })).success, true);
    assert.deepEqual((await listAfterLeave).map((player) => player.name), ["Host"]);

    // A member who left is no longer in any room.
    assert.equal((await emitAck(guest, "leave-lobby", { roomCode })).success, false);
    const rejoin = await emitAck(guest, "join-room", { roomCode, playerName: "Guest", avatar: dogAvatar });
    assert.equal(rejoin.success, true);
  } finally {
    host.close();
    guest.close();
    await stopServer(server);
  }
});

test("a guest can leave an active game and the host keeps playing", { timeout: 25_000 }, async () => {
  const { server, url } = await startServer();
  const host = await connect(url);
  const guest = await connect(url);

  try {
    const created = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
    const roomCode = created.roomCode;
    assert.ok(roomCode);
    assert.equal((await emitAck(guest, "join-room", { roomCode, playerName: "Guest", avatar: dogAvatar })).success, true);
    assert.equal((await emitAck(host, "select-game", { roomCode, gameId: fixtureGameId })).success, true);
    assert.equal((await emitAck(host, "start-game", { roomCode })).success, true);

    assert.equal((await emitAck(guest, "leave-game", { roomCode })).success, true);
    // The room and its game are still there for the host.
    assert.equal((await emitGameAction(host, roomCode, "advance")).success, true);
  } finally {
    host.close();
    guest.close();
    await stopServer(server);
  }
});

test("kicking a connected lobby player does not claim they were disconnected", { timeout: 20_000 }, async () => {
  const { server, url } = await startServer();
  const host = await connect(url);
  const guest = await connect(url);

  try {
    const created = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
    const roomCode = created.roomCode;
    assert.ok(roomCode);
    assert.equal((await emitAck(guest, "join-room", { roomCode, playerName: "Guest", avatar: dogAvatar })).success, true);

    const kicked = waitForEvent<{ message: string }>(guest, "kicked-from-room");
    assert.equal((await emitAck(host, "kick-player", { roomCode, playerId: guest.id })).success, true);
    assert.doesNotMatch((await kicked).message, /disconnected/i);
  } finally {
    host.close();
    guest.close();
    await stopServer(server);
  }
});

test("forged Cloudflare headers do not dodge the join limit unless trusted", { timeout: 40_000 }, async () => {
  const { server, url } = await startServer();
  const sockets: Socket[] = [];

  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const socket = await connectWithHeaders(url, { "cf-connecting-ip": `203.0.113.${attempt + 1}` });
      sockets.push(socket);
      const result = await emitAck(socket, "join-room", { roomCode: "ZZZZZZ", playerName: "Guesser", avatar: catAvatar });
      assert.equal(result.success, false);
      assert.doesNotMatch(result.message ?? "", /too many/i);
    }

    const eleventh = await connectWithHeaders(url, { "cf-connecting-ip": "198.51.100.77" });
    sockets.push(eleventh);
    const blocked = await emitAck(eleventh, "join-room", { roomCode: "ZZZZZZ", playerName: "Guesser", avatar: catAvatar });
    assert.match(blocked.message ?? "", /too many/i);
  } finally {
    sockets.forEach((socket) => socket.close());
    await stopServer(server);
  }
});

test("a successful join does not reset the failed-join counter", { timeout: 40_000 }, async () => {
  const { server, url } = await startServer();
  const sockets: Socket[] = [];

  try {
    const owner = await connect(url);
    sockets.push(owner);
    const created = await emitAck(owner, "create-room", { playerName: "Owner", avatar: catAvatar });
    const roomCode = created.roomCode;
    assert.ok(roomCode);

    const guesser = await connect(url);
    sockets.push(guesser);
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const result = await emitAck(guesser, "join-room", { roomCode: "ZZZZZZ", playerName: "Guesser", avatar: dogAvatar });
      assert.equal(result.success, false);
    }
    // One legitimate join in between used to wipe the nine failures.
    assert.equal((await emitAck(guesser, "join-room", { roomCode, playerName: "Guesser", avatar: dogAvatar })).success, true);

    const another = await connect(url);
    sockets.push(another);
    await emitAck(another, "join-room", { roomCode: "ZZZZZZ", playerName: "Guesser2", avatar: dogAvatar });
    const blocked = await emitAck(another, "join-room", { roomCode, playerName: "Guesser2", avatar: dogAvatar });
    assert.equal(blocked.success, false);
    assert.match(blocked.message ?? "", /too many/i);
  } finally {
    sockets.forEach((socket) => socket.close());
    await stopServer(server);
  }
});

test("room creation is limited per address", { timeout: 40_000 }, async () => {
  const { server, url } = await startServer();
  const sockets: Socket[] = [];

  try {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const socket = await connect(url);
      sockets.push(socket);
      const created = await emitAck(socket, "create-room", { playerName: `Host${attempt}`, avatar: catAvatar });
      assert.equal(created.success, true);
    }

    const extra = await connect(url);
    sockets.push(extra);
    const refused = await emitAck(extra, "create-room", { playerName: "TooMany", avatar: catAvatar });
    assert.equal(refused.success, false);
    assert.match(refused.message ?? "", /too quickly/i);
  } finally {
    sockets.forEach((socket) => socket.close());
    await stopServer(server);
  }
});

test("the room cap refuses new rooms when the server is full", { timeout: 20_000 }, async () => {
  const { server, url } = await startServer({ GAMEHUB_MAX_ROOMS: "1" });
  const first = await connect(url);
  const second = await connect(url);

  try {
    assert.equal((await emitAck(first, "create-room", { playerName: "One", avatar: catAvatar })).success, true);
    const refused = await emitAck(second, "create-room", { playerName: "Two", avatar: catAvatar });
    assert.equal(refused.success, false);
    assert.match(refused.message ?? "", /busy/i);
  } finally {
    first.close();
    second.close();
    await stopServer(server);
  }
});

async function startFixtureGame(
  url: string,
  playerCount = 2
): Promise<{ roomCode: string; host: Socket; guests: Socket[] }> {
  const host = await connect(url);
  const created = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
  const roomCode = created.roomCode;
  assert.ok(roomCode);
  const guests: Socket[] = [];

  for (let index = 1; index < playerCount; index += 1) {
    const guest = await connect(url);
    guests.push(guest);
    assert.equal((await emitAck(guest, "join-room", {
      roomCode,
      playerName: index === 1 ? "Guest" : `Guest${index}`,
      avatar: dogAvatar
    })).success, true);
  }

  assert.equal((await emitAck(host, "select-game", { roomCode, gameId: fixtureGameId })).success, true);
  assert.equal((await emitAck(host, "start-game", { roomCode })).success, true);
  return { roomCode, host, guests };
}

test("a host who stays away mid-game closes the room instead of stranding it", { timeout: 25_000 }, async () => {
  const { server, url } = await startServer({ GAMEHUB_TEST_RECONNECT_GRACE_MS: "500" });
  const { host, guests } = await startFixtureGame(url);
  const [guest] = guests;

  try {
    const closed = waitForEvent(guest, "room-closed", () => true, 8_000);
    host.close();
    await closed;
  } finally {
    host.close();
    guest.close();
    await stopServer(server);
  }
});

test("a player who drops mid-game is left for the host to handle", { timeout: 25_000 }, async () => {
  const { server, url } = await startServer({ GAMEHUB_TEST_RECONNECT_GRACE_MS: "500" });
  const { host, guests } = await startFixtureGame(url);
  const [guest] = guests;
  const lists: Array<Array<{ name: string; isConnected: boolean }>> = [];
  host.on("player-list", (players) => lists.push(players));

  try {
    const dropped = waitForEvent<Array<{ name: string; isConnected: boolean }>>(
      host,
      "player-list",
      (players) => players.some((player) => player.name === "Guest" && !player.isConnected)
    );
    guest.close();
    await dropped;
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    assert.ok(
      lists.every((players) => players.some((player) => player.name === "Guest")),
      "the dropped player must still be listed after the recovery period"
    );
  } finally {
    host.close();
    guest.close();
    await stopServer(server);
  }
});

test("players who dropped during a game expire once the game is over", { timeout: 25_000 }, async () => {
  const { server, url, } = await startServer({ GAMEHUB_TEST_RECONNECT_GRACE_MS: "500" });
  const { roomCode, host, guests } = await startFixtureGame(url);
  const [guest] = guests;

  try {
    const dropped = waitForEvent<Array<{ name: string; isConnected: boolean }>>(
      host,
      "player-list",
      (players) => players.some((player) => player.name === "Guest" && !player.isConnected)
    );
    guest.close();
    await dropped;

    const expired = waitForEvent<Array<{ name: string }>>(
      host,
      "player-list",
      (players) => players.length === 1,
      8_000
    );
    assert.equal((await emitAck(host, "close-game-to-lobby", { roomCode })).success, true);
    assert.deepEqual((await expired).map((player) => player.name), ["Host"]);
  } finally {
    host.close();
    guest.close();
    await stopServer(server);
  }
});
