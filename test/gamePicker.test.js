const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { GameClientHost } = require("../public/gameHost.js");

function createClient({ prefersReducedMotion = false, mobile = false, fullscreenRequest, savedRoom, savedSessions = [], legacyRoom, locks, navigationType, sessionStatuses, savedRules, savedGameplayBlur, savedGraphics = {}, url = "http://localhost" } = {}) {
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
    const session = { roomCode: savedRoom, resumeToken: "saved-token", playerName: "Saved player", savedAt: Date.now() };
    dom.window.sessionStorage.setItem("gamehub:tab-session", JSON.stringify(session));
    savedSessions = [session, ...savedSessions];
  }
  localStorage.setItem("gamehub:saved-sessions", JSON.stringify(savedSessions));
  if (legacyRoom) {
    localStorage.setItem("gamehub:last-room", legacyRoom);
    localStorage.setItem(`gamehub:resume:${legacyRoom}`, "legacy-token");
  }
  if (locks) Object.defineProperty(window.navigator, "locks", { value: locks, configurable: true });
  if (navigationType) window.performance.getEntriesByType = () => [{ type: navigationType }];
  if (savedRules) localStorage.setItem("gamehub:rule-presets", JSON.stringify(savedRules));
  if (savedGameplayBlur !== undefined) localStorage.setItem("gamehub:gameplay-blur", savedGameplayBlur);
  for (const [id, enabled] of Object.entries(savedGraphics)) localStorage.setItem(`gamehub:graphics:${id}`, String(enabled));
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
      getOrCreateInstance: (element) => ({
        hide() {
          if (element?.id === "rejoin-room-modal") {
            const event = new window.Event("hide.bs.modal", { cancelable: true });
            element.dispatchEvent(event);
            if (event.defaultPrevented) return;
            element.classList.remove("show");
            element.dispatchEvent(new window.Event("hidden.bs.modal"));
          }
          modalHideCount += 1;
        },
        show() {
          modalShowCount += 1;
          if (element?.id === "rejoin-room-modal") element.classList.add("show");
        }
      })
    }
  };
  const clientSocket = {
    connected: true,
    on(event, handler) {
      handlers.set(event, handler);
    },
    emit(event, data, respond) {
      emitted.push({ event, data, respond });
      if (event === "check-resume-sessions" && respond) {
        const records = JSON.parse(localStorage.getItem("gamehub:saved-sessions") ?? "[]");
        const sessions = sessionStatuses ?? records.map(item => ({ ...item, playerName: item.playerName || "Previous player",
          isConnected: false, expiresAt: Date.now() + 24 * 60 * 60 * 1000, isHost: false, releaseClosesRoom: false }));
        respond({ success: true, sessions: sessions.filter(item => data.tokens.includes(item.resumeToken)) });
      }
    }
  };
  global.io = () => clientSocket;

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
    window.dispatchEvent(new window.Event("pagehide"));
    handlers.get("game-ended")?.({ message: "Test cleanup" });
    intervals.forEach((interval) => clearInterval(interval));
    dom.window.close();
  };

  return {
    close,
    socket: clientSocket,
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
      let rejectCopy;
      window.navigator.clipboard.writeText = () => new Promise((_resolve, reject) => { rejectCopy = reject; });
      const prompted = [];
      window.prompt = (_message, value) => prompted.push(value);
      document.querySelector("#copy-room-code").click();
      view.handlers.get("room-resumed")({ roomCode: "NEW123", isHost, isLocked: false,
        selectedGameId: null, gameSettings: {}, activeGameId: null, isPaused: false, chatEnabled: false });
      rejectCopy(new Error("Clipboard denied"));
      await Promise.resolve();
      assert.deepEqual(prompted, ["ABC123"]);
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
  assert.equal(JSON.parse(window.sessionStorage.getItem("gamehub:tab-session")).roomCode, "ABC123");

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
      assert.equal(JSON.parse(window.sessionStorage.getItem("gamehub:tab-session")).roomCode, "AAAAAA");
    } finally { client.close(); }
    const refreshed = createClient({ url, savedRoom: "AAAAAA" });
    try {
      refreshed.handlers.get("connect")();
      assert.ok(refreshed.emitted.some(({ event }) => event === "resume-room"));
    } finally { refreshed.close(); }
  });
}

test("presets stay in this browser, normalize old values, and apply only through Save Settings", () => {
  const view = createClient({ savedRules: { "example-game": {
    last: { fast: true, seconds: 999 }, presets: [{ name: "Chaos", settings: { fast: true, seconds: 20 } }]
  } } });
  const definition = game({ settings: [
    { key: "fast", label: "Fast", description: "Fast rules", defaultValue: false },
    { type: "number", control: "range", key: "seconds", label: "Timer", description: "Seconds", defaultValue: 15, min: 5, max: 120, step: 1 }
  ] });
  try {
    view.handlers.get("available-games")([definition]);
    document.querySelector("#create-room").click();
    view.emitted.find(({ event }) => event === "create-room").respond({ success: true, roomCode: "ABC123", resumeToken: "token" });
    const selected = view.emitted.find(({ event }) => event === "select-game");
    assert.deepEqual(selected.data.settings, { fast: true, seconds: 15 });
    view.handlers.get("game-selected")({ gameId: definition.id, settings: selected.data.settings });
    assert.deepEqual([...document.querySelector("#rule-preset").options].map(option => option.textContent), ["Chaos"]);
    document.querySelector("#rule-preset").value = "Chaos";
    document.querySelector("#rule-preset").dispatchEvent(new window.Event("change"));
    assert.equal(document.querySelector('[data-setting-key="seconds"]').value, "20");
    assert.equal(view.emitted.some(({ event }) => event === "update-game-settings"), false);
    document.querySelector("#rule-preset-name").value = "My custom rules";
    document.querySelector('[data-preset-action="save"]').click();
    let saved = JSON.parse(localStorage.getItem("gamehub:rule-presets"));
    assert.equal(saved[definition.id].presets.length, 2);
    document.querySelector("#save-game-settings").click();
    assert.deepEqual(view.emitted.find(({ event }) => event === "update-game-settings").data.settings, { fast: true, seconds: 20 });
    view.handlers.get("game-settings-updated")({ gameId: definition.id, settings: { fast: true, seconds: 20 } });
    saved = JSON.parse(localStorage.getItem("gamehub:rule-presets"));
    assert.equal(saved[definition.id].last.seconds, 20);
    document.querySelector("#rule-preset").value = "My custom rules";
    document.querySelector('[data-preset-action="delete"]').click();
    assert.equal(JSON.parse(localStorage.getItem("gamehub:rule-presets"))[definition.id].presets.length, 1);
    view.handlers.get("room-host")({ hostId: "another-player", recoveryDeadline: null, serverNow: Date.now() });
    assert.equal(document.querySelector("#rule-preset"), null);
    view.handlers.get("room-host")({ hostId: undefined, recoveryDeadline: null, serverNow: Date.now() });
    assert.ok(document.querySelector("#rule-preset"), "new host gets presets immediately");
  } finally { view.close(); }
});

for (const code of ["Space", "Enter", "NumpadEnter"]) {
  test(`${code} on a button preserves native activation without triggering a gameplay action`, () => {
    const view = createClient(); let actions = 0;
    try {
      view.handlers.get("available-games")([game({ keybinds: [{ id: "primary", label: "Primary", defaultKey: code }] })]);
      view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: false, selectedGameId: "example-game", gameSettings: {},
        activeGameId: "example-game", role: "player", isLocked: false, isPaused: false, chatEnabled: true });
      view.gameClientContexts[0].input.onAction("primary", () => actions++);
      const event = new window.KeyboardEvent("keydown", { code, bubbles: true, cancelable: true });
      document.querySelector("#app-settings-button").dispatchEvent(event);
      assert.equal(actions, 0);
      assert.equal(event.defaultPrevented, false, "the browser can activate the focused button");
      document.body.dispatchEvent(new window.KeyboardEvent("keydown", { code, bubbles: true }));
      assert.equal(actions, 1, "the gameplay shortcut still works away from buttons");
    } finally { view.close(); }
  });
}


test("lobby Host buttons sit before Kick and only target eligible connected players", () => {
  const view = createClient();
  try {
    view.handlers.get("available-games")([game()]);
    document.querySelector("#create-room").click();
    view.emitted.find(({ event }) => event === "create-room").respond({ success: true, roomCode: "ABC123", resumeToken: "token" });
    view.handlers.get("player-list")([
      { id: "host", name: "Host", avatar: "H", isHost: true, isConnected: true },
      { id: "guest", name: "Guest", avatar: "G", isHost: false, isConnected: true },
      { id: "offline", name: "Offline", avatar: "O", isHost: false, isConnected: false }
    ]);
    const buttons = [...document.querySelectorAll("#player-list li:nth-child(2) button")];
    assert.deepEqual(buttons.map(button => button.textContent), ["Host", "Kick"]);
    assert.equal(document.querySelectorAll("#player-list li:nth-child(3) button").length, 1);
    buttons[0].click();
    assert.deepEqual(view.emitted.find(({ event }) => event === "transfer-host").data, { memberId: "guest" });
    assert.equal(document.querySelector("#host-transfer-controls").hidden, false);
    assert.deepEqual([...document.querySelector("#host-transfer-player").options].map(option => option.value), ["guest"]);
    assert.equal(document.querySelector("#view-room-scoreboard"), null);
  } finally { view.close(); }
});


