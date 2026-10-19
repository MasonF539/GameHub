const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { GameClientHost } = require("../public/gameHost.js");

function createClient({ prefersReducedMotion = false, mobile = false, fullscreenRequest, savedRoom, url = "http://localhost" } = {}) {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "public", "index.html"),
    "utf8"
  );
  const dom = new JSDOM(html, { url });
  const handlers = new Map();
  const emitted = [];
  const playedEffects = [];
  const audioScenes = [];
  const gameClientStates = [];
  const gameClientEvents = [];
  const gameClientPlatformEvents = [];
  const gameClientContexts = [];
  let modalHideCount = 0;
  let modalShowCount = 0;
  let toastShowCount = 0;

  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  if (savedRoom) {
    localStorage.setItem("gamehub:last-room", savedRoom);
    localStorage.setItem(`gamehub:resume:${savedRoom}`, "saved-token");
  }
  global.CSS = dom.window.CSS ?? { escape: (value) => String(value) };
  if (!global.CSS.escape) {
    global.CSS.escape = (value) => String(value);
  }
  window.matchMedia = (query) => ({ matches: query.includes("prefers-reduced-motion") ? prefersReducedMotion : mobile });
  if (fullscreenRequest) document.documentElement.requestFullscreen = fullscreenRequest;
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
    Toast: { getOrCreateInstance: () => ({ show() { toastShowCount += 1; } }) },
    Modal: {
      getInstance: () => null,
      getOrCreateInstance: () => ({
        hide() {
          modalHideCount += 1;
        },
        show() {
          modalShowCount += 1;
        }
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
        receivePlatformEvent(event) {
          gameClientPlatformEvents.push(event);
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
    gameClientPlatformEvents,
    gameClientContexts,
    getModalHideCount: () => modalHideCount,
    getModalShowCount: () => modalShowCount,
    getToastShowCount: () => toastShowCount
  };
}

test("mobile room actions stay windowed until fullscreen is explicitly selected", async () => {
  let requests = 0;
  const view = createClient({ mobile: true, fullscreenRequest() {
    requests += 1;
    assert.equal(this, document.documentElement);
    return Promise.resolve();
  } });
  try {
    assert.equal(requests, 0);
    document.querySelector("#create-room").click();
    assert.equal(requests, 0);
    view.emitted.find((event) => event.event === "create-room").respond({ success: false });
    document.querySelector("#join-room").click();
    assert.equal(requests, 0);
    document.querySelector("#app-game-fullscreen-toggle").click();
    assert.equal(requests, 1);
    await Promise.resolve();
  } finally { view.close(); }
});

test("manual fullscreen denial reports the error without interrupting room actions", async () => {
  for (const fail of [() => Promise.reject(new Error("Denied")), () => { throw new Error("Unsupported"); }]) {
    const view = createClient({ mobile: true, fullscreenRequest: fail });
    try {
      document.querySelector("#app-game-fullscreen-toggle").click();
      document.querySelector("#join-room").click();
      assert.equal(view.emitted.some((event) => event.event === "join-room"), true);
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(view.getToastShowCount(), 1);
    } finally { view.close(); }
  }
});

test("desktop and mobile enter fullscreen only through the Settings control", () => {
  for (const mobile of [false, true]) {
    let requests = 0;
    const view = createClient({ mobile, fullscreenRequest() { requests += 1; return Promise.resolve(); } });
    try {
      if (mobile) document.querySelector("#app-game-fullscreen-toggle").click();
      document.querySelector("#create-room").click();
      assert.equal(requests, mobile ? 1 : 0);
    } finally { view.close(); }
  }
});

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

test("invite links prefill joining and pending approval can be cancelled", () => {
  const view = createClient({ url: "http://localhost/?room=abc123" });
  try {
    assert.equal(document.querySelector("#room-code").value, "ABC123");
    document.querySelector("#join-room").click();
    const join = view.emitted.find((event) => event.event === "join-room");
    assert.equal(join.data.roomCode, "ABC123");
    join.respond({ success: true, pendingApproval: true });
    assert.equal(document.querySelector("#lobby-view").classList.contains("d-none"), true);
    assert.equal(document.querySelector("#join-room").textContent, "Cancel Request");
    document.querySelector("#join-room").click();
    view.emitted.find((event) => event.event === "cancel-join-request").respond({ success: true });
    assert.equal(document.querySelector("#join-room").disabled, false);
    assert.equal(document.querySelector("#join-room").textContent, "Join Room");
  } finally { view.close(); }
});

test("hosts and guests can copy a hidden room code and the link separately", async () => {
  for (const isHost of [true, false]) {
    const view = createClient();
    try {
      const copied = [];
      Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async (text) => copied.push(text) } });
      view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost, isLocked: false,
        selectedGameId: null, gameSettings: {}, activeGameId: null, isPaused: false, chatEnabled: false });
      const display = document.querySelector("#created-room");
      assert.equal(display.textContent.includes("ABC123"), false);
      assert.equal(document.querySelector("#copy-room-code").previousElementSibling.id, "toggle-room-code");
      document.querySelector("#copy-room-code").click();
      await Promise.resolve();
      assert.equal(copied[0], "ABC123");
      assert.equal(display.textContent.includes("ABC123"), false);
      document.querySelector("#copy-invite-link").click();
      await Promise.resolve();
      assert.equal(copied[1], "http://localhost/?room=ABC123");
      document.querySelector("#toggle-room-code").click();
      assert.equal(display.textContent.includes("ABC123"), true);
      assert.equal(document.querySelector("#room-copy-menu"), null);
      assert.equal(document.querySelector("#copy-game-invite-link"), null);
      assert.equal(document.querySelector("#copy-game-room-code"), null);
    } finally { view.close(); }
  }
});

