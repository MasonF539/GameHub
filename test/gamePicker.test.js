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
    intervals.forEach((interval) => clearInterval(interval));
    dom.window.close();
  };

  return {
    close,
    emitted,
    handlers,
    playedEffects,
    audioScenes,
    getModalHideCount: () => modalHideCount
  };
}

function game(overrides = {}) {
  return {
    id: "egyptian-war",
    name: "Egyptian War",
    description: "Race to slap special card combinations.",
    isPlayable: true,
    chatEnabled: true,
    rules: [],
    minPlayers: 2,
    maxPlayers: 6,
    settings: [],
    preview: {
      videoPath: "/games/egyptian-war/assets/game-previews/preview.mp4",
      posterPath: "/games/egyptian-war/assets/game-previews/poster.webp"
    },
    ...overrides
  };
}

test("renders available games as preview cards for every player", () => {
  const { close, handlers } = createClient();

  handlers.get("available-games")([game()]);

  const pickerButton = document.querySelector("#open-game-picker");
  const card = document.querySelector('[data-game-id="egyptian-war"]');
  assert.equal(pickerButton.disabled, false);
  assert.match(card.textContent, /Egyptian War/);
  assert.match(card.textContent, /2–6 players/);
  const preview = card.querySelector(".game-picker-preview-video");
  assert.ok(preview);
  assert.match(
    preview.src,
    /\/games\/egyptian-war\/assets\/game-previews\/preview\.mp4$/
  );
  assert.match(
    preview.poster,
    /\/games\/egyptian-war\/assets\/game-previews\/poster\.webp$/
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

test("routes browser game state, events, and actions through generic envelopes", () => {
  const { close, emitted, handlers } = createClient();

  assert.equal(handlers.has("game-state"), true);
  assert.equal(handlers.has("game-event"), true);
  assert.equal(handlers.has("egyptian-war-state"), false);
  assert.equal(handlers.has("egyptian-war-animation"), false);

  handlers.get("room-resumed")({
    roomCode: "ABC123",
    isHost: true,
    isLocked: false,
    selectedGameId: "egyptian-war",
    gameSettings: {},
    activeGameId: "egyptian-war",
    isPaused: false,
    chatEnabled: true
  });

  handlers.get("game-event")({
    gameId: "egyptian-war",
    event: {
      type: "pause-changed",
      payload: { isPaused: true }
    }
  });
  assert.equal(
    document.querySelector("#egyptian-war-pause").textContent,
    "Resume"
  );

  const playCard = document.querySelector("#egyptian-war-play-card");
  playCard.disabled = false;
  playCard.click();
  const action = emitted.find((item) => item.event === "game-action");
  assert.deepEqual(action.data, {
    roomCode: "ABC123",
    gameId: "egyptian-war",
    action: { type: "play-card" }
  });

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
    selectedGameId: "egyptian-war",
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
    selectedGameId: "egyptian-war",
    gameSettings: {},
    activeGameId: null,
    isPaused: false,
    chatEnabled: true
  });
  handlers.get("game-selected")({ gameId: "egyptian-war", settings: {} });

  assert.equal(
    document.querySelector('[data-game-id="egyptian-war"]')
      .classList.contains("is-selected"),
    true
  );
  assert.equal(
    document.querySelector("#selected-game-name").textContent,
    "Egyptian War"
  );

  document.querySelector('[data-game-id="second-game"]').click();
  const selection = emitted.find((item) => item.event === "select-game");
  selection.respond({ success: true });
  assert.equal(getModalHideCount(), 1);
  close();
});