test("score reset uses a repeatable in-app confirmation and cancellation sends nothing", async () => {
  const view = createClient();
  try {
    view.handlers.get("available-games")([game()]);
    view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: true, selectedGameId: "example-game", gameSettings: {},
      activeGameId: "example-game", role: "player", isLocked: false, isPaused: false, chatEnabled: true });
    const context = view.gameClientContexts[0];
    const first = context.resetScoreboard();
    assert.equal(view.emitted.some(({event}) => event === "reset-room-scoreboard"), false);
    document.querySelector("#reset-scoreboard-modal").dispatchEvent(new window.Event("hidden.bs.modal"));
    assert.equal((await first).success, true);
    const second = context.resetScoreboard();
    document.querySelector("#confirm-reset-scoreboard").click();
    const request = view.emitted.find(({event}) => event === "reset-room-scoreboard");
    assert.deepEqual(request.data, { gameId: "example-game" });
    request.respond({ success: true });
    assert.equal((await second).success, true);
    assert.equal(document.querySelector("#confirm-reset-scoreboard").disabled, false);
  } finally { view.close(); }
});


test("an in-game host handoff restores preset controls when the match ends", () => {
  const view = createClient();
  try {
    const definition = game({ settings: [{ key: "fast", label: "Fast", defaultValue: false }] });
    view.handlers.get("available-games")([definition]);
    view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: false, selectedGameId: definition.id,
      gameSettings: { fast: true }, activeGameId: definition.id, hasActiveGame: true, role: "player", isLocked: false });
    view.handlers.get("game-selected")({ gameId: definition.id, settings: { fast: true } });
    view.handlers.get("room-host")({ hostId: undefined, recoveryDeadline: null, serverNow: Date.now() });
    assert.equal(document.querySelector("#rule-preset"), null);
    view.handlers.get("game-ended")({ message: "Match ended" });
    assert.ok(document.querySelector("#rule-preset"));
    assert.equal(document.querySelector("#setting-fast").checked, true);
    assert.equal(document.querySelector("#setting-fast").disabled, false);
    assert.equal(document.querySelector("#setting-fast").getAttribute("role"), "switch");
    assert.ok(document.querySelector("#setting-fast").closest(".settings-switch"));
  } finally { view.close(); }
});

test("off-step saved slider values fall back to defaults on selection and preset load", () => {
  const view = createClient({ savedRules: { "example-game": {
    last: { seconds: 17 }, presets: [{ name: "Older rules", settings: { seconds: 17 } }]
  } } });
  try {
    const definition = game({ settings: [{ type: "number", control: "range", key: "seconds", label: "Wait",
      defaultValue: 60, min: 15, max: 300, step: 5 }] });
    view.handlers.get("available-games")([definition]);
    document.querySelector("#create-room").click();
    view.emitted.find(({ event }) => event === "create-room").respond({ success: true, roomCode: "ABC123", resumeToken: "token" });
    assert.equal(view.emitted.find(({ event }) => event === "select-game").data.settings.seconds, 60);
    view.handlers.get("game-selected")({ gameId: definition.id, settings: { seconds: 60 } });
    document.querySelector("#rule-preset").value = "Older rules";
    document.querySelector("#rule-preset").dispatchEvent(new window.Event("change"));
    assert.equal(document.querySelector("#setting-seconds").value, "60");
  } finally { view.close(); }
});

for (const reason of ["room-closed", "game-ended", "disconnect", "room-host"]) {
  test(`a score reset is cancelled on ${reason} and cannot submit afterward`, async () => {
    const view = createClient();
    try {
      view.handlers.get("available-games")([game()]);
      view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: true, selectedGameId: "example-game", gameSettings: {},
        activeGameId: "example-game", role: "player", isLocked: false });
      const pending = view.gameClientContexts[0].resetScoreboard();
      view.handlers.get(reason)(reason === "room-host" ? { hostId: "other", recoveryDeadline: null } : { message: "Ended" });
      assert.equal((await pending).success, true);
      document.querySelector("#confirm-reset-scoreboard").click();
      assert.equal(view.emitted.some(({event}) => event === "reset-room-scoreboard"), false);
    } finally { view.close(); }
  });
}

test("a late reset reply cannot dismiss a new confirmation", async () => {
  const view = createClient();
  try {
    const room = { roomCode: "ABC123", isHost: true, selectedGameId: "example-game", gameSettings: {},
      activeGameId: "example-game", role: "player", isLocked: false };
    view.handlers.get("available-games")([game()]);
    view.handlers.get("room-resumed")(room);
    const first = view.gameClientContexts[0].resetScoreboard();
    document.querySelector("#confirm-reset-scoreboard").click();
    const oldRequest = view.emitted.find(({event}) => event === "reset-room-scoreboard");
    view.handlers.get("game-ended")({ message: "Ended" });
    await first;
    view.handlers.get("room-resumed")(room);
    const second = view.gameClientContexts[1].resetScoreboard();
    const hidden = view.getModalHideCount();
    oldRequest.respond({ success: false, message: "Old request" });
    assert.equal(view.getModalHideCount(), hidden);
    document.querySelector("#reset-scoreboard-modal").dispatchEvent(new window.Event("hidden.bs.modal"));
    await second;
  } finally { view.close(); }
});


test("reset cancellation retries closing after an opening transition and cleans that retry", async () => {
  const view = createClient();
  try {
    view.handlers.get("available-games")([game()]);
    view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: true, selectedGameId: "example-game", gameSettings: {},
      activeGameId: "example-game", role: "player", isLocked: false });
    const pending = view.gameClientContexts[0].resetScoreboard();
    view.handlers.get("game-ended")({ message: "Ended while opening" });
    await pending;
    const modal = document.querySelector("#reset-scoreboard-modal");
    const hides = view.getModalHideCount();
    modal.dispatchEvent(new window.Event("shown.bs.modal"));
    assert.equal(view.getModalHideCount(), hides + 1);
    modal.dispatchEvent(new window.Event("hidden.bs.modal"));
    modal.dispatchEvent(new window.Event("shown.bs.modal"));
    assert.equal(view.getModalHideCount(), hides + 1);
  } finally { view.close(); }
});



const settleRejoin = async () => { await Promise.resolve(); await Promise.resolve(); };
const savedPlayer = (name, token, lastSeen = Date.now()) => ({
  roomCode: "ABC123", resumeToken: token, playerName: name, savedAt: Date.now(), lastSeen
});

test("new tabs offer the most recently seen eligible player in a modal", async () => {
  const view = createClient({ savedSessions: [savedPlayer("Older", "older", 100), savedPlayer("Latest", "latest", 200)] });
  try {
    await settleRejoin();
    view.handlers.get("connect")();
    view.handlers.get("room-resume-failed")(null);
    assert.equal(view.emitted.some(item => item.event === "resume-room"), false);
    assert.equal(document.querySelector("#saved-room-player"), null);
    assert.equal(document.querySelector("#rejoin-room").textContent, "Rejoin as Latest");
    assert.equal(view.getModalShowCount(), 1);
    document.querySelector("#rejoin-room").click();
    assert.deepEqual(view.emitted.find(item => item.event === "resume-room").data,
      { resumeToken: "latest", onlyDisconnected: true });
  } finally { view.close(); }
});

test("connected players, held locks, and invalid tokens never produce a rejoin modal", async () => {
  const sessions = [savedPlayer("Connected", "connected"), savedPlayer("Open offline", "locked"), savedPlayer("Expired", "expired")];
  const view = createClient({ savedSessions: sessions, locks: { query: async () => ({ held: [{ name: "gamehub:player:ABC123:open offline" }] }) },
    sessionStatuses: sessions.slice(0, 2).map((item, index) => ({ ...item, isConnected: index === 0 })) });
  try {
    await settleRejoin();
    assert.equal(view.getModalShowCount(), 0);
    assert.equal(view.emitted.some(item => item.event === "resume-room"), false);
    assert.deepEqual(JSON.parse(localStorage.getItem("gamehub:saved-sessions")).map(item => item.resumeToken), ["connected", "locked"]);
  } finally { view.close(); }
});

test("joining as new releases the old identity before returning to ordinary join controls", async () => {
  const view = createClient({ savedSessions: [savedPlayer("Guest", "guest")] });
  try {
    await settleRejoin();
    document.querySelector("#rejoin-as-new-player").click();
    const release = view.emitted.find(item => item.event === "release-saved-player");
    assert.deepEqual(release.data, { resumeToken: "guest" });
    assert.equal(view.emitted.some(item => item.event === "join-room"), false);
    release.respond({ success: true, roomClosed: false });
    assert.equal(document.querySelector("#room-code").value, "ABC123");
    assert.equal(document.querySelector("#player-name").value, "");
    assert.equal(JSON.parse(localStorage.getItem("gamehub:saved-sessions")).length, 0);
    assert.equal(document.querySelector("#join-room").disabled, false);
  } finally { view.close(); }
});

test("a failed release keeps the saved identity available", async () => {
  const view = createClient({ savedSessions: [savedPlayer("Guest", "guest")] });
  try {
    await settleRejoin();
    document.querySelector("#rejoin-as-new-player").click();
    view.emitted.find(item => item.event === "release-saved-player").respond({ success: false, message: "Already connected" });
    assert.equal(JSON.parse(localStorage.getItem("gamehub:saved-sessions")).length, 1);
    assert.equal(document.querySelector("#rejoin-room").disabled, false);
  } finally { view.close(); }
});

test("legacy tokens and reopened documents use the validated modal", async () => {
  for (const options of [{ legacyRoom: "ABC123" }, { savedRoom: "ABC123", navigationType: "navigate" }]) {
    const view = createClient(options);
    try {
      await settleRejoin();
      view.handlers.get("connect")();
      assert.equal(view.emitted.some(item => item.event === "resume-room"), false);
      assert.equal(view.getModalShowCount(), 1);
    } finally { view.close(); }
  }
});

