const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { GameClientHost } = require("../public/gameHost.js");

function createClient({ prefersReducedMotion = false } = {}) {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "public", "index.html"),
    "utf8"
  );
  const dom = new JSDOM(html, { url: "http://localhost" });
  const handlers = new Map();
  const emitted = [];
  const playedEffects = [];
  const audioScenes = [];
  const gameClientStates = [];
  const gameClientEvents = [];
  const gameClientContexts = [];
  let modalHideCount = 0;

  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  global.CSS = dom.window.CSS ?? { escape: (value) => String(value) };
  if (!global.CSS.escape) {
    global.CSS.escape = (value) => String(value);
  }
  window.matchMedia = () => ({ matches: prefersReducedMotion });
  window.GameHubAudio = {
    playEffect(effectName) {
      playedEffects.push(effectName);
    },
    setScene(sceneName) {
      audioScenes.push(sceneName);
    }
  };
  window.GameHubGameClientHost = GameClientHost;
  window.GameHubRegisterGameClientModule =
    global.GameHubRegisterGameClientModule;
  global.bootstrap = {
    Toast: { getOrCreateInstance: () => ({ show() {} }) },
    Modal: {
      getInstance: () => null,
      getOrCreateInstance: () => ({
        hide() {
          modalHideCount += 1;
        },
        show() {}
      })
    }
  };
  global.io = () => ({
    on(event, handler) {
      handlers.set(event, handler);
    },
    emit(event, data, respond) {
      emitted.push({ event, data, respond });
    }
  });

  global.GameHubRegisterGameClientModule("example-game", {
    mount(context) {
      gameClientContexts.push(context);
      return {
        receiveState(state) {
          gameClientStates.push(state);
        },
        receiveEvent(event) {
          gameClientEvents.push(event);
        },
        destroy() {}
      };
    }
  });

  const intervals = [];
  const originalSetInterval = global.setInterval;
  global.setInterval = (...arguments_) => {
    const interval = originalSetInterval(...arguments_);
    intervals.push(interval);
    return interval;
  };

  const modulePath = require.resolve("../public/client.js");
  delete require.cache[modulePath];
  require(modulePath);
  global.setInterval = originalSetInterval;

  const close = () => {
    handlers.get("game-ended")?.({ message: "Test cleanup" });
    intervals.forEach((interval) => clearInterval(interval));
    dom.window.close();
  };

  return {
    close,
    emitted,
    handlers,
    playedEffects,
    audioScenes,
    gameClientStates,
    gameClientEvents,
    gameClientContexts,
    getModalHideCount: () => modalHideCount
  };
}

function game(overrides = {}) {
  return {
    id: "example-game",
    name: "Example Game",
    description: "A game used to test the generic picker.",
    isPlayable: true,
    chatEnabled: true,
    rules: [],
    minPlayers: 2,
    maxPlayers: 6,
    settings: [],
    preview: {
      videoPath: "/games/example-game/preview.mp4",
      posterPath: "/games/example-game/poster.webp"
    },
    ...overrides
  };
}

test("renders available games as preview cards for every player", () => {
  const { close, handlers } = createClient();

  handlers.get("available-games")([game()]);

  const pickerButton = document.querySelector("#open-game-picker");
  const card = document.querySelector('[data-game-id="example-game"]');
  assert.equal(pickerButton.disabled, false);
  assert.match(card.textContent, /Example Game/);
  assert.match(card.textContent, /2\u20136 players/);
  const preview = card.querySelector(".game-picker-preview-video");
  assert.ok(preview);
  assert.match(
    preview.src,
    /\/games\/example-game\/preview\.mp4$/
  );
  assert.match(
    preview.poster,
    /\/games\/example-game\/poster\.webp$/
  );
  assert.equal(preview.autoplay, true);
  assert.equal(preview.loop, true);
  assert.equal(preview.muted, true);
  assert.equal(preview.playsInline, true);
  assert.equal(card.getAttribute("aria-disabled"), "true");
  close();
});

test("uses the static picker poster when reduced motion is preferred", () => {
  const { close, handlers } = createClient({ prefersReducedMotion: true });

  handlers.get("available-games")([game()]);

  const preview = document.querySelector(".game-picker-preview-video");
  assert.ok(preview);
  assert.equal(preview.autoplay, false);
  assert.equal(preview.loop, false);
  assert.equal(preview.preload, "none");
  close();
});

test("sounds only subsequent player joins, not spectators", () => {
  const { close, handlers, playedEffects } = createClient();
  const host = {
    id: "host",
    name: "Host",
    avatar: "🐱",
    isHost: true,
    isConnected: true
  };

  handlers.get("player-list")([host]);
  assert.deepEqual(playedEffects, []);

  handlers.get("spectator-list")([{
    id: "spectator",
    name: "Viewer",
    avatar: "👻",
    isConnected: true
  }]);
  assert.deepEqual(playedEffects, []);

  handlers.get("player-list")([
    host,
    {
      id: "guest",
      name: "Guest",
      avatar: "🐶",
      isHost: false,
      isConnected: true
    }
  ]);
  assert.deepEqual(playedEffects, ["player-join"]);
  close();
});