test("Copy link prefers the server's tunnel URL while the page stays on localhost", async () => {
  const view = createClient();
  try {
    const copied = [];
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async (text) => copied.push(text) } });
    view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: true, isLocked: false,
      selectedGameId: null, gameSettings: {}, activeGameId: null, isPaused: false, chatEnabled: false });
    view.handlers.get("public-invite-url")("https://example.trycloudflare.com/");
    const before = view.emitted.length;
    document.querySelector("#copy-invite-link").click();
    document.querySelector("#copy-invite-link").click();
    assert.equal(view.emitted.length, before);
    await Promise.resolve();
    assert.equal(copied[0], "https://example.trycloudflare.com/?room=ABC123");
    assert.equal(window.location.hostname, "localhost");
  } finally { view.close(); }
});

test("personal display dropdowns update the mounted game, previews, and saved preferences", () => {
  const view = createClient();
  try {
    view.handlers.get("available-games")([game({ displayOptions: [{
      key: "tableColor", label: "Table", defaultValue: "green", choices: [
        { value: "green", label: "Green", previewPath: "/games/example-game/green.svg" },
        { value: "blue", label: "Blue", previewPath: "/games/example-game/blue.svg" }
      ]
    }] })]);
    view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: true, isLocked: false,
      selectedGameId: "example-game", gameSettings: {}, activeGameId: "example-game", isPaused: false, chatEnabled: true });
    const display = view.gameClientContexts[0].display;
    let changes = 0;
    const stop = display.onChange(() => changes++);
    assert.equal(display.get("tableColor"), "green");
    const select = document.querySelector("#display-example-game-tableColor");
    select.value = "blue";
    select.dispatchEvent(new window.Event("change"));
    assert.equal(display.get("tableColor"), "blue");
    assert.equal(changes, 1);
    assert.match(document.querySelector(".game-display-preview").src, /blue.svg$/);
    assert.equal(JSON.parse(localStorage.getItem("gamehub:display-options"))["example-game"].tableColor, "blue");
    stop();
    select.value = "green";
    select.dispatchEvent(new window.Event("change"));
    assert.equal(changes, 1);
    assert.equal(display.get("missing"), null);
  } finally { view.close(); }
});

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