test("a copied tab cannot automatically claim a player held by another tab", async () => {
  const view = createClient({ savedRoom: "ABC123", sessionStatuses: [], locks: { request: async (_key, _options, callback) => callback(null) } });
  try {
    view.handlers.get("connect")();
    await settleRejoin();
    assert.equal(view.emitted.some(item => item.event === "resume-room"), false);
    assert.equal(window.sessionStorage.getItem("gamehub:tab-session"), null);
    assert.equal(document.querySelector("#create-room").disabled, false);
    assert.equal(view.getModalShowCount(), 0);
    assert.equal(document.querySelector("#reconnecting-overlay").hidden, true);
  } finally { view.close(); }
});

test("a disconnect during restoration retries and ignores the previous reply", () => {
  const view = createClient({ savedRoom: "ABC123" });
  try {
    view.handlers.get("connect")();
    const first = view.emitted.find(item => item.event === "resume-room");
    view.handlers.get("disconnect")();
    view.handlers.get("connect")();
    assert.equal(view.emitted.filter(item => item.event === "resume-room").length, 2);
    first.respond({ success: false, message: "Old failure" });
    assert.ok(window.sessionStorage.getItem("gamehub:tab-session"));
    assert.equal(document.querySelector("#reconnecting-overlay").hidden, false);
  } finally { view.close(); }
});

test("automatic restoration has a ten-second deadline before offering the modal", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const view = createClient({ savedRoom: "ABC123" });
  try {
    assert.equal(document.querySelector("#reconnecting-overlay").hidden, false);
    t.mock.timers.tick(10_000);
    await settleRejoin();
    assert.equal(document.querySelector("#reconnecting-overlay").hidden, true);
    assert.equal(window.sessionStorage.getItem("gamehub:tab-session"), null);
    assert.equal(view.getModalShowCount(), 1);
  } finally { view.close(); }
});


test("disconnect closes a pending rejoin modal and restores menu controls", async () => {
  const view = createClient({ savedSessions: [savedPlayer("Guest", "guest")] });
  try {
    await settleRejoin();
    const modal = document.querySelector("#rejoin-room-modal");
    document.querySelector("#rejoin-as-new-player").click();
    assert.ok(view.emitted.some(item => item.event === "release-saved-player"));
    const hide = new window.Event("hide.bs.modal", { cancelable: true });
    modal.dispatchEvent(hide);
    assert.equal(hide.defaultPrevented, true);
    assert.equal(modal.classList.contains("show"), true);
    view.handlers.get("disconnect")();
    assert.equal(modal.classList.contains("show"), false);
    assert.equal(document.querySelector("#join-room").disabled, false);
    assert.equal(JSON.parse(localStorage.getItem("gamehub:saved-sessions"))[0].resumeToken, "guest");
  } finally { view.close(); }
});


test("an interrupted rejoin offer returns after connection recovery", async () => {
  const view = createClient({ savedSessions: [savedPlayer("Guest", "guest")] });
  try {
    await settleRejoin();
    document.querySelector("#rejoin-as-new-player").click();
    view.handlers.get("disconnect")();
    view.handlers.get("connect")();
    await settleRejoin();
    assert.equal(document.querySelector("#rejoin-room-modal").classList.contains("show"), true);
    assert.equal(document.querySelector("#rejoin-room").disabled, false);
  } finally { view.close(); }
});

test("a late saved-player release cannot clear a newer room identity", async () => {
  const view = createClient({ savedSessions: [savedPlayer("Guest", "guest")] });
  try {
    await settleRejoin();
    document.querySelector("#rejoin-as-new-player").click();
    const release = view.emitted.find(item => item.event === "release-saved-player");
    view.handlers.get("disconnect")();
    view.handlers.get("room-resumed")({ roomCode: "NEW123", playerName: "New Host", activeGameId: null,
      players: [], isHost: true, selectedGameId: "egyptian-war", gameSettings: {}, isLocked: false });
    view.handlers.get("room-resume-token")("new-token");
    const stored = window.sessionStorage.getItem("gamehub:tab-session");
    assert.ok(stored);
    release.respond({ success: true, roomClosed: false });
    assert.equal(window.sessionStorage.getItem("gamehub:tab-session"), stored);
    assert.equal(document.querySelector("#player-name").value, "New Host");
  } finally { view.close(); }
});


const entrySuccess = (roomCode, resumeToken) => ({ success: true, roomCode, resumeToken,
  playerName: "New Host", activeGameId: null, role: "player", selectedGameId: null, gameSettings: {} });
for (const event of ["create-room", "join-room"]) {
  for (const success of [false, true]) {
    test(`a stale ${event} ${success ? "success" : "failure"} cannot replace a newer entry`, () => {
      const view = createClient();
      try {
        document.querySelector("#player-name").value = "Previous player";
        document.querySelector("#room-code").value = "OLD123";
        document.querySelector(event === "create-room" ? "#create-room" : "#join-room").click();
        const old = view.emitted.find(item => item.event === event);
        view.handlers.get("disconnect")();
        document.querySelector("#player-name").value = "New Host";
        document.querySelector("#create-room").click();
        const fresh = view.emitted.filter(item => item.event === "create-room").at(-1);
        old.respond(success ? entrySuccess("OLD123", "old-token") : { success: false, message: "Old failure" });
        assert.equal(document.querySelector("#create-room").disabled, true);
        assert.equal(window.sessionStorage.getItem("gamehub:tab-session"), null);
        fresh.respond(entrySuccess("NEW123", "new-token"));
        const stored = JSON.parse(window.sessionStorage.getItem("gamehub:tab-session"));
        assert.equal(stored.roomCode, "NEW123");
        assert.equal(stored.resumeToken, "new-token");
      } finally { view.close(); }
    });
  }
}

test("a cancelled approval result cannot replace a newer lobby", () => {
  const view = createClient();
  try {
    document.querySelector("#player-name").value = "Guest";
    document.querySelector("#room-code").value = "OLD123";
    document.querySelector("#join-room").click();
    view.emitted.find(item => item.event === "join-room").respond({ success: true, pendingApproval: true });
    document.querySelector("#join-room").click();
    view.emitted.find(item => item.event === "cancel-join-request").respond({ success: true });
    document.querySelector("#create-room").click();
    view.emitted.find(item => item.event === "create-room").respond(entrySuccess("NEW123", "new-token"));
    view.handlers.get("join-request-result")(entrySuccess("OLD123", "old-token"));
    assert.equal(JSON.parse(window.sessionStorage.getItem("gamehub:tab-session")).roomCode, "NEW123");
  } finally { view.close(); }
});

test("a cancellation acknowledgement after host approval keeps joined controls locked", () => {
  const view = createClient();
  try {
    document.querySelector("#player-name").value = "Guest";
    document.querySelector("#room-code").value = "ABC123";
    document.querySelector("#join-room").click();
    view.emitted.find(item => item.event === "join-room").respond({ success: true, pendingApproval: true });
    document.querySelector("#join-room").click();
    const cancel = view.emitted.find(item => item.event === "cancel-join-request");
    view.handlers.get("join-request-result")(entrySuccess("ABC123", "guest-token"));
    cancel.respond({ success: true });
    assert.equal(document.querySelector("#join-room").disabled, true);
    assert.equal(document.querySelector("#player-name").disabled, true);
    assert.equal(JSON.parse(window.sessionStorage.getItem("gamehub:tab-session")).roomCode, "ABC123");
  } finally { view.close(); }
});


for (const activeGameId of [null, "example-game"]) {
  test(`a terminal reconnect rejection clears the stale ${activeGameId ? "game" : "lobby"}`, () => {
    const view = createClient();
    try {
      view.handlers.get("room-resumed")({ roomCode: "ABC123", playerName: "Host", isHost: true,
        selectedGameId: "example-game", activeGameId, chatEnabled: true, gameSettings: {} });
      view.handlers.get("room-resume-token")("old-token");
      view.handlers.get("disconnect")();
      view.handlers.get("connect")();
      view.emitted.filter(item => item.event === "resume-room").at(-1)
        .respond({ success: false, sessionUnavailable: true, message: "That saved room session is no longer available." });
      assert.equal(document.querySelector("#entry-view").classList.contains("d-none"), false);
      assert.equal(document.querySelector("#lobby-view").classList.contains("d-none"), true);
      assert.equal(document.querySelector("#gameplay-view").classList.contains("d-none"), true);
      assert.equal(window.sessionStorage.getItem("gamehub:tab-session"), null);
      assert.deepEqual(JSON.parse(localStorage.getItem("gamehub:saved-sessions")), []);
      assert.equal(document.querySelector("#reconnecting-overlay").hidden, true);
      assert.equal(document.querySelector("#create-room").disabled, false);
      assert.equal(view.audioScenes.at(-1), "menu");
    } finally { view.close(); }
  });
}

test("temporary reconnect errors keep the saved identity and bounded recovery window", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const view = createClient({ savedRoom: "ABC123" });
  try {
    view.handlers.get("connect")();
    view.emitted.find(item => item.event === "resume-room").respond({ success: false, message: "Unable to process that request." });
    assert.ok(window.sessionStorage.getItem("gamehub:tab-session"));
    assert.equal(document.querySelector("#reconnecting-overlay").hidden, false);
    t.mock.timers.tick(10_000);
    await settleRejoin();
    assert.equal(document.querySelector("#entry-view").classList.contains("d-none"), false);
    assert.equal(document.querySelector("#reconnecting-overlay").hidden, true);
    assert.equal(JSON.parse(localStorage.getItem("gamehub:saved-sessions"))[0].resumeToken, "saved-token");
  } finally { view.close(); }
});

