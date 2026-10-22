import assert from "node:assert/strict";
import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { io as createClient, type Socket } from "socket.io-client";

type Ack = {
  success: boolean;
  sessionUnavailable?: boolean;
  message?: string;
  roomCode?: string;
  resumeToken?: string;
  role?: "player" | "spectator";
  pendingApproval?: boolean;
  roomClosed?: boolean;
  sessions?: Array<{ resumeToken: string; playerName: string; isConnected: boolean; expiresAt: number; isHost: boolean; releaseClosesRoom: boolean }>;
  chatHistory?: Array<{ senderName: string; message: string; sentAt: number }>;
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

test("connections receive a validated public invite URL for local caching", { timeout: 30_000 }, async () => {
  for (const publicUrl of ["https://example.trycloudflare.com/?old=value#old", "javascript:alert(1)"]) {
    const { server, url } = await startServer({ GAMEHUB_PUBLIC_URL: publicUrl });
    const host = createClient(url, { autoConnect: false, transports: ["websocket"], reconnection: false });
    try {
      const address = waitForEvent<string | null>(host, "public-invite-url");
      host.connect();
      assert.equal(await address, publicUrl.startsWith("https:") ? "https://example.trycloudflare.com/" : null);
    } finally { host.disconnect(); await stopServer(server); }
  }
});

test("host approval gates players and spectators and rechecks room state", { timeout: 30_000 }, async () => {
  const { server, url } = await startServer();
  const host = await connect(url);
  const guest = await connect(url);
  const outsider = await connect(url);
  try {
    const created = await emitAck(host, "create-room", { playerName: "Host", avatar: "\u{1F431}" });
    const roomCode = created.roomCode!;
    assert.equal((await emitAck(host, "set-room-approval", { enabled: true })).success, true);
    let leakedEvents = 0;
    for (const event of ["player-list", "game-state", "game-chat-message", "game-selected"]) {
      guest.on(event, () => leakedEvents++);
    }
    const requested = waitForEvent<Array<{ id: string }>>(host, "join-requests", (requests) => requests.length === 1);
    const pending = await emitAck(guest, "join-room", { roomCode, playerName: "Guest", avatar: "\u{1F436}" });
    assert.equal(pending.pendingApproval, true);
    assert.equal((await requested)[0]!.id, guest.id);
    assert.equal(leakedEvents, 0);
    assert.equal((await emitAck(outsider, "review-join-request", { memberId: guest.id, accept: true })).success, false);
    const joined = waitForEvent<Ack>(guest, "join-request-result");
    const approved = await emitAck(host, "review-join-request", { memberId: guest.id, accept: true });
    assert.equal(approved.success, true);
    assert.equal(approved.resumeToken, undefined);
    assert.equal((await joined).role, "player");
    assert.equal((await emitAck(host, "select-game", { roomCode, gameId: fixtureGameId })).success, true);
    assert.equal((await emitAck(host, "start-game", { roomCode })).success, true);
    let spectatorStates = 0;
    outsider.on("game-state", () => spectatorStates++);
    const pendingSpectator = await emitAck(outsider, "join-room", { roomCode, playerName: "Viewer", avatar: "\u{1F431}" });
    assert.equal(pendingSpectator.pendingApproval, true);
    assert.equal(spectatorStates, 0);
    const declined = waitForEvent<Ack>(outsider, "join-request-result");
    await emitAck(host, "review-join-request", { memberId: outsider.id, accept: false });
    assert.equal((await declined).success, false);
    await emitAck(outsider, "join-room", { roomCode, playerName: "Viewer", avatar: "\u{1F431}" });
    const locked = waitForEvent<Ack>(outsider, "join-request-result");
    await emitAck(host, "set-room-locked", { roomCode, isLocked: true });
    assert.equal((await emitAck(host, "review-join-request", { memberId: outsider.id, accept: true })).success, false);
    const blocked = await emitAck(outsider, "join-room", { roomCode, playerName: "Viewer", avatar: "\u{1F431}" });
    assert.equal(blocked.success, false);
    assert.equal(blocked.pendingApproval, undefined);
    assert.equal((await locked).success, false);
    await emitAck(host, "set-room-locked", { roomCode, isLocked: false });
    await emitAck(outsider, "join-room", { roomCode, playerName: "Viewer", avatar: "\u{1F431}" });
    const accepted = waitForEvent<Ack>(outsider, "join-request-result");
    await emitAck(host, "review-join-request", { memberId: outsider.id, accept: true });
    assert.equal((await accepted).role, "spectator");
  } finally {
    host.disconnect(); guest.disconnect(); outsider.disconnect();
    await stopServer(server);
  }
});

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
      const gameEndedPromise = waitForEvent<{
        returningMemberIds: string[];
      }>(host, "game-ended");
      assert.equal((await emitAck(host, "close-game-to-lobby", {
        roomCode
      })).success, true);
      const gameEnded = await gameEndedPromise;
      assert.equal(gameEnded.returningMemberIds.length, 1);
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

test("room chat restores only the last 50 messages on join, resume, and spectate", { timeout: 30_000 }, async () => {
  const { server, url } = await startServer();
  const clients: Socket[] = [];
  try {
    const host = await connect(url);
    clients.push(host);
    const created = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
    const roomCode = created.roomCode!;
    const guest = await connect(url);
    clients.push(guest);
    assert.equal((await emitAck(guest, "join-room", { roomCode, playerName: "Guest", avatar: dogAvatar })).success, true);
    assert.equal((await emitAck(host, "select-game", { roomCode, gameId: fixtureGameId })).success, true);
    assert.equal((await emitAck(host, "start-game", { roomCode })).success, true);
    for (let index = 0; index < 8; index += 1) {
      const sender = await connect(url);
      clients.push(sender);
      assert.equal((await emitAck(sender, "join-room", { roomCode, playerName: `Sender ${index}`, avatar: catAvatar })).success, true);
    }
    for (let batch = 0; batch < 6; batch += 1) {
      if (batch > 0) await new Promise((resolve) => setTimeout(resolve, 800));
      for (const [index, sender] of clients.entries()) {
        assert.equal((await emitAck(sender, "game-chat-send", { roomCode, message: `${batch}-${index}` })).success, true);
      }
    }
    const viewer = await connect(url);
    clients.push(viewer);
    const joined = await emitAck(viewer, "join-room", { roomCode, playerName: "Viewer", avatar: catAvatar });
    assert.equal(joined.chatHistory?.length, 50);
    assert.equal(joined.chatHistory[0]?.message, "1-0");
    assert.equal(joined.chatHistory[49]?.message, "5-9");
    const disconnected = waitForEvent<Array<{ name: string; isConnected: boolean }>>(host, "spectator-list",
      (members) => members.some((member) => member.name === "Viewer" && !member.isConnected));
    viewer.disconnect();
    await disconnected;
    const resumed = await connect(url);
    clients.push(resumed);
    const snapshot = waitForEvent<{ chatHistory: Ack["chatHistory"] }>(resumed, "room-resumed");
    assert.equal((await emitAck(resumed, "resume-room", { resumeToken: joined.resumeToken })).success, true);
    assert.deepEqual((await snapshot).chatHistory, joined.chatHistory);
    assert.equal((await emitAck(guest, "leave-game", { roomCode })).success, true);
    const spectating = waitForEvent<{ chatHistory: Ack["chatHistory"] }>(guest, "game-started");
    assert.equal((await emitAck(guest, "spectate-game", { roomCode })).success, true);
    assert.deepEqual((await spectating).chatHistory, joined.chatHistory);

    const outsider = await connect(url);
    clients.push(outsider);
    const separate = await emitAck(outsider, "create-room", { playerName: "Other host", avatar: catAvatar });
    const ownSnapshot = waitForEvent<{ chatHistory: unknown[] }>(outsider, "room-resumed");
    assert.equal((await emitAck(outsider, "resume-room", { resumeToken: separate.resumeToken })).success, true);
    assert.deepEqual((await ownSnapshot).chatHistory, []);
  } finally {
    clients.forEach((client) => client.disconnect());
    await stopServer(server);
  }
});

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

test("an active player must leave the game before leaving the lobby", { timeout: 25_000 }, async () => {
  const { server, url } = await startServer();
  const host = await connect(url);
  const guest = await connect(url);

  try {
    const created = await emitAck(host, "create-room", {
      playerName: "Host",
      avatar: catAvatar
    });
    const roomCode = created.roomCode;
    assert.ok(roomCode);
    assert.equal((await emitAck(guest, "join-room", {
      roomCode,
      playerName: "Guest",
      avatar: dogAvatar
    })).success, true);
    assert.equal((await emitAck(host, "select-game", {
      roomCode,
      gameId: fixtureGameId
    })).success, true);
    assert.equal((await emitAck(host, "start-game", { roomCode })).success, true);

    const rejected = await emitAck(guest, "leave-lobby", { roomCode });
    assert.equal(rejected.success, false);
    assert.match(rejected.message ?? "", /leave the active game/i);

    const guestState = waitForFixtureState(
      guest,
      (state) => state.actionCount === 1
    );
    assert.equal((await emitGameAction(guest, roomCode, "advance")).success, true);
    assert.equal((await guestState).viewerRole, "player");
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
    assert.equal((await emitAck(guest, "leave-game", { roomCode })).success, false);
    assert.equal((await emitGameAction(guest, roomCode, "advance")).success, false);
    assert.equal((await emitAck(guest, "game-chat-send", {
      roomCode,
      message: "I should no longer be in game chat."
    })).success, false);

    let lobbyGameEventCount = 0;
    const countLobbyGameEvent = (): void => {
      lobbyGameEventCount += 1;
    };
    guest.on("game-event", countLobbyGameEvent);

    // The room and its game are still there for the host, but the lobby waiter
    // is no longer exposed to the plugin as a player.
    const hostState = waitForFixtureState(
      host,
      (state) => state.actionCount === 1
    );
    assert.equal((await emitGameAction(host, roomCode, "advance")).success, true);
    assert.deepEqual(
      (await hostState).members.map((member) => member.name),
      ["Host"]
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(lobbyGameEventCount, 0);
    guest.off("game-event", countLobbyGameEvent);

    const spectatorState = waitForFixtureState(
      guest,
      (state) => state.viewerRole === "spectator"
    );
    assert.equal((await emitAck(guest, "spectate-game", { roomCode })).success, true);
    assert.equal((await spectatorState).viewerRole, "spectator");
    assert.equal((await emitAck(guest, "leave-game", { roomCode })).success, true);
    assert.equal((await emitGameAction(guest, roomCode, "advance")).success, false);

    // Disconnecting after leaving the game must not pause it.
    guest.disconnect();
    const secondHostState = waitForFixtureState(
      host,
      (state) => state.actionCount === 2
    );
    assert.equal((await emitGameAction(host, roomCode, "advance")).success, true);
    assert.equal((await secondHostState).isPaused, false);
  } finally {
    host.close();
    guest.close();
    await stopServer(server);
  }
});

test("the host can remove a lobby waiter while a game remains active", { timeout: 25_000 }, async () => {
  const { server, url } = await startServer();
  const { roomCode, host, guests } = await startFixtureGame(url);
  const [guest] = guests;

  try {
    assert.equal((await emitAck(guest, "leave-game", { roomCode })).success, true);
    const playerList = waitForEvent<Array<{ name: string }>>(
      host,
      "player-list",
      (players) => players.length === 1
    );
    const kicked = waitForEvent<{ message: string }>(guest, "kicked-from-room");

    const result = await emitAck(host, "kick-player", {
      roomCode,
      playerId: guest.id
    });

    assert.equal(result.success, true);
    assert.match((await kicked).message, /removed from the lobby/i);
    assert.deepEqual((await playerList).map((player) => player.name), ["Host"]);
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

test("a host who stays away mid-game hands control to a connected player", { timeout: 25_000 }, async () => {
  const { server, url } = await startServer({ GAMEHUB_TEST_RECONNECT_GRACE_MS: "500" });
  const { host, guests, roomCode } = await startFixtureGame(url);
  const [guest] = guests;

  try {
    const transferred = waitForEvent<{ hostId: string }>(guest, "room-host", (state) => state.hostId === guest.id, 8_000);
    host.close();
    await transferred;
    assert.equal((await emitAck(guest, "toggle-game-pause", { roomCode, isPaused: false })).success, true);
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

test("host sees approval failures and cancelled requests release their socket index", async () => {
  const { server, url } = await startServer();
  const host = await connect(url), first = await connect(url), second = await connect(url);
  try {
    const { roomCode } = await emitAck(host, "create-room", { playerName: "Host", avatar: "\u{1F431}" });
    await emitAck(host, "set-room-approval", { enabled: true });
    const request = { roomCode, playerName: "Same name", avatar: "\u{1F431}" };
    assert.equal((await emitAck(first, "join-room", request)).pendingApproval, true);
    await emitAck(first, "cancel-join-request", {});
    assert.equal((await emitAck(first, "join-room", request)).pendingApproval, true);
    assert.equal((await emitAck(second, "join-room", request)).pendingApproval, true);
    await emitAck(host, "review-join-request", { memberId: second.id, accept: true });
    const rejected = waitForEvent<Ack>(first, "join-request-result");
    const result = await emitAck(host, "review-join-request", { memberId: first.id, accept: true });
    assert.equal(result.success, false);
    assert.match(result.message ?? "", /name is already taken/);
    assert.equal((await rejected).success, false);
  } finally {
    host.disconnect(); first.disconnect(); second.disconnect(); await stopServer(server);
  }
});

type Scoreboard = { rows: Array<{ id: string; name: string; avatar: string; values: Record<string, number> }> };
test("room scores survive reconnects and restarts; handoff updates permissions and reset stays host-only", async () => {
  const { server, url } = await startServer();
  const host = await connect(url), guest = await connect(url);
  let restored: Socket | undefined;
  try {
    const created = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
    const roomCode = created.roomCode!;
    const joined = await emitAck(guest, "join-room", { roomCode, playerName: "Guest", avatar: dogAvatar });
    await emitAck(host, "select-game", { roomCode, gameId: fixtureGameId });
    await emitAck(host, "start-game", { roomCode });
    const scored = waitForEvent<Scoreboard>(host, "room-scoreboard", (board) => board.rows.some((row) => row.values.actions === 1));
    await emitGameAction(guest, roomCode, "advance");
    const scoreId = (await scored).rows.find((row) => row.name === "Guest")!.id;
    assert.equal((await emitAck(guest, "transfer-host", { memberId: host.id })).success, false);
    assert.equal((await emitAck(host, "transfer-host", { memberId: guest.id })).success, true);
    assert.equal((await emitAck(host, "toggle-game-pause", { roomCode, isPaused: true })).success, false);
    guest.disconnect();
    restored = await connect(url);
    const snapshot = waitForEvent<Scoreboard>(restored, "room-scoreboard", (board) => board.rows.some((row) => row.id === scoreId));
    assert.equal((await emitAck(restored, "resume-room", { resumeToken: joined.resumeToken })).success, true);
    assert.equal((await snapshot).rows.find((row) => row.id === scoreId)!.values.actions, 1);
    assert.equal((await emitAck(restored, "toggle-game-pause", { roomCode, isPaused: false })).success, true);
    const won = waitForEvent<Scoreboard>(host, "room-scoreboard", (board) => board.rows.some((row) => row.values.wins === 1));
    await emitGameAction(restored, roomCode, "finish");
    assert.equal((await won).rows.find((row) => row.id === scoreId)!.values.wins, 1);
    const restarted = waitForEvent<Scoreboard>(host, "room-scoreboard", (board) => board.rows.some((row) => row.values.wins === 1));
    assert.equal((await emitAck(restored, "start-game", { roomCode })).success, true);
    await restarted;
    assert.equal((await emitAck(host, "reset-room-scoreboard", { gameId: fixtureGameId })).success, false);
    const cleared = waitForEvent<Scoreboard>(host, "room-scoreboard", (board) => board.rows.every((row) => row.values.wins === 0 && row.values.actions === 0));
    assert.equal((await emitAck(restored, "reset-room-scoreboard", { gameId: fixtureGameId })).success, true);
    await cleared;
  } finally { host.disconnect(); guest.disconnect(); restored?.disconnect(); await stopServer(server); }
});

test("a host with no connected successor still expires the abandoned room", async () => {
  const { server, url } = await startServer({ GAMEHUB_TEST_RECONNECT_GRACE_MS: "200" });
  const host = await connect(url);
  const created = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
  host.disconnect();
  const visitor = await connect(url);
  try {
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal((await emitAck(visitor, "join-room", { roomCode: created.roomCode, playerName: "Visitor", avatar: dogAvatar })).success, false);
  } finally { visitor.disconnect(); await stopServer(server); }
});

test("lobby handoff removes the expired host so the remaining players can start", async () => {
  const { server, url } = await startServer({ GAMEHUB_TEST_RECONNECT_GRACE_MS: "200" });
  const host = await connect(url), first = await connect(url), second = await connect(url);
  try {
    const { roomCode } = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
    await emitAck(first, "join-room", { roomCode, playerName: "First", avatar: dogAvatar });
    await emitAck(second, "join-room", { roomCode, playerName: "Second", avatar: dogAvatar });
    await emitAck(host, "select-game", { roomCode, gameId: fixtureGameId });
    const transferred = waitForEvent<{ hostId: string }>(first, "room-host", (state) => state.hostId === first.id);
    const cleaned = waitForEvent<Array<{ name: string }>>(first, "player-list", (players) => players.length === 2 && players.every((player) => player.name !== "Host"));
    host.disconnect(); await transferred; await cleaned;
    assert.equal((await emitAck(first, "start-game", { roomCode })).success, true);
  } finally { host.disconnect(); first.disconnect(); second.disconnect(); await stopServer(server); }
});


test("host recovery announces the default 60-second handoff deadline", { timeout: 30_000 }, async () => {
  const { server, url } = await startServer();
  const host = await connect(url);
  const guest = await connect(url);
  try {
    const created = await emitAck(host, "create-room", { playerName: "Host", avatar: "\u{1F431}" });
    await emitAck(guest, "join-room", { roomCode: created.roomCode, playerName: "Guest", avatar: "\u{1F436}" });
    const recovery = waitForEvent<{ recoveryDeadline: number; serverNow: number }>(guest, "room-host", data => data.recoveryDeadline !== null);
    host.disconnect();
    const { recoveryDeadline, serverNow } = await recovery;
    assert.ok(recoveryDeadline - serverNow <= 60_000);
    assert.ok(recoveryDeadline - serverNow >= 59_900);
  } finally { host.disconnect(); guest.disconnect(); await stopServer(server); }
});


test("rejected saved settings preserve both the selected game and its rules", async () => {
  const fixturePath = path.resolve("test/fixtures/minimal-game-plugin/index.js");
  const { server, url } = await startServer({ GAMEHUB_GAME_PACKAGES: `${fixturePath},@masonf539/egyptian-war` });
  const host = await connect(url), guest = await connect(url);
  try {
    const { roomCode } = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
    await emitAck(host, "select-game", { roomCode, gameId: fixtureGameId });
    const rejected = await emitAck(host, "select-game", { roomCode, gameId: "egyptian-war", settings: {} });
    assert.equal(rejected.success, false);
    const selected = waitForEvent<{ gameId: string; settings: Record<string, unknown> }>(guest, "game-selected");
    await emitAck(guest, "join-room", { roomCode, playerName: "Guest", avatar: dogAvatar });
    assert.deepEqual(await selected, { gameId: fixtureGameId, settings: {} });
    assert.equal((await emitAck(host, "start-game", { roomCode })).success, true);
  } finally { host.disconnect(); guest.disconnect(); await stopServer(server); }
});


test("room scores reuse the same name after leaving and rejoining", async () => {
  const { server, url } = await startServer();
  const host = await connect(url), guest = await connect(url);
  try {
    const { roomCode } = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
    await emitAck(guest, "join-room", { roomCode, playerName: "Guest", avatar: dogAvatar });
    await emitAck(host, "select-game", { roomCode, gameId: fixtureGameId });
    await emitAck(host, "start-game", { roomCode });
    await emitGameAction(guest, roomCode!, "advance");
    await emitGameAction(guest, roomCode!, "finish");
    assert.equal((await emitAck(host, "kick-player", { roomCode, playerId: guest.id })).success, true);
    assert.equal((await emitAck(guest, "join-room", { roomCode, playerName: "gUeSt", avatar: catAvatar })).success, true);
    const board = waitForEvent<Scoreboard>(host, "room-scoreboard");
    assert.equal((await emitAck(host, "start-game", { roomCode })).success, true);
    const rows = (await board).rows;
    assert.equal(rows.length, 2);
    const row = rows.find(row => row.name === "gUeSt")!;
    assert.ok(row);
    assert.equal(row.values.actions, 1);
    assert.equal(row.values.wins, 1);
    assert.equal(row.avatar, catAvatar);
  } finally { host.disconnect(); guest.disconnect(); await stopServer(server); }
});

test("chat history is confined to viewers of the current match", async () => {
  const { server, url } = await startServer();
  const host = await connect(url), guest = await connect(url), visitor = await connect(url);
  try {
    const { roomCode } = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
    const joined = await emitAck(guest, "join-room", { roomCode, playerName: "Guest", avatar: dogAvatar });
    await emitAck(host, "select-game", { roomCode, gameId: fixtureGameId });
    await emitAck(host, "start-game", { roomCode });
    assert.equal((await emitAck(host, "game-chat-send", { roomCode, message: "Match one" })).success, true);
    assert.equal((await emitAck(guest, "leave-game", { roomCode })).success, true);
    const waiting = waitForEvent<{ chatHistory: unknown[] }>(guest, "room-resumed");
    await emitAck(guest, "resume-room", { resumeToken: joined.resumeToken });
    assert.deepEqual((await waiting).chatHistory, []);
    const spectating = waitForEvent<{ chatHistory: Ack["chatHistory"] }>(guest, "game-started");
    await emitAck(guest, "spectate-game", { roomCode });
    assert.equal((await spectating).chatHistory?.[0]?.message, "Match one");
    await emitGameAction(host, roomCode!, "finish");
    const lobby = await emitAck(visitor, "join-room", { roomCode, playerName: "Visitor", avatar: catAvatar });
    assert.deepEqual(lobby.chatHistory, []);
    const next = waitForEvent<{ chatHistory: unknown[] }>(host, "game-started");
    assert.equal((await emitAck(host, "start-game", { roomCode })).success, true);
    assert.deepEqual((await next).chatHistory, []);
  } finally { host.disconnect(); guest.disconnect(); visitor.disconnect(); await stopServer(server); }
});

test("pending join requests are capped per address and release capacity on cancellation", async () => {
  const { server, url } = await startServer({ GAMEHUB_TRUST_CLOUDFLARE_IP: "true" });
  const host = await connect(url);
  const clients: Socket[] = [];
  try {
    const { roomCode } = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
    await emitAck(host, "set-room-approval", { enabled: true });
    for (let index = 0; index < 4; index++) {
      clients.push(await connectWithHeaders(url, { "cf-connecting-ip": index === 3 ? "192.0.2.2" : "192.0.2.1" }));
    }
    const request = (index: number) => emitAck(clients[index]!, "join-room", { roomCode, playerName: `Visitor ${index}`, avatar: catAvatar });
    assert.equal((await request(0)).pendingApproval, true);
    assert.equal((await request(1)).pendingApproval, true);
    const limited = await request(2);
    assert.equal(limited.success, false);
    assert.match(limited.message!, /address/i);
    assert.equal((await request(3)).pendingApproval, true);
    assert.equal((await emitAck(clients[0]!, "cancel-join-request", {})).success, true);
    assert.equal((await request(2)).pendingApproval, true);
  } finally { host.disconnect(); clients.forEach(client => client.disconnect()); await stopServer(server); }
});


test("installed Egyptian War starts with eight players and refuses nine", async () => {
  const { server, url } = await startServer({ GAMEHUB_GAME_PACKAGES: "@masonf539/egyptian-war" });
  const clients: Socket[] = [];
  try {
    const host = await connect(url);
    clients.push(host);
    const { roomCode } = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
    for (let index = 1; index < 9; index++) {
      const player = await connect(url);
      clients.push(player);
      assert.equal((await emitAck(player, "join-room", { roomCode, playerName: `Player ${index}`, avatar: dogAvatar })).success, true);
    }
    assert.equal((await emitAck(host, "select-game", { roomCode, gameId: "egyptian-war" })).success, true);
    const tooMany = await emitAck(host, "start-game", { roomCode });
    assert.equal(tooMany.success, false);
    assert.match(tooMany.message!, /at most 8 players/);
    assert.equal((await emitAck(host, "kick-player", { roomCode, playerId: clients[8]!.id })).success, true);
    const state = waitForEvent<{ gameId: string; state: { players: Array<{ cardCount: number }> } }>(host, "game-state",
      envelope => envelope.gameId === "egyptian-war" && envelope.state.players.length === 8);
    assert.equal((await emitAck(host, "start-game", { roomCode })).success, true);
    assert.equal((await state).state.players.reduce((total, player) => total + player.cardCount, 0), 54);
  } finally { clients.forEach(client => client.disconnect()); await stopServer(server); }
});


test("saved-player eligibility requires valid tokens and rejoining bypasses admission approval", async () => {
  const { server, url } = await startServer();
  const host = await connect(url), guest = await connect(url), visitor = await connect(url);
  try {
    const { roomCode } = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
    const joined = await emitAck(guest, "join-room", { roomCode, playerName: "Guest", avatar: dogAvatar });
    const initial = await emitAck(visitor, "check-resume-sessions", { tokens: [joined.resumeToken, "unknown"] });
    assert.equal(initial.sessions?.length, 1);
    assert.equal(initial.sessions[0]!.playerName, "Guest");
    assert.equal(initial.sessions[0]!.isConnected, true);
    assert.ok(initial.sessions[0]!.expiresAt > Date.now() + 23 * 60 * 60 * 1000);
    assert.equal((await emitAck(visitor, "release-saved-player", { resumeToken: joined.resumeToken })).success, false);
    assert.equal((await emitAck(visitor, "resume-room", { resumeToken: joined.resumeToken, onlyDisconnected: true })).success, false);
    const offline = waitForEvent<Array<{ name: string; isConnected: boolean }>>(host, "player-list", list => list.some(p => p.name === "Guest" && !p.isConnected));
    guest.disconnect(); await offline;
    await emitAck(host, "set-room-approval", { enabled: true });
    const checked = await emitAck(visitor, "check-resume-sessions", { tokens: [joined.resumeToken] });
    assert.equal(checked.sessions?.[0]?.isConnected, false);
    const restored = waitForEvent<{ roomCode: string }>(visitor, "room-resumed");
    assert.equal((await emitAck(visitor, "resume-room", { resumeToken: joined.resumeToken, onlyDisconnected: true })).success, true);
    assert.equal((await restored).roomCode, roomCode);
    assert.deepEqual((await emitAck(host, "check-resume-sessions", { tokens: [joined.resumeToken] })).sessions, []);
  } finally { host.disconnect(); guest.disconnect(); visitor.disconnect(); await stopServer(server); }
});

test("releasing a saved player frees their name and new admission still needs approval", async () => {
  const { server, url } = await startServer();
  const host = await connect(url), guest = await connect(url), visitor = await connect(url);
  try {
    const { roomCode } = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
    const joined = await emitAck(guest, "join-room", { roomCode, playerName: "Guest", avatar: dogAvatar });
    const offline = waitForEvent<Array<{ name: string; isConnected: boolean }>>(host, "player-list", list => list.some(p => p.name === "Guest" && !p.isConnected));
    guest.disconnect(); await offline;
    await emitAck(host, "set-room-approval", { enabled: true });
    assert.equal((await emitAck(visitor, "release-saved-player", { resumeToken: "unknown" })).success, false);
    assert.equal((await emitAck(visitor, "release-saved-player", { resumeToken: joined.resumeToken })).success, true);
    assert.equal((await emitAck(visitor, "resume-room", { resumeToken: joined.resumeToken })).success, false);
    assert.equal((await emitAck(visitor, "join-room", { roomCode, playerName: "Guest", avatar: dogAvatar })).pendingApproval, true);
    const admitted = waitForEvent<Ack>(visitor, "join-request-result");
    assert.equal((await emitAck(host, "review-join-request", { memberId: visitor.id, accept: true })).success, true);
    assert.equal((await admitted).success, true);
  } finally { host.disconnect(); guest.disconnect(); visitor.disconnect(); await stopServer(server); }
});

test("releasing a saved host transfers ownership or explicitly closes an abandoned room", async () => {
  for (const withSuccessor of [true, false]) {
    const { server, url } = await startServer();
    const host = await connect(url), guest = await connect(url), visitor = await connect(url);
    try {
      const created = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
      if (withSuccessor) await emitAck(guest, "join-room", { roomCode: created.roomCode, playerName: "Guest", avatar: dogAvatar });
      const expiredHost = host.id!;
      host.disconnect();
      // Requests are ordered on the server after the disconnect has been observed.
      let status: Ack;
      status = await emitAck(visitor, "check-resume-sessions", { tokens: [created.resumeToken] });
      for (let attempt = 0; attempt < 10 && status.sessions?.[0]?.isConnected; attempt++) {
        status = await emitAck(visitor, "check-resume-sessions", { tokens: [created.resumeToken] });
      }
      assert.equal(status.sessions?.[0]?.isConnected, false);
      assert.equal(status.sessions?.[0]?.releaseClosesRoom, !withSuccessor);
      const transfer = withSuccessor ? waitForEvent<{ hostId: string }>(guest, "room-host", room => room.hostId === guest.id) : null;
      const released = await emitAck(visitor, "release-saved-player", { resumeToken: created.resumeToken });
      assert.equal(released.success, true);
      assert.equal(released.roomClosed, !withSuccessor);
      if (transfer) { assert.notEqual((await transfer).hostId, expiredHost); }
      else assert.equal((await emitAck(visitor, "join-room", { roomCode: created.roomCode, playerName: "Visitor", avatar: catAvatar })).success, false);
    } finally { host.disconnect(); guest.disconnect(); visitor.disconnect(); await stopServer(server); }
  }
});

test("releasing an offline Egyptian War player removes the ghost and keeps the match running", async () => {
  const { server, url } = await startServer({ GAMEHUB_GAME_PACKAGES: "@masonf539/egyptian-war" });
  const host = await connect(url), guest = await connect(url), third = await connect(url), visitor = await connect(url);
  try {
    const { roomCode } = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
    const joined = await emitAck(guest, "join-room", { roomCode, playerName: "Guest", avatar: dogAvatar });
    await emitAck(third, "join-room", { roomCode, playerName: "Third", avatar: catAvatar });
    await emitAck(host, "select-game", { roomCode, gameId: "egyptian-war" });
    await emitAck(host, "start-game", { roomCode });
    const paused = waitForEvent<{ state: { isPaused: boolean } }>(host, "game-state", envelope => envelope.state.isPaused);
    guest.disconnect(); await paused;
    const removed = waitForEvent<{ state: { players: Array<{ name: string; cardCount: number }>; isPaused: boolean } }>(host, "game-state", envelope => envelope.state.players.length === 2);
    assert.equal((await emitAck(visitor, "release-saved-player", { resumeToken: joined.resumeToken })).success, true);
    const state = (await removed).state;
    assert.ok(state.players.every(player => player.name !== "Guest"));
    assert.equal(state.isPaused, false);
    assert.equal(state.players.reduce((total, player) => total + player.cardCount, 0), 36);
    assert.equal((await emitAck(visitor, "resume-room", { resumeToken: joined.resumeToken })).success, false);
  } finally { host.disconnect(); guest.disconnect(); third.disconnect(); visitor.disconnect(); await stopServer(server); }
});


test("unknown and revoked reconnect tokens are marked unavailable without misclassifying live players", async () => {
  const { server, url } = await startServer();
  const host = await connect(url);
  const guest = await connect(url);
  const visitor = await connect(url);
  try {
    const unknown = await emitAck(visitor, "resume-room", { resumeToken: "missing-token" });
    assert.equal(unknown.success, false);
    assert.equal(unknown.sessionUnavailable, true);
    const created = await emitAck(host, "create-room", { playerName: "Host", avatar: catAvatar });
    const joined = await emitAck(guest, "join-room", { roomCode: created.roomCode, playerName: "Guest", avatar: dogAvatar });
    assert.equal(created.success, true);
    assert.equal(joined.success, true);
    const connected = await emitAck(visitor, "resume-room", { resumeToken: joined.resumeToken, onlyDisconnected: true });
    assert.equal(connected.success, false);
    assert.notEqual(connected.sessionUnavailable, true);
    await emitAck(guest, "leave-lobby", {});
    const revoked = await emitAck(visitor, "resume-room", { resumeToken: joined.resumeToken });
    assert.equal(revoked.success, false);
    assert.equal(revoked.sessionUnavailable, true);
  } finally { host.disconnect(); guest.disconnect(); visitor.disconnect(); await stopServer(server); }
});