test("renders collapsible package keybinds and routes a rebound action", () => {
  const {
    close,
    handlers,
    gameClientContexts,
    getModalShowCount
  } = createClient();
  const configurableGame = game({
    keybinds: [
      {
        id: "primary-action",
        label: "Primary action",
        description: "Perform the example action.",
        defaultKey: "Space"
      },
      {
        id: "secondary-action",
        label: "Secondary action",
        defaultKey: "KeyQ"
      }
    ]
  });

  handlers.get("available-games")([configurableGame]);
  const sections = document.querySelectorAll(".game-keybind-section");
  assert.equal(sections.length, 2);
  assert.match(sections[0].textContent, /General/);
  assert.match(sections[1].textContent, /Example Game/);
  assert.equal(sections[0].querySelector(".game-keybind-section-body").hidden, false);
  assert.equal(sections[1].querySelector(".game-keybind-section-body").hidden, true);

  document.dispatchEvent(new window.KeyboardEvent("keydown", {
    code: "Escape",
    bubbles: true
  }));
  assert.equal(getModalShowCount(), 1);

  sections[1].querySelector(".game-keybind-section-toggle").click();
  assert.equal(sections[1].querySelector(".game-keybind-section-body").hidden, false);
  const bindingButton = sections[1].querySelector(".game-keybind-button");
  assert.equal(bindingButton.textContent, "Space");
  bindingButton.click();
  document.dispatchEvent(new window.KeyboardEvent("keydown", {
    code: "KeyE",
    bubbles: true
  }));
  assert.equal(
    JSON.parse(localStorage.getItem("gamehub:keybinds"))["example-game"]["primary-action"],
    "KeyE"
  );
  assert.equal(document.querySelectorAll(".game-keybind-control.has-conflict").length, 0);
  assert.deepEqual(
    [...document.querySelectorAll(".game-keybind-section-body")]
      .map((body) => body.hidden),
    [false, false]
  );

  document.querySelector("#app-settings-modal").dispatchEvent(
    new window.Event("hidden.bs.modal")
  );
  assert.deepEqual(
    [...document.querySelectorAll(".game-keybind-section-body")]
      .map((body) => body.hidden),
    [false, true]
  );

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
  let actionCount = 0;
  gameClientContexts[0].input.onAction("primary-action", () => {
    actionCount += 1;
  });
  document.dispatchEvent(new window.KeyboardEvent("keydown", {
    code: "KeyE",
    bubbles: true
  }));
  assert.equal(actionCount, 1);
  close();
});

test("marks both invalid keybinds while allowing overlap across games", () => {
  const { close, handlers } = createClient();
  handlers.get("available-games")([
    game({
      keybinds: [
        { id: "opens-settings-too", label: "Conflict", defaultKey: "Escape" },
        { id: "shared-key", label: "Shared key", defaultKey: "KeyQ" }
      ]
    }),
    game({
      id: "second-game",
      name: "Second Game",
      keybinds: [
        { id: "shared-key", label: "Shared key", defaultKey: "KeyQ" }
      ]
    })
  ]);

  const conflicts = document.querySelectorAll(".game-keybind-control.has-conflict");
  assert.equal(conflicts.length, 2);
  assert.match(conflicts[0].closest(".game-keybind-section").textContent, /General/);
  assert.match(conflicts[1].closest(".game-keybind-section").textContent, /Example Game/);
  assert.equal(
    document.querySelectorAll(".game-keybind-warning:not([hidden])").length,
    2
  );
  assert.equal(
    [...document.querySelectorAll(".game-keybind-section")]
      .find((section) => /Second Game/.test(section.textContent))
      .querySelector(".has-conflict"),
    null
  );
  close();
});

test("marks both bindings after a same-game overlap is assigned", () => {
  const {
    close,
    handlers,
    gameClientContexts,
    getToastShowCount
  } = createClient();
  handlers.get("available-games")([game({
    keybinds: [
      { id: "first", label: "First", defaultKey: "KeyQ" },
      { id: "second", label: "Second", defaultKey: "KeyE" }
    ]
  })]);

  const gameSection = [...document.querySelectorAll(".game-keybind-section")]
    .find((section) => /Example Game/.test(section.textContent));
  gameSection.querySelector(".game-keybind-section-toggle").click();
  gameSection.querySelectorAll(".game-keybind-button")[1].click();
  document.dispatchEvent(new window.KeyboardEvent("keydown", {
    code: "KeyQ",
    bubbles: true
  }));

  assert.equal(document.querySelectorAll(".game-keybind-control.has-conflict").length, 2);
  assert.equal(
    document.querySelectorAll(".game-keybind-warning:not([hidden])").length,
    2
  );

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
  let actionCount = 0;
  gameClientContexts[0].input.onAction("first", () => {
    actionCount += 1;
  });
  gameClientContexts[0].input.onAction("second", () => {
    actionCount += 1;
  });
  const toastCountBeforeKeypress = getToastShowCount();
  document.dispatchEvent(new window.KeyboardEvent("keydown", {
    code: "KeyQ",
    bubbles: true
  }));
  document.dispatchEvent(new window.KeyboardEvent("keydown", {
    code: "KeyQ",
    bubbles: true
  }));
  assert.equal(actionCount, 0);
  assert.equal(getToastShowCount() - toastCountBeforeKeypress, 1);
  close();
});