test("an old terminal rejection cannot clear a successfully rotated reconnect identity", () => {
  const view = createClient({ savedRoom: "ABC123" });
  try {
    view.handlers.get("connect")();
    const request = view.emitted.find(item => item.event === "resume-room");
    view.handlers.get("room-resumed")({ roomCode: "ABC123", playerName: "Saved player", isHost: true,
      selectedGameId: null, activeGameId: null, gameSettings: {} });
    view.handlers.get("room-resume-token")("rotated-token");
    request.respond({ success: false, sessionUnavailable: true, message: "Old rejection" });
    assert.equal(JSON.parse(window.sessionStorage.getItem("gamehub:tab-session")).resumeToken, "rotated-token");
    assert.equal(document.querySelector("#lobby-view").classList.contains("d-none"), false);
  } finally { view.close(); }
});


function openPresetEditor(view) {
  const definition = game({ settings: [{ key: "fast", label: "Fast", description: "Fast rules", defaultValue: false }] });
  view.handlers.get("available-games")([definition]);
  document.querySelector("#create-room").click();
  view.emitted.find(item => item.event === "create-room").respond(entrySuccess("ABC123", "token"));
  view.handlers.get("game-selected")({ gameId: definition.id, settings: { fast: false } });
}

test("preset save and delete merge the latest data even before a storage event arrives", () => {
  const view = createClient({ savedRules: { "example-game": { presets: [{ name: "Alpha", settings: { fast: false } }] } } });
  try {
    openPresetEditor(view);
    const shared = { "example-game": { last: { fast: true }, presets: [
      { name: "Alpha", settings: { fast: false } }, { name: "Beta", settings: { fast: true } }
    ] }, other: { last: { untouched: true } } };
    localStorage.setItem("gamehub:rule-presets", JSON.stringify(shared));
    document.querySelector("#rule-preset-name").value = "Gamma";
    document.querySelector('[data-preset-action="save"]').click();
    let saved = JSON.parse(localStorage.getItem("gamehub:rule-presets"));
    assert.deepEqual(saved["example-game"].presets.map(p => p.name), ["Alpha", "Beta", "Gamma"]);
    assert.deepEqual(saved["example-game"].last, { fast: true });
    assert.deepEqual(saved.other, shared.other);
    saved["example-game"].presets.push({ name: "Delta", settings: { fast: false } });
    localStorage.setItem("gamehub:rule-presets", JSON.stringify(saved));
    document.querySelector("#rule-preset").value = "Beta";
    document.querySelector('[data-preset-action="delete"]').click();
    saved = JSON.parse(localStorage.getItem("gamehub:rule-presets"));
    assert.deepEqual(saved["example-game"].presets.map(p => p.name), ["Alpha", "Gamma", "Delta"]);
  } finally { view.close(); }
});

test("external preset updates refresh only the list and preserve an unsaved draft", () => {
  const view = createClient({ savedRules: { "example-game": { presets: [{ name: "Alpha", settings: { fast: false } }] } } });
  try {
    openPresetEditor(view);
    const toggle = document.querySelector('[data-setting-key="fast"]');
    const name = document.querySelector("#rule-preset-name");
    toggle.checked = true; name.value = "Unsaved name"; name.focus();
    document.querySelector("#rule-preset").value = "Alpha";
    localStorage.setItem("gamehub:rule-presets", JSON.stringify({ "example-game": { presets: [
      { name: "Alpha", settings: { fast: false } }, { name: "Beta", settings: { fast: false } }
    ] } }));
    window.dispatchEvent(new window.StorageEvent("storage", { key: "gamehub:rule-presets" }));
    assert.deepEqual([...document.querySelector("#rule-preset").options].map(o => o.value), ["Alpha", "Beta"]);
    assert.equal(document.querySelector("#rule-preset").value, "Alpha");
    assert.equal(toggle.checked, true);
    assert.equal(name.value, "Unsaved name");
    assert.equal(document.activeElement, name);
    localStorage.removeItem("gamehub:rule-presets");
    window.dispatchEvent(new window.StorageEvent("storage", { key: null }));
    assert.equal(document.querySelector("#rule-preset").disabled, true);
    assert.equal(toggle.checked, true);
  } finally { view.close(); }
});

test("remembering confirmed rules preserves presets written by another tab", () => {
  const view = createClient();
  try {
    openPresetEditor(view);
    localStorage.setItem("gamehub:rule-presets", JSON.stringify({ "example-game": {
      presets: [{ name: "Remote", settings: { fast: false } }]
    } }));
    view.handlers.get("game-settings-updated")({ gameId: "example-game", settings: { fast: true } });
    const saved = JSON.parse(localStorage.getItem("gamehub:rule-presets"))["example-game"];
    assert.deepEqual(saved.last, { fast: true });
    assert.equal(saved.presets[0].name, "Remote");
  } finally { view.close(); }
});


for (const readsBlocked of [false, true]) {
  test(`failed writes retain preset edits and recover alongside other tabs (${readsBlocked ? "reads blocked" : "reads allowed"})`, () => {
    const view = createClient({ savedRules: { "example-game": {
      presets: [{ name: "Existing", settings: { fast: false } }]
    } } });
    const storage = localStorage;
    const proto = Object.getPrototypeOf(storage);
    const originalSet = proto.setItem, originalGet = proto.getItem;
    let blocked = true;
    try {
      openPresetEditor(view);
      proto.setItem = function(key, value) {
        if (key === "gamehub:rule-presets" && blocked) throw new window.DOMException("Full", "QuotaExceededError");
        return originalSet.call(this, key, value);
      };
      proto.getItem = function(key) {
        if (key === "gamehub:rule-presets" && blocked && readsBlocked) throw new window.DOMException("Disabled", "SecurityError");
        return originalGet.call(this, key);
      };
      const save = title => {
        document.querySelector("#rule-preset-name").value = title;
        document.querySelector('[data-preset-action="save"]').click();
      };
      save("Alpha"); save("Beta");
      assert.deepEqual([...document.querySelector("#rule-preset").options].map(o => o.value), ["Existing", "Alpha", "Beta"]);
      document.querySelector("#rule-preset").value = "Existing";
      document.querySelector('[data-preset-action="delete"]').click();
      view.handlers.get("game-settings-updated")({ gameId: "example-game", settings: { fast: true } });
      const external = { "example-game": { last: { fast: false }, presets: [
        { name: "Existing", settings: { fast: false } }, { name: "Remote", settings: { fast: false } }
      ] }, other: { last: { keep: true } } };
      originalSet.call(storage, "gamehub:rule-presets", JSON.stringify(external));
      window.dispatchEvent(new window.StorageEvent("storage", { key: "gamehub:rule-presets" }));
      const names = [...document.querySelector("#rule-preset").options].map(o => o.value);
      assert.ok(names.includes("Alpha") && names.includes("Beta"));
      assert.equal(names.includes("Existing"), false);
      blocked = false;
      save("Gamma");
      const recovered = JSON.parse(storage.getItem("gamehub:rule-presets"));
      assert.deepEqual(recovered["example-game"].presets.map(p => p.name).sort(), ["Alpha", "Beta", "Gamma", "Remote"]);
      assert.deepEqual(recovered["example-game"].last, { fast: true });
      assert.deepEqual(recovered.other, external.other);
      window.dispatchEvent(new window.StorageEvent("storage", { key: "gamehub:rule-presets" }));
      assert.equal(document.querySelector("#rule-preset").options.length, 4);
    } finally {
      proto.setItem = originalSet; proto.getItem = originalGet;
      view.close();
    }
  });
}


for (const action of ["leave-lobby", "leave-game", "leave-spectator", "spectate-game"]) {
  for (const success of [true, false]) {
    test(`a stale ${action} ${success ? "success" : "failure"} cannot change a newer game`, () => {
      const view = createClient();
      try {
        view.handlers.get("room-resumed")({ roomCode: "OLD123", isHost: false,
          role: action === "leave-spectator" ? "spectator" : "player",
          activeGameId: action === "leave-game" || action === "leave-spectator" ? "example-game" : null,
          hasActiveGame: action !== "leave-lobby", selectedGameId: "example-game", gameSettings: {}, chatEnabled: true });
        view.handlers.get("room-resume-token")("old-token");
        const buttonId = { "leave-lobby": "leave-lobby", "leave-game": "confirm-leave-game",
          "leave-spectator": "confirm-leave-spectator", "spectate-game": "spectate-game" }[action];
        document.getElementById(buttonId).click();
        const request = view.emitted.find(item => item.event === (action === "leave-spectator" ? "leave-game" : action));
        assert.ok(request);
        view.handlers.get("disconnect")();
        view.handlers.get("room-resumed")({ roomCode: "NEW123", isHost: true, role: "player",
          activeGameId: "example-game", selectedGameId: "example-game", gameSettings: {}, chatEnabled: true });
        view.handlers.get("room-resume-token")("new-token");
        const identity = window.sessionStorage.getItem("gamehub:tab-session");
        const notices = view.getToastShowCount();
        const hides = view.getModalHideCount();
        request.respond({ success, role: "spectator", hasActiveGame: true, message: "Old response" });
        assert.equal(window.sessionStorage.getItem("gamehub:tab-session"), identity);
        assert.equal(document.querySelector("#gameplay-view").classList.contains("d-none"), false);
        assert.equal(document.querySelector("#entry-view").classList.contains("d-none"), true);
        assert.equal(view.getToastShowCount(), notices);
        assert.equal(view.getModalHideCount(), hides);
      } finally { view.close(); }
    });
  }
}

test("a leave-game reply cannot unmount a new match in the same room", () => {
  const view = createClient();
  try {
    view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: false, role: "player",
      activeGameId: "example-game", selectedGameId: "example-game", gameSettings: {}, chatEnabled: true });
    document.querySelector("#confirm-leave-game").click();
    const request = view.emitted.find(item => item.event === "leave-game");
    view.handlers.get("game-ended")({ message: "Finished" });
    view.handlers.get("game-started")({ gameId: "example-game", settings: {}, chatEnabled: true });
    request.respond({ success: true, hasActiveGame: false });
    assert.equal(document.querySelector("#gameplay-view").classList.contains("d-none"), false);
    assert.equal(document.querySelector("#confirm-leave-game").disabled, false);
  } finally { view.close(); }
});