test("routes browser game state, events, and actions through generic envelopes", async () => {
  const {
    close,
    emitted,
    handlers,
    gameClientStates,
    gameClientEvents,
    gameClientContexts
  } = createClient();

  assert.equal(handlers.has("game-state"), true);
  assert.equal(handlers.has("game-event"), true);

  handlers.get("room-resumed")({
    roomCode: "ABC123",
    isHost: true,
    isLocked: false,
    selectedGameId: "example-game",
    gameSettings: {},
    activeGameId: "example-game",
    isPaused: false,
    chatEnabled: true
  });

  handlers.get("game-event")({
    gameId: "example-game",
    event: {
      type: "pause-changed",
      payload: { isPaused: true }
    }
  });
  handlers.get("game-state")({
    gameId: "example-game",
    state: { turn: 2 }
  });
  assert.deepEqual(gameClientStates, [{ turn: 2 }]);
  assert.deepEqual(gameClientEvents, [{
    type: "pause-changed",
    payload: { isPaused: true }
  }]);

  assert.equal(gameClientContexts.length, 1);
  const actionPromise = gameClientContexts[0].submitAction({ type: "advance" });
  const action = emitted.find((item) => item.event === "game-action");
  assert.deepEqual(action.data, {
    roomCode: "ABC123",
    gameId: "example-game",
    action: { type: "advance" }
  });
  action.respond({ success: true });
  assert.deepEqual(await actionPromise, { success: true });

  close();
});

test("only the host can request a game from the picker", () => {
  const { close, emitted, handlers } = createClient();
  const games = [
    game(),
    game({ id: "second-game", name: "Second Game" })
  ];

  handlers.get("available-games")(games);
  document.querySelector('[data-game-id="second-game"]').click();
  assert.equal(
    emitted.some((item) => item.event === "select-game"),
    false
  );

  handlers.get("room-resumed")({
    roomCode: "ABC123",
    isHost: true,
    isLocked: false,
    selectedGameId: "example-game",
    gameSettings: {},
    activeGameId: null,
    isPaused: false,
    chatEnabled: true
  });

  document.querySelector('[data-game-id="second-game"]').click();

  const selection = emitted.find((item) => item.event === "select-game");
  assert.deepEqual(selection.data, {
    roomCode: "ABC123",
    gameId: "second-game"
  });
  selection.respond({ success: true });
  close();
});

test("highlights the server-confirmed selection and closes after acknowledgement", () => {
  const { close, getModalHideCount, handlers, emitted } = createClient();
  const games = [
    game(),
    game({ id: "second-game", name: "Second Game" })
  ];

  handlers.get("available-games")(games);
  handlers.get("room-resumed")({
    roomCode: "ABC123",
    isHost: true,
    isLocked: false,
    selectedGameId: "example-game",
    gameSettings: {},
    activeGameId: null,
    isPaused: false,
    chatEnabled: true
  });
  handlers.get("game-selected")({ gameId: "example-game", settings: {} });

  assert.equal(
    document.querySelector('[data-game-id="example-game"]')
      .classList.contains("is-selected"),
    true
  );
  assert.equal(
    document.querySelector("#selected-game-name").textContent,
    "Example Game"
  );

  document.querySelector('[data-game-id="second-game"]').click();
  const selection = emitted.find((item) => item.event === "select-game");
  selection.respond({ success: true });
  assert.equal(getModalHideCount(), 1);
  close();
});

test("a guest who confirms Leave Game returns to the lobby", () => {
  const { close, emitted, handlers, getModalHideCount } = createClient();

  handlers.get("room-resumed")({
    roomCode: "ABC123",
    isHost: false,
    role: "player",
    isLocked: false,
    selectedGameId: "example-game",
    gameSettings: {},
    activeGameId: "example-game",
    isPaused: false,
    chatEnabled: true
  });
  assert.equal(document.querySelector("#gameplay-view").classList.contains("d-none"), false);
  assert.equal(document.querySelector("#lobby-view").classList.contains("d-none"), true);

  document.querySelector("#confirm-leave-game").click();
  const leaveRequest = emitted.find((item) => item.event === "leave-game");
  assert.ok(leaveRequest, "the confirmation should emit leave-game");
  assert.deepEqual(leaveRequest.data, { roomCode: "ABC123" });

  leaveRequest.respond({ success: true });

  assert.equal(getModalHideCount(), 1);
  assert.equal(document.querySelector("#gameplay-view").classList.contains("d-none"), true);
  assert.equal(document.querySelector("#lobby-view").classList.contains("d-none"), false);
  assert.equal(document.querySelector("#entry-view").classList.contains("d-none"), true);
  assert.match(document.querySelector("#game-status").textContent, /left the game and returned to the lobby/i);
  close();
});

test("a guest who leaves the lobby returns to entry and clears the saved room session", () => {
  const { close, emitted, handlers } = createClient();

  handlers.get("room-resumed")({
    roomCode: "ABC123",
    isHost: false,
    role: "player",
    isLocked: false,
    selectedGameId: "example-game",
    gameSettings: {},
    activeGameId: null,
    isPaused: false,
    chatEnabled: true
  });
  handlers.get("room-resume-token")("resume-token");
  assert.equal(document.querySelector("#lobby-view").classList.contains("d-none"), false);
  assert.equal(localStorage.getItem("gamehub:last-room"), "ABC123");

  document.querySelector("#leave-lobby").click();
  const leaveRequest = emitted.find((item) => item.event === "leave-lobby");
  assert.ok(leaveRequest, "the button should emit leave-lobby");
  assert.deepEqual(leaveRequest.data, { roomCode: "ABC123" });

  leaveRequest.respond({ success: true });

  assert.equal(document.querySelector("#entry-view").classList.contains("d-none"), false);
  assert.equal(document.querySelector("#lobby-view").classList.contains("d-none"), true);
  assert.equal(document.querySelector("#gameplay-view").classList.contains("d-none"), true);
  assert.equal(localStorage.getItem("gamehub:last-room"), null);
  assert.equal(localStorage.getItem("gamehub:resume:ABC123"), null);
  close();
});