test("allows Escape to be assigned and marks its General conflict", () => {
  const { close, handlers, getModalShowCount } = createClient();
  handlers.get("available-games")([game({
    keybinds: [
      { id: "cancel-action", label: "Cancel action", defaultKey: "KeyQ" }
    ]
  })]);

  const gameSection = [...document.querySelectorAll(".game-keybind-section")]
    .find((section) => /Example Game/.test(section.textContent));
  gameSection.querySelector(".game-keybind-section-toggle").click();
  gameSection.querySelector(".game-keybind-button").click();
  document.dispatchEvent(new window.KeyboardEvent("keydown", {
    code: "Escape",
    bubbles: true
  }));

  assert.equal(getModalShowCount(), 0);
  assert.equal(
    JSON.parse(localStorage.getItem("gamehub:keybinds"))["example-game"]["cancel-action"],
    "Escape"
  );
  assert.equal(document.querySelectorAll(".game-keybind-control.has-conflict").length, 2);
  assert.deepEqual(
    [...document.querySelectorAll(".game-keybind-button")]
      .filter((button) => button.textContent === "Esc")
      .map((button) => button.classList.contains("btn-outline-danger")),
    [true, true]
  );
  close();
});

test("rejects reserved captures, offers cancel, and lets Backspace clear", () => {
  const { close, handlers } = createClient();
  handlers.get("available-games")([game({
    keybinds: [
      { id: "primary-action", label: "Primary action", defaultKey: "Space" }
    ]
  })]);

  let gameSection = [...document.querySelectorAll(".game-keybind-section")]
    .find((section) => /Example Game/.test(section.textContent));
  gameSection.querySelector(".game-keybind-section-toggle").click();
  let bindingButton = gameSection.querySelector(".game-keybind-button");
  bindingButton.click();
  assert.equal(gameSection.querySelector(".game-keybind-cancel").textContent, "Cancel");

  for (const code of ["ShiftLeft", "Tab", "F5"]) {
    document.dispatchEvent(new window.KeyboardEvent("keydown", {
      code,
      bubbles: true
    }));
    assert.equal(bindingButton.classList.contains("is-listening"), true);
  }

  document.dispatchEvent(new window.KeyboardEvent("keydown", {
    code: "Backspace",
    bubbles: true
  }));
  assert.equal(
    JSON.parse(localStorage.getItem("gamehub:keybinds"))["example-game"]["primary-action"],
    null
  );
  gameSection = [...document.querySelectorAll(".game-keybind-section")]
    .find((section) => /Example Game/.test(section.textContent));
  bindingButton = gameSection.querySelector(".game-keybind-button");
  assert.equal(bindingButton.textContent, "Unbound");

  bindingButton.click();
  document.dispatchEvent(new window.KeyboardEvent("keydown", {
    code: "Backquote",
    bubbles: true
  }));
  assert.equal(
    [...document.querySelectorAll(".game-keybind-section")]
      .find((section) => /Example Game/.test(section.textContent))
      .querySelector(".game-keybind-button").textContent,
    "`"
  );
  close();
});

test("ignores modified gameplay shortcuts and rejects unknown action ids", () => {
  const { close, handlers, gameClientContexts } = createClient();
  handlers.get("available-games")([game({
    keybinds: [
      { id: "primary-action", label: "Primary action", defaultKey: "KeyR" }
    ]
  })]);
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

  let actionCount = 0;
  gameClientContexts[0].input.onAction("primary-action", () => {
    actionCount += 1;
  });
  assert.throws(
    () => gameClientContexts[0].input.onAction("typo-action", () => {}),
    /Unknown keybind action/
  );
  for (const modifier of ["ctrlKey", "altKey", "metaKey"]) {
    document.dispatchEvent(new window.KeyboardEvent("keydown", {
      code: "KeyR",
      [modifier]: true,
      bubbles: true
    }));
  }
  assert.equal(actionCount, 0);
  document.dispatchEvent(new window.KeyboardEvent("keydown", {
    code: "KeyR",
    bubbles: true
  }));
  assert.equal(actionCount, 1);
  close();
});