for (const modalId of ["leave-game-modal", "leave-spectator-modal", "exit-game-modal"]) {
  for (const event of ["game-ended", "room-closed", "disconnect"]) {
    test(`${modalId} closes after opening when ${event} invalidates it and removes its retry`, () => {
      const view = createClient();
      try {
        view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: modalId === "exit-game-modal",
          role: modalId === "leave-spectator-modal" ? "spectator" : "player", activeGameId: "example-game",
          selectedGameId: "example-game", gameSettings: {}, chatEnabled: true });
        const modal = document.getElementById(modalId);
        modal.dispatchEvent(new window.Event("show.bs.modal"));
        const before = view.getModalHideCount();
        view.handlers.get(event)({ message: "Ended during opening" });
        assert.equal(view.getModalHideCount(), before + 1);
        modal.dispatchEvent(new window.Event("shown.bs.modal"));
        assert.equal(view.getModalHideCount(), before + 2);
        modal.dispatchEvent(new window.Event("hidden.bs.modal"));
        modal.dispatchEvent(new window.Event("show.bs.modal"));
        modal.dispatchEvent(new window.Event("shown.bs.modal"));
        assert.equal(view.getModalHideCount(), before + 2, "old retry must not close a newly opened dialog");
        modal.dispatchEvent(new window.Event("hidden.bs.modal"));
      } finally { view.close(); }
    });
  }
}
for (const success of [true, false]) {
  test(`a stale Exit Game ${success ? "success" : "failure"} cannot affect a newer confirmation`, () => {
    const view = createClient();
    try {
      view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: true, role: "player",
        activeGameId: "example-game", selectedGameId: "example-game", gameSettings: {}, chatEnabled: true });
      document.querySelector("#confirm-exit-game").click();
      const old = view.emitted.find(item => item.event === "close-game-to-lobby");
      view.handlers.get("game-ended")({ message: "Ended" });
      view.handlers.get("game-started")({ gameId: "example-game", settings: {}, chatEnabled: true });
      document.querySelector("#confirm-exit-game").click();
      const hides = view.getModalHideCount(), notices = view.getToastShowCount();
      old.respond({ success, message: "Old response" });
      assert.equal(document.querySelector("#confirm-exit-game").disabled, true);
      assert.equal(view.getModalHideCount(), hides);
      assert.equal(view.getToastShowCount(), notices);
      assert.equal(document.querySelector("#gameplay-view").classList.contains("d-none"), false);
    } finally { view.close(); }
  });
}


for (const success of [true, false]) {
  test(`an old settings ${success ? "success" : "failure"} preserves a reopened preset draft`, () => {
    const view = createClient({ savedRules: { "example-game": {
      presets: [{ name: "Fast", settings: { fast: true } }]
    } } });
    try {
      openPresetEditor(view);
      const modal = document.querySelector("#settings-modal");
      modal.dispatchEvent(new window.Event("show.bs.modal"));
      document.querySelector("#save-game-settings").click();
      const old = view.emitted.find(item => item.event === "update-game-settings");
      view.handlers.get("game-settings-updated")({ gameId: "example-game", settings: { fast: false } });
      modal.dispatchEvent(new window.Event("hide.bs.modal"));
      modal.dispatchEvent(new window.Event("hidden.bs.modal"));
      modal.dispatchEvent(new window.Event("show.bs.modal"));
      const select = document.querySelector("#rule-preset");
      select.value = "Fast"; select.dispatchEvent(new window.Event("change"));
      assert.equal(document.querySelector('[data-setting-key="fast"]').checked, true);
      document.querySelector("#rule-preset-name").value = "New draft";
      document.querySelector('[data-preset-action="save"]').click();
      const stored = localStorage.getItem("gamehub:rule-presets");
      const hides = view.getModalHideCount(), notices = view.getToastShowCount();
      old.respond({ success, message: "Old acknowledgement" });
      assert.equal(view.getModalHideCount(), hides);
      assert.equal(view.getToastShowCount(), notices);
      assert.equal(document.querySelector('[data-setting-key="fast"]').checked, true);
      assert.equal(localStorage.getItem("gamehub:rule-presets"), stored);
      assert.equal(view.emitted.filter(item => item.event === "update-game-settings").length, 1);
      document.querySelector("#save-game-settings").click();
      const current = view.emitted.filter(item => item.event === "update-game-settings").at(-1);
      assert.deepEqual(current.data.settings, { fast: true });
      current.respond({ success: true });
      assert.equal(view.getModalHideCount(), hides + 1);
      assert.equal(JSON.parse(localStorage.getItem("gamehub:rule-presets"))["example-game"].presets.length, 2);
    } finally { view.close(); }
  });
}

test("only the latest save in a settings visit can close the editor", () => {
  const view = createClient();
  try {
    openPresetEditor(view);
    document.querySelector("#save-game-settings").click();
    const first = view.emitted.filter(item => item.event === "update-game-settings").at(-1);
    document.querySelector('[data-setting-key="fast"]').checked = true;
    document.querySelector("#save-game-settings").click();
    const second = view.emitted.filter(item => item.event === "update-game-settings").at(-1);
    const hides = view.getModalHideCount();
    first.respond({ success: true });
    assert.equal(view.getModalHideCount(), hides);
    second.respond({ success: true });
    assert.equal(view.getModalHideCount(), hides + 1);
  } finally { view.close(); }
});

test("a settings reply from before reconnect cannot close a newer room's editor", () => {
  const view = createClient();
  try {
    openPresetEditor(view);
    document.querySelector("#save-game-settings").click();
    const old = view.emitted.find(item => item.event === "update-game-settings");
    view.handlers.get("disconnect")();
    view.handlers.get("room-resumed")({ roomCode: "NEW123", isHost: true, activeGameId: null,
      selectedGameId: "example-game", gameSettings: {}, role: "player" });
    document.querySelector("#settings-modal").dispatchEvent(new window.Event("show.bs.modal"));
    const hides = view.getModalHideCount();
    old.respond({ success: true });
    assert.equal(view.getModalHideCount(), hides);
  } finally { view.close(); }
});


for (const success of [true, false]) {
  test(`a stale Close Lobby ${success ? "success" : "failure"} cannot affect a newer confirmation`, () => {
    const view = createClient();
    try {
      const room = { roomCode: "OLD123", isHost: true, activeGameId: null, selectedGameId: null, gameSettings: {} };
      view.handlers.get("room-resumed")(room);
      document.querySelector("#confirm-close-lobby").click();
      const old = view.emitted.find(item => item.event === "close-room");
      view.handlers.get("room-closed")();
      view.handlers.get("room-resumed")({ ...room, roomCode: "NEW123" });
      document.querySelector("#confirm-close-lobby").click();
      const hides = view.getModalHideCount(), notices = view.getToastShowCount();
      old.respond({ success, message: "Old response" });
      assert.equal(document.querySelector("#confirm-close-lobby").disabled, true);
      assert.equal(view.getModalHideCount(), hides);
      assert.equal(view.getToastShowCount(), notices);
    } finally { view.close(); }
  });
}

test("a stale picker reply cannot unlock or close a newer selection", () => {
  const view = createClient();
  try {
    view.handlers.get("available-games")([game(), game({ id: "second-game" })]);
    const room = { roomCode: "OLD123", isHost: true, activeGameId: null, selectedGameId: "example-game", gameSettings: {} };
    view.handlers.get("room-resumed")(room);
    document.querySelector('[data-game-id="second-game"]').click();
    const old = view.emitted.filter(item => item.event === "select-game").at(-1);
    view.handlers.get("disconnect")();
    view.handlers.get("room-resumed")({ ...room, roomCode: "NEW123" });
    document.querySelector('[data-game-id="second-game"]').click();
    const hides = view.getModalHideCount();
    old.respond({ success: true });
    assert.equal(document.querySelector("#game-picker-grid").classList.contains("is-pending"), true);
    assert.equal(view.getModalHideCount(), hides);
  } finally { view.close(); }
});


test("changing a display option preserves choices saved by another tab", () => {
  const view = createClient();
  try {
    view.handlers.get("available-games")([game({ displayOptions: [{
      key: "tableColor", label: "Table", defaultValue: "green", choices: [
        { value: "green", label: "Green" }, { value: "blue", label: "Blue" }
      ]
    }] })]);
    localStorage.setItem("gamehub:display-options", JSON.stringify({
      "example-game": { cardStyle: "midnight" },
      "other-game": { tableColor: "red" }
    }));
    const select = document.querySelector("#display-example-game-tableColor");
    select.value = "blue";
    select.dispatchEvent(new window.Event("change"));
    assert.deepEqual(JSON.parse(localStorage.getItem("gamehub:display-options")), {
      "example-game": { cardStyle: "midnight", tableColor: "blue" },
      "other-game": { tableColor: "red" }
    });
  } finally { view.close(); }
});


for (const blockedReads of [false, true]) {
  test(`failed display writes recover temporary choices alongside external saves (reads ${blockedReads ? "blocked" : "allowed"})`, () => {
    const view = createClient();
    try {
      const choices = [{ value: "green", label: "Green" }, { value: "blue", label: "Blue" }];
      view.handlers.get("available-games")([game({ displayOptions: [
        { key: "tableColor", label: "Table", defaultValue: "green", choices },
        { key: "cardStyle", label: "Cards", defaultValue: "green", choices }
      ] })]);
      const prototype = window.Storage.prototype;
      const originalGet = prototype.getItem;
      const originalSet = prototype.setItem;
      const change = (key, value) => {
        const select = document.querySelector(`#display-example-game-${key}`);
        select.value = value;
        select.dispatchEvent(new window.Event("change"));
      };
      try {
        prototype.setItem = function(key, value) {
          if (key === "gamehub:display-options") throw new Error("Storage unavailable");
          return originalSet.call(this, key, value);
        };
        if (blockedReads) prototype.getItem = function(key) {
          if (key === "gamehub:display-options") throw new Error("Storage unavailable");
          return originalGet.call(this, key);
        };
        change("tableColor", "blue");
        change("cardStyle", "blue");
        originalSet.call(localStorage, "gamehub:display-options", JSON.stringify({ "other-game": { tableColor: "red" } }));
      } finally {
        prototype.getItem = originalGet;
        prototype.setItem = originalSet;
      }
      change("tableColor", "green");
      assert.deepEqual(JSON.parse(localStorage.getItem("gamehub:display-options")), {
        "example-game": { tableColor: "green", cardStyle: "blue" },
        "other-game": { tableColor: "red" }
      });
    } finally { view.close(); }
  });
}


test("rebinding one action preserves bindings saved in another tab", () => {
  const view = createClient();
  try {
    view.handlers.get("available-games")([game({ keybinds: [
      { id: "primary", label: "Primary", defaultKey: "Space" },
      { id: "secondary", label: "Secondary", defaultKey: "KeyQ" }
    ] })]);
    localStorage.setItem("gamehub:keybinds", JSON.stringify({
      general: { "settings": "KeyG" },
      "example-game": { secondary: "KeyZ" },
      "other-game": { primary: "KeyX" }
    }));
    document.querySelector("#keybind-body-example-game .game-keybind-button").click();
    document.dispatchEvent(new window.KeyboardEvent("keydown", { code: "KeyE", bubbles: true }));
    assert.deepEqual(JSON.parse(localStorage.getItem("gamehub:keybinds")), {
      general: { "settings": "KeyG" },
      "example-game": { primary: "KeyE", secondary: "KeyZ" },
      "other-game": { primary: "KeyX" }
    });
  } finally { view.close(); }
});


for (const key of ["Space", "Backspace"]) {
  test(`${key === "Space" ? "restoring a default key" : "unbinding an action"} preserves unrelated stored bindings`, () => {
    const view = createClient();
    try {
      view.handlers.get("available-games")([game({ keybinds: [
        { id: "primary", label: "Primary", defaultKey: "Space" },
        { id: "secondary", label: "Secondary", defaultKey: "KeyQ" }
      ] })]);
      localStorage.setItem("gamehub:keybinds", JSON.stringify({
        "example-game": { primary: "KeyX", secondary: "KeyZ" }
      }));
      document.querySelector("#keybind-body-example-game .game-keybind-button").click();
      document.dispatchEvent(new window.KeyboardEvent("keydown", { code: key, bubbles: true }));
      assert.deepEqual(JSON.parse(localStorage.getItem("gamehub:keybinds")), {
        "example-game": key === "Space" ? { secondary: "KeyZ" } : { primary: null, secondary: "KeyZ" }
      });
    } finally { view.close(); }
  });
}

for (const blockedReads of [false, true]) {
  test(`failed keybind writes recover local changes alongside external saves (reads ${blockedReads ? "blocked" : "allowed"})`, () => {
    const view = createClient();
    try {
      view.handlers.get("available-games")([game({ keybinds: [
        { id: "primary", label: "Primary", defaultKey: "Space" },
        { id: "secondary", label: "Secondary", defaultKey: "KeyQ" }
      ] })]);
      const prototype = window.Storage.prototype;
      const originalGet = prototype.getItem;
      const originalSet = prototype.setItem;
      const change = (index, code) => {
        document.querySelectorAll("#keybind-body-example-game .game-keybind-button")[index].click();
        document.dispatchEvent(new window.KeyboardEvent("keydown", { code, bubbles: true }));
      };
      try {
        prototype.setItem = function(key, value) {
          if (key === "gamehub:keybinds") throw new Error("Storage unavailable");
          return originalSet.call(this, key, value);
        };
        if (blockedReads) prototype.getItem = function(key) {
          if (key === "gamehub:keybinds") throw new Error("Storage unavailable");
          return originalGet.call(this, key);
        };
        change(0, "KeyE");
        change(1, "KeyR");
        originalSet.call(localStorage, "gamehub:keybinds", JSON.stringify({ general: { settings: "KeyG" } }));
      } finally {
        prototype.getItem = originalGet;
        prototype.setItem = originalSet;
      }
      change(0, "Space");
      assert.deepEqual(JSON.parse(localStorage.getItem("gamehub:keybinds")), {
        general: { settings: "KeyG" }, "example-game": { secondary: "KeyR" }
      });
    } finally { view.close(); }
  });
}


for (const role of ["host", "player", "spectator"]) {
  test(`the ${role} exit confirmation waits until Settings finishes closing`, () => {
    const view = createClient();
    try {
      view.handlers.get("available-games")([game()]);
      view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: role === "host",
        role: role === "spectator" ? "spectator" : "player", activeGameId: "example-game",
        hasActiveGame: true, selectedGameId: "example-game", gameSettings: {}, chatEnabled: true });
      const settings = document.querySelector("#app-settings-modal");
      settings.classList.add("show");
      const shows = view.getModalShowCount();
      document.querySelector("#app-game-exit").click();
      assert.equal(view.getModalShowCount(), shows);
      settings.classList.remove("show");
      settings.dispatchEvent(new window.Event("hidden.bs.modal"));
      assert.equal(view.getModalShowCount(), shows + 1);
    } finally { view.close(); }
  });
}

for (const event of ["game-ended", "disconnect"]) {
  test(`a pending Settings exit handoff is cancelled by ${event}`, () => {
    const view = createClient();
    try {
      view.handlers.get("available-games")([game()]);
      view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: true, role: "player",
        activeGameId: "example-game", hasActiveGame: true, selectedGameId: "example-game", gameSettings: {}, chatEnabled: true });
      const settings = document.querySelector("#app-settings-modal");
      settings.classList.add("show");
      document.querySelector("#app-game-exit").click();
      view.handlers.get(event)(event === "game-ended" ? { winnerId: null, message: "Finished", returningMemberIds: [] } : undefined);
      const shows = view.getModalShowCount();
      settings.classList.remove("show");
      settings.dispatchEvent(new window.Event("hidden.bs.modal"));
      assert.equal(view.getModalShowCount(), shows);
    } finally { view.close(); }
  });
}


test("a rejected obsolete player lock cannot unlock a newer room request", async () => {
  let rejectClaim;
  const view = createClient({ savedSessions: [savedPlayer("Guest", "guest")], locks: {
    request: () => new Promise((_resolve, reject) => { rejectClaim = reject; })
  } });
  try {
    await new Promise(resolve => setImmediate(resolve));
    document.querySelector("#rejoin-as-new-player").click();
    assert.equal(typeof rejectClaim, "function");
    view.handlers.get("disconnect")();
    document.querySelector("#player-name").value = "New Host";
    document.querySelector("#create-room").click();
    assert.ok(view.emitted.some(item => item.event === "create-room"));
    assert.equal(document.querySelector("#create-room").disabled, true);
    const toasts = view.getToastShowCount();
    rejectClaim(new Error("Old lock rejected"));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(document.querySelector("#create-room").disabled, true);
    assert.equal(view.getToastShowCount(), toasts);
  } finally { view.close(); }
});


test("a current player-lock rejection restores retry controls and reports its failure", async () => {
  let rejectClaim;
  const view = createClient({ savedSessions: [savedPlayer("Guest", "guest")], locks: {
    request: () => new Promise((_resolve, reject) => { rejectClaim = reject; })
  } });
  try {
    await new Promise(resolve => setImmediate(resolve));
    document.querySelector("#rejoin-as-new-player").click();
    const toasts = view.getToastShowCount();
    rejectClaim(new Error("Lock rejected"));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(document.querySelector("#create-room").disabled, false);
    assert.equal(document.querySelector("#rejoin-as-new-player").disabled, false);
    assert.equal(view.getToastShowCount(), toasts + 1);
  } finally { view.close(); }
});


for (const automatic of [false, true]) {
  test(`${automatic ? "automatic" : "manual"} restoration lock failure stops recovery and keeps a retry offer`, async () => {
    let rejectClaim;
    const locks = { request: () => new Promise((_resolve, reject) => { rejectClaim = reject; }) };
    const view = createClient(automatic ? { savedRoom: "ABC123", locks } : { savedSessions: [savedPlayer("Guest", "guest")], locks });
    try {
      if (automatic) view.handlers.get("connect")();
      else {
        await settleRejoin();
        document.querySelector("#rejoin-room").click();
      }
      assert.equal(document.querySelector("#reconnecting-overlay").hidden, false);
      rejectClaim(new Error("Lock rejected"));
      await settleRejoin();
      assert.equal(document.querySelector("#reconnecting-overlay").hidden, true);
      assert.equal(document.querySelector("#rejoin-room-modal").classList.contains("show"), true);
      assert.equal(document.querySelector("#rejoin-room").disabled, false);
      assert.equal(JSON.parse(localStorage.getItem("gamehub:saved-sessions")).length, 1);
    } finally { view.close(); }
  });
}


for (const role of ["player", "spectator"]) {
  test(`leaving as a ${role} clears stale in-game disconnect status`, () => {
    const view = createClient();
    try {
      view.handlers.get("available-games")([game()]);
      view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: false, role,
        activeGameId: "example-game", hasActiveGame: true, selectedGameId: "example-game", gameSettings: {}, chatEnabled: true });
      view.handlers.get("game-lifecycle")({ gameId: "example-game", isPaused: true, isBusy: false,
        disconnections: [{ id: "missing", name: "Missing Player", autoPlayAt: null, autoPlaying: false }] });
      assert.match(document.querySelector("#app-disconnect-status").textContent, /Missing Player/);
      document.querySelector(role === "player" ? "#confirm-leave-game" : "#confirm-leave-spectator").click();
      view.emitted.find(item => item.event === "leave-game").respond({ success: true, hasActiveGame: true });
      assert.equal(document.querySelector("#app-disconnect-status").textContent, "");
    } finally { view.close(); }
  });
}