test("updates connection state when installed game markup has no ping elements", () => {
  const { close, handlers } = createClient();
  assert.equal(document.querySelector("#network-ping"), null);
  assert.doesNotThrow(() => handlers.get("latency-update")({ rttMs: 12 }));
  assert.doesNotThrow(() => handlers.get("disconnect")());
  const connectionStatus = document.querySelector("#connection-status");
  assert.equal(connectionStatus.textContent, "Disconnected from server");
  assert.equal(connectionStatus.classList.contains("text-bg-danger"), true);
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

test("uses a distinct completion alert without treating returning members as joins", () => {
  const { close, handlers, playedEffects } = createClient();
  const host = {
    id: "host",
    name: "Host",
    avatar: "host",
    isHost: true,
    isConnected: true
  };
  const returningPlayer = {
    id: "returning-player",
    name: "Returning Player",
    avatar: "player",
    isHost: false,
    isConnected: true
  };

  handlers.get("player-list")([host]);
  handlers.get("game-ended")({
    message: "The game ended.",
    returningMemberIds: [returningPlayer.id]
  });
  handlers.get("player-list")([host, returningPlayer]);

  assert.deepEqual(playedEffects, ["game-finished"]);
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
  const pauseButton = document.querySelector("#app-game-pause-toggle");
  assert.equal(pauseButton.disabled, false);
  pauseButton.click();
  const pauseRequest = emitted.find((item) => item.event === "toggle-game-pause");
  assert.deepEqual(pauseRequest.data, {
    roomCode: "ABC123",
    isPaused: true
  });
  pauseRequest.respond({ success: true });
  handlers.get("game-lifecycle")({
    gameId: "example-game",
    isPaused: true,
    isBusy: false
  });
  assert.equal(pauseButton.textContent, "Resume");

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
  assert.equal(
    document.querySelector(".app-utility-controls").parentElement,
    document.querySelector("#gameplay-view")
  );
  assert.equal(document.querySelector("#app-game-exit-label").textContent, "Leave Game");
  assert.equal(document.querySelector("#app-game-exit").disabled, false);

  document.querySelector("#confirm-leave-game").click();
  const leaveRequest = emitted.find((item) => item.event === "leave-game");
  assert.ok(leaveRequest, "the confirmation should emit leave-game");
  assert.deepEqual(leaveRequest.data, { roomCode: "ABC123" });

  leaveRequest.respond({ success: true });

  assert.equal(getModalHideCount(), 1);
  assert.equal(document.querySelector("#gameplay-view").classList.contains("d-none"), true);
  assert.equal(document.querySelector("#lobby-view").classList.contains("d-none"), false);
  assert.equal(document.querySelector("#entry-view").classList.contains("d-none"), true);
  assert.equal(document.querySelector(".app-utility-controls").parentElement, document.body);
  assert.match(document.querySelector("#game-status").textContent, /left the game and returned to the lobby/i);
  close();
});

test("a lobby waiter can rejoin an active game as a spectator", () => {
  const { close, emitted, handlers } = createClient();

  handlers.get("room-resumed")({
    roomCode: "ABC123",
    isHost: false,
    role: "player",
    isLocked: false,
    selectedGameId: "example-game",
    gameSettings: {},
    hasActiveGame: true,
    activeGameId: null,
    isPaused: false,
    chatEnabled: false
  });

  const spectateButton = document.querySelector("#spectate-game");
  assert.equal(spectateButton.classList.contains("d-none"), false);
  assert.equal(spectateButton.disabled, false);
  spectateButton.click();

  const request = emitted.find((item) => item.event === "spectate-game");
  assert.ok(request);
  request.respond({ success: true, role: "spectator" });
  handlers.get("game-started")({
    gameId: "example-game",
    settings: {},
    chatEnabled: true,
    isPaused: false
  });

  assert.equal(document.querySelector("#gameplay-view").classList.contains("d-none"), false);
  assert.equal(document.querySelector("#app-game-exit-label").textContent, "Stop Spectating");
  close();
});

test("a spectator can leave the board through the spectator confirmation", () => {
  const { close, emitted, handlers } = createClient();

  handlers.get("room-resumed")({
    roomCode: "ABC123",
    isHost: false,
    role: "spectator",
    isLocked: false,
    selectedGameId: "example-game",
    gameSettings: {},
    hasActiveGame: true,
    activeGameId: "example-game",
    isPaused: false,
    chatEnabled: true
  });

  assert.equal(document.querySelector("#app-game-exit").disabled, false);
  document.querySelector("#confirm-leave-spectator").click();
  const request = emitted.find((item) => item.event === "leave-game");
  assert.ok(request);
  request.respond({ success: true, role: "player" });

  assert.equal(document.querySelector("#gameplay-view").classList.contains("d-none"), true);
  assert.equal(document.querySelector("#lobby-view").classList.contains("d-none"), false);
  assert.equal(document.querySelector("#spectate-game").disabled, false);
  close();
});

test("chat history is replayed after mount and live messages follow it", () => {
  const { close, handlers, gameClientPlatformEvents } = createClient();
  const message = { senderId: "guest", senderName: "Guest", message: "Earlier", sentAt: 1 };
  try {
    handlers.get("room-resumed")({
      roomCode: "ABC123", isHost: false, role: "player", isLocked: false,
      selectedGameId: "example-game", gameSettings: {}, hasActiveGame: true,
      activeGameId: "example-game", isPaused: false, chatEnabled: true,
      chatHistory: [message]
    });
    handlers.get("game-chat-message")({ ...message, message: "Live", sentAt: 2 });
    assert.deepEqual(gameClientPlatformEvents.filter((event) => event.type === "chat-message"), [
      { type: "chat-message", payload: { ...message, isHistory: true } },
      { type: "chat-message", payload: { ...message, message: "Live", sentAt: 2 } }
    ]);
  } finally { close(); }
});

test("a spectator list received before mounting is delivered to the game", () => {
  const { close, handlers, gameClientPlatformEvents } = createClient();
  const spectators = [{
    id: "viewer",
    name: "Viewer",
    avatar: "ghost",
    isConnected: true
  }];

  handlers.get("spectator-list")(spectators);
  handlers.get("room-resumed")({
    roomCode: "ABC123",
    isHost: false,
    role: "spectator",
    isLocked: false,
    selectedGameId: "example-game",
    gameSettings: {},
    hasActiveGame: true,
    activeGameId: "example-game",
    isPaused: false,
    chatEnabled: true
  });

  assert.deepEqual(gameClientPlatformEvents.at(-1), {
    type: "spectators",
    payload: spectators
  });
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

test("explicit invite does not resume a different saved room", () => {
  const client = createClient({ url: "http://localhost/?room=BBBBBB", savedRoom: "AAAAAA" });
  try {
    client.handlers.get("connect")();
    client.handlers.get("room-resume-failed")(null);
    assert.equal(client.emitted.some(({ event }) => event === "resume-room"), false);
    assert.equal(document.querySelector("#room-code").value, "BBBBBB");
  } finally { client.close(); }
});
test("an invite can resume its own saved session", () => {
  const client = createClient({ url: "http://localhost/?room=AAAAAA", savedRoom: "AAAAAA" });
  try {
    client.handlers.get("connect")();
    assert.equal(client.emitted.some(({ event }) => event === "resume-room"), true);
  } finally { client.close(); }
});

for (const action of ["create-room", "join-room"]) {
  test(`${action} consumes the invite so a refresh can resume the actual room`, () => {
    let url;
    const client = createClient({ url: "http://localhost/?room=BBBBBB&other=kept#details" });
    try {
      document.querySelector("#player-name").value = "Host";
      document.querySelector("#room-code").value = "AAAAAA";
      document.querySelector(`#${action}`).click();
      client.emitted.find(({ event }) => event === action).respond({
        success: true, roomCode: "AAAAAA", resumeToken: "token", role: "player", activeGameId: null
      });
      url = window.location.href;
      assert.equal(new URL(url).searchParams.has("room"), false);
      assert.equal(new URL(url).searchParams.get("other"), "kept");
      assert.equal(new URL(url).hash, "#details");
      assert.equal(localStorage.getItem("gamehub:last-room"), "AAAAAA");
    } finally { client.close(); }
    const refreshed = createClient({ url, savedRoom: "AAAAAA" });
    try {
      refreshed.handlers.get("connect")();
      assert.ok(refreshed.emitted.some(({ event }) => event === "resume-room"));
    } finally { refreshed.close(); }
  });
}