test("an old join-approval failure cannot change a newer room's policy", () => {
  const view = createClient();
  try {
    const resume = roomCode => view.handlers.get("room-resumed")({ roomCode, isHost: true,
      role: "player", activeGameId: null, hasActiveGame: false, selectedGameId: null, gameSettings: {} });
    resume("OLD123");
    const checkbox = document.querySelector("#require-join-approval");
    checkbox.checked = true;
    checkbox.dispatchEvent(new window.Event("change"));
    const old = view.emitted.find(item => item.event === "set-room-approval");
    view.handlers.get("disconnect")();
    resume("NEW123");
    view.handlers.get("room-approval-changed")({ requiresJoinApproval: true });
    const toasts = view.getToastShowCount();
    old.respond({ success: false, message: "Old failure" });
    assert.equal(checkbox.checked, true);
    assert.equal(view.getToastShowCount(), toasts);
  } finally { view.close(); }
});

test("join-approval failures restore confirmed policy rather than invert a newer toggle", () => {
  const view = createClient();
  try {
    view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: true, role: "player",
      activeGameId: null, hasActiveGame: false, selectedGameId: null, gameSettings: {} });
    view.handlers.get("room-approval-changed")({ requiresJoinApproval: false });
    const checkbox = document.querySelector("#require-join-approval");
    for (const checked of [true, false]) {
      checkbox.checked = checked;
      checkbox.dispatchEvent(new window.Event("change"));
    }
    const requests = view.emitted.filter(item => item.event === "set-room-approval");
    requests[0].respond({ success: false, message: "Rejected" });
    assert.equal(checkbox.checked, false);
    requests[1].respond({ success: false, message: "Rejected" });
    assert.equal(checkbox.checked, false);
  } finally { view.close(); }
});


test("Settings pause failures only notify in the requesting game lifecycle", async () => {
  const view = createClient();
  try {
    const room = { roomCode: "OLD123", isHost: true, role: "player",
      activeGameId: "example-game", hasActiveGame: true, selectedGameId: "example-game",
      gameSettings: {}, chatEnabled: true };
    view.handlers.get("available-games")([game()]);
    view.handlers.get("room-resumed")(room);
    document.querySelector("#app-game-pause-toggle").click();
    const old = view.emitted.filter(item => item.event === "toggle-game-pause").at(-1);
    view.handlers.get("disconnect")();
    view.handlers.get("room-resumed")({ ...room, roomCode: "NEW123" });
    const notices = view.getToastShowCount();
    old.respond({ success: false, message: "Old pause failure" });
    await Promise.resolve();
    assert.equal(view.getToastShowCount(), notices);
    document.querySelector("#app-game-pause-toggle").click();
    view.emitted.filter(item => item.event === "toggle-game-pause").at(-1)
      .respond({ success: false, message: "Current pause failure" });
    await Promise.resolve();
    assert.equal(view.getToastShowCount(), notices + 1);
  } finally { view.close(); }
});


test("number settings round to a valid step without exceeding the upper bound", () => {
  for (const [max, expected] of [[14, 10], [15, 15]]) {
    const view = createClient();
    try {
      const definition = game({ settings: [{ type: "number", control: "range", key: "seconds",
        label: "Wait", description: "Seconds", defaultValue: 5, min: 5, max, step: 5 }] });
      view.handlers.get("available-games")([definition]);
      view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: true, role: "player",
        selectedGameId: definition.id, gameSettings: { seconds: 5 }, activeGameId: null });
      view.handlers.get("game-selected")({ gameId: definition.id, settings: { seconds: 5 } });
      const input = document.querySelector("#setting-seconds");
      input.value = "14";
      input.dispatchEvent(new window.Event("change"));
      assert.equal(Number(input.value), expected);
      assert.equal(document.querySelector("#settings-modal-body input[type=range]").value, String(expected));
      document.querySelector("#save-game-settings").click();
      const save = view.emitted.filter(item => item.event === "update-game-settings").at(-1);
      assert.equal(save.data.settings.seconds, expected);
    } finally { view.close(); }
  }
});


test("a delayed rejoin offer waits until another modal finishes closing", async () => {
  let releaseQuery;
  let delay = true;
  const view = createClient({ savedSessions: [savedPlayer("Guest", "guest")], locks: {
    query: () => delay ? new Promise(resolve => { releaseQuery = resolve; }) : Promise.resolve({ held: [] })
  } });
  try {
    const settings = document.querySelector("#app-settings-modal");
    settings.classList.add("show");
    settings.setAttribute("aria-modal", "true");
    releaseQuery({ held: [] });
    delay = false;
    await settleRejoin();
    assert.equal(view.getModalShowCount(), 0);
    settings.classList.remove("show");
    window.dispatchEvent(new window.StorageEvent("storage", { key: "gamehub:saved-sessions" }));
    await settleRejoin();
    assert.equal(view.getModalShowCount(), 0, "a closing modal still owns its backdrop");
    settings.removeAttribute("aria-modal");
    settings.dispatchEvent(new window.Event("hidden.bs.modal", { bubbles: true }));
    await settleRejoin();
    assert.equal(view.getModalShowCount(), 1);
    document.querySelector("#rejoin-room").click();
    assert.equal(view.emitted.filter(item => item.event === "resume-room").at(-1).data.resumeToken, "guest");
  } finally { view.close(); }
});


test("gameplay shortcuts wait until a closing modal releases its modal state", () => {
  const view = createClient(); let actions = 0;
  try {
    view.handlers.get("available-games")([game({ keybinds: [{ id: "primary", label: "Primary", defaultKey: "KeyR" }] })]);
    view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: false, selectedGameId: "example-game", gameSettings: {},
      activeGameId: "example-game", role: "player", isLocked: false, isPaused: false, chatEnabled: true });
    view.gameClientContexts[0].input.onAction("primary", () => actions++);
    const modal = document.querySelector("#app-settings-modal");
    modal.setAttribute("aria-modal", "true");
    document.body.dispatchEvent(new window.KeyboardEvent("keydown", { code: "KeyR", bubbles: true }));
    assert.equal(actions, 0, "closing modal still blocks underlying gameplay");
    modal.removeAttribute("aria-modal");
    document.body.dispatchEvent(new window.KeyboardEvent("keydown", { code: "KeyR", bubbles: true }));
    assert.equal(actions, 1, "gameplay resumes after modal cleanup");
  } finally { view.close(); }
});


test("Settings shortcut cannot open over another modal's closing transition", () => {
  const view = createClient();
  try {
    const modal = document.querySelector("#leave-game-modal");
    modal.setAttribute("aria-modal", "true");
    const before = view.getModalShowCount();
    document.body.dispatchEvent(new window.KeyboardEvent("keydown", { code: "Escape", bubbles: true }));
    assert.equal(view.getModalShowCount(), before, "Settings stays closed until the other dialog releases modal state");
    modal.removeAttribute("aria-modal");
    document.body.dispatchEvent(new window.KeyboardEvent("keydown", { code: "Escape", bubbles: true }));
    assert.equal(view.getModalShowCount(), before + 1);
  } finally { view.close(); }
});


for (const code of ["Space", "Enter", "NumpadEnter"]) {
  test(`Settings rebound to ${code} preserves focused button activation`, () => {
    const view = createClient();
    try {
      document.querySelector("#keybind-body-general .game-keybind-button").click();
      document.dispatchEvent(new window.KeyboardEvent("keydown", { code, bubbles: true }));
      const before = view.getModalShowCount();
      const event = new window.KeyboardEvent("keydown", { code, bubbles: true, cancelable: true });
      document.querySelector("#create-room").dispatchEvent(event);
      assert.equal(view.getModalShowCount(), before, "Settings must not consume a button activation key");
      assert.equal(event.defaultPrevented, false);
      document.body.dispatchEvent(new window.KeyboardEvent("keydown", { code, bubbles: true }));
      assert.equal(view.getModalShowCount(), before + 1, "the rebound Settings shortcut still works elsewhere");
    } finally { view.close(); }
  });
}


for (const stale of [false, true]) {
  test(`${stale ? "obsolete" : "current"} lobby kick replies ${stale ? "stay silent after a room change" : "still notify"}`, () => {
    const view = createClient();
    try {
      document.querySelector("#create-room").click();
      view.emitted.find(item => item.event === "create-room").respond({ success: true, roomCode: "ABC123", resumeToken: "old-token" });
      view.handlers.get("player-list")([
        { id: "host", name: "Host", avatar: "H", isHost: true, isConnected: true },
        { id: "guest", name: "Guest", avatar: "G", isHost: false, isConnected: true }
      ]);
      document.querySelector('#player-list button[aria-label="Kick Guest"]').click();
      const request = view.emitted.find(item => item.event === "kick-player");
      if (stale) {
        view.handlers.get("room-closed")();
        document.querySelector("#create-room").click();
        view.emitted.filter(item => item.event === "create-room").at(-1).respond({ success: true, roomCode: "NEW123", resumeToken: "new-token" });
      }
      const before = view.getToastShowCount();
      request.respond({ success: false, message: "The old target is no longer in this room." });
      assert.equal(view.getToastShowCount(), before + (stale ? 0 : 1));
    } finally { view.close(); }
  });
}


for (const action of ["lock", "lobby-transfer", "settings-transfer", "join-review"]) {
  for (const stale of [false, true]) {
    test(`${stale ? "obsolete" : "current"} ${action} replies ${stale ? "stay silent after a room change" : "still report failures"}`, () => {
      const view = createClient();
      try {
        document.querySelector("#create-room").click();
        view.emitted.find(item => item.event === "create-room").respond({ success: true, roomCode: "ABC123", resumeToken: "old-token" });
        view.handlers.get("player-list")([
          { id: "host", name: "Host", avatar: "H", isHost: true, isConnected: true },
          { id: "guest", name: "Guest", avatar: "G", isHost: false, isConnected: true }
        ]);
        if (action === "join-review") view.handlers.get("join-requests")([
          { id: "waiting", name: "Waiting", avatar: "W" }
        ]);
        const selector = action === "lock" ? "#toggle-room-lock"
          : action === "join-review" ? '#pending-join-requests button[aria-label="Accept Waiting"]'
          : action === "lobby-transfer" ? '#player-list button[aria-label="Make Guest the host"]' : "#transfer-host";
        document.querySelector(selector).click();
        const request = view.emitted.find(item => item.event === (action === "lock" ? "set-room-locked" : action === "join-review" ? "review-join-request" : "transfer-host"));
        assert.ok(request);
        if (stale) {
          view.handlers.get("room-closed")();
          document.querySelector("#create-room").click();
          view.emitted.filter(item => item.event === "create-room").at(-1).respond({ success: true, roomCode: "NEW123", resumeToken: "new-token" });
        }
        const before = view.getToastShowCount();
        request.respond({ success: false, message: "Old room request failed." });
        assert.equal(view.getToastShowCount(), before + (stale ? 0 : 1));
      } finally { view.close(); }
    });
  }
}


test("a restored locked-room snapshot immediately shows the confirmed lock state", () => {
  const view = createClient();
  try {
    view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: true, role: "player",
      selectedGameId: null, gameSettings: {}, activeGameId: null, isLocked: true });
    assert.equal(document.querySelector("#room-lock-status").textContent, "Lobby Locked");
    assert.equal(document.querySelector("#toggle-room-lock").textContent, "Unlock Lobby");
    document.querySelector("#toggle-room-lock").click();
    assert.equal(view.emitted.find(item => item.event === "set-room-locked").data.isLocked, false);
  } finally { view.close(); }
});


for (const method of ["submitAction", "sendChat", "removeMember", "requestPause"]) {
  test(`disconnected game ${method} fails immediately without buffering a request`, async () => {
    const view = createClient();
    try {
      view.handlers.get("available-games")([game()]);
      view.handlers.get("room-resumed")({ roomCode: "ABC123", playerName: "Host", isHost: true,
        role: "player", selectedGameId: "example-game", gameSettings: {}, activeGameId: "example-game", isLocked: false });
      const context = view.gameClientContexts.at(-1);
      view.socket.connected = false;
      view.handlers.get("disconnect")();
      const before = view.emitted.length;
      const pending = context[method](method === "submitAction" ? { type: "advance" } : method === "requestPause" ? true : "test");
      const requests = view.emitted.slice(before);
      // Settle an accidentally emitted request as well, so failure never hangs the test.
      requests.forEach(request => request.respond?.({ success: true }));
      const result = await pending;
      assert.deepEqual(requests, []);
      assert.equal(result.success, false);
      assert.match(result.message, /reconnect/i);
    } finally { view.close(); }
  });
}

test("game shortcuts do not fire while disconnected", () => {
  const view = createClient();
  try {
    view.handlers.get("available-games")([game({ keybinds: [{ id: "advance", label: "Advance", defaultKey: "KeyE" }] })]);
    view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: true, role: "player",
      selectedGameId: "example-game", gameSettings: {}, activeGameId: "example-game", isLocked: false });
    let calls = 0;
    view.gameClientContexts.at(-1).input.onAction("advance", () => calls++);
    view.socket.connected = false;
    view.handlers.get("disconnect")();
    document.body.dispatchEvent(new window.KeyboardEvent("keydown", { code: "KeyE", bubbles: true, cancelable: true }));
    assert.equal(calls, 0);
    view.socket.connected = true;
    document.body.dispatchEvent(new window.KeyboardEvent("keydown", { code: "KeyE", bubbles: true, cancelable: true }));
    assert.equal(calls, 1);
  } finally { view.close(); }
});


for (const action of ["lock", "kick", "transfer", "approval"]) {
  test(`offline lobby ${action} fails without queuing a room change`, () => {
    const view = createClient();
    try {
      view.handlers.get("available-games")([game()]);
      view.handlers.get("room-resumed")({ roomCode: "ABC123", isHost: true, role: "player",
        selectedGameId: "example-game", gameSettings: {}, activeGameId: null, isLocked: false });
      view.handlers.get("player-list")([
        { id: "host", name: "Host", avatar: "H", isHost: true, isConnected: true },
        { id: "guest", name: "Guest", avatar: "G", isHost: false, isConnected: true }
      ]);
      view.socket.connected = false;
      view.handlers.get("disconnect")();
      const before = view.emitted.length;
      const toasts = view.getToastShowCount();
      if (action === "approval") {
        const input = document.querySelector("#require-join-approval");
        input.checked = true;
        input.dispatchEvent(new window.Event("change", { bubbles: true }));
        assert.equal(input.checked, false);
      } else {
        const selector = action === "lock" ? "#toggle-room-lock"
          : action === "kick" ? '#player-list button[aria-label="Kick Guest"]'
          : '#player-list button[aria-label="Make Guest the host"]';
        document.querySelector(selector).click();
      }
      assert.equal(view.emitted.length, before);
      assert.equal(view.getToastShowCount(), toasts + 1);
    } finally { view.close(); }
  });
}


test("graphics preferences default off, persist, and follow cross-tab updates without changing themes", () => {
  let view = createClient();
  try {
    const tabs = [...document.querySelectorAll(".app-settings-navigation [role=tab]")].map(tab => tab.textContent.trim());
    assert.deepEqual(tabs, ["Game", "Graphics", "Audio", "Keybinds"]);
    assert.ok(document.querySelector("#app-settings-graphics-panel #game-display-sections"));
    const toggle = document.querySelector("#background-blur");
    assert.equal(toggle.checked, false);
    assert.equal(document.body.classList.contains("background-blur-enabled"), false);
    localStorage.setItem("gamehub:display-options", '{"example-game":{"cardStyle":"midnight"}}');
    toggle.click();
    assert.equal(localStorage.getItem("gamehub:gameplay-blur"), "true");
    assert.equal(document.body.classList.contains("background-blur-enabled"), true);
    assert.equal(JSON.parse(localStorage.getItem("gamehub:display-options"))["example-game"].cardStyle, "midnight");
  } finally { view.close(); }
  view = createClient({ savedGameplayBlur: "true" });
  try {
    assert.equal(document.querySelector("#background-blur").checked, true);
    assert.equal(document.body.classList.contains("background-blur-enabled"), true);
    localStorage.removeItem("gamehub:gameplay-blur");
    window.dispatchEvent(new window.StorageEvent("storage", { key: "gamehub:gameplay-blur" }));
    assert.equal(document.querySelector("#background-blur").checked, false);
    assert.equal(document.body.classList.contains("background-blur-enabled"), false);
  } finally { view.close(); }
});


test("general performance controls persist independently and follow storage changes", () => {
  const ids = ["reduce-shadows", "simple-backgrounds", "reduce-interface-motion", "disable-game-previews", "reduce-transparency"];
  let view = createClient();
  try {
    for (const id of ids) {
      const input = document.getElementById(id);
      assert.equal(input.checked, false);
      assert.ok(document.querySelector("#app-settings-graphics-panel").contains(input));
      input.click();
      assert.equal(document.body.classList.contains(id), true);
      assert.equal(localStorage.getItem(`gamehub:graphics:${id}`), "true");
    }
    assert.equal(localStorage.getItem("gamehub:gameplay-blur"), null);
    assert.equal(localStorage.getItem("gamehub:display-options"), null);
  } finally { view.close(); }
  view = createClient({ savedGraphics: Object.fromEntries(ids.map(id => [id, true])) });
  try {
    for (const id of ids) {
      assert.equal(document.getElementById(id).checked, true);
      assert.equal(document.body.classList.contains(id), true);
    }
    localStorage.removeItem("gamehub:graphics:reduce-shadows");
    window.dispatchEvent(new window.StorageEvent("storage", { key: "gamehub:graphics:reduce-shadows" }));
    assert.equal(document.body.classList.contains("reduce-shadows"), false);
    assert.equal(document.body.classList.contains("reduce-transparency"), true);
    localStorage.clear();
    window.dispatchEvent(new window.StorageEvent("storage", { key: null }));
    for (const id of ids) assert.equal(document.body.classList.contains(id), false);
  } finally { view.close(); }
});

test("disabling previews stops and unloads videos and keeps poster-only previews after rerenders", () => {
  const view = createClient();
  try {
    let paused = 0, unloaded = 0;
    window.HTMLMediaElement.prototype.pause = () => { paused++; };
    window.HTMLMediaElement.prototype.load = () => { unloaded++; };
    view.handlers.get("available-games")([game()]);
    const original = document.querySelector(".game-picker-preview-video");
    assert.ok(original);
    document.querySelector("#disable-game-previews").click();
    assert.equal(paused, 1);
    assert.equal(unloaded, 1);
    assert.equal(original.hasAttribute("src"), false);
    assert.equal(document.querySelector(".game-picker-preview-video"), null);
    assert.match(document.querySelector(".game-picker-preview").style.backgroundImage, /poster.webp/);
    view.handlers.get("available-games")([game()]);
    assert.equal(document.querySelector("video"), null);
    document.querySelector("#disable-game-previews").click();
    assert.equal(document.querySelector(".game-picker-preview-video").autoplay, true);
  } finally { view.close(); }
});
