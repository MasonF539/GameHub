const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

// Mounts the real template and client script in jsdom and returns helpers.
function mountClient({ chatEnabled = true } = {}) {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "public", "template.html"),
    "utf8"
  );
  const dom = new JSDOM(html, { url: "http://localhost" });

  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  global.CSS = dom.window.CSS ?? { escape: (value) => String(value) };
  if (!global.CSS.escape) global.CSS.escape = (value) => String(value);
  window.matchMedia = () => ({ matches: false });
  window.GameHubAudio = { playEffect() {}, setScene() {} };
  global.bootstrap = {
    Toast: { getOrCreateInstance: () => ({ show() {} }) },
    Modal: {
      getInstance: () => null,
      getOrCreateInstance: () => ({ hide() {}, show() {} })
    }
  };

  const modulePath = require.resolve("../public/client.js");
  delete require.cache[modulePath];
  const { egyptianWarClientModule } = require(modulePath);

  const context = {
    memberId: "me",
    role: "player",
    isHost: false,
    launchData: { settings: {}, chatEnabled, isPaused: false },
    submitAction: async () => ({ success: true }),
    removeMember: async () => ({ success: true }),
    requestLeave() {},
    requestExit() {},
    notify() {}
  };
  const instance = egyptianWarClientModule.mount(context);

  const el = (selector) => document.querySelector(selector);
  const panel = el("#egyptian-war-side-panel");
  const bubble = el("#open-game-side-panel");
  const arrow = el("#toggle-game-side-panel");
  const minimize = el("#minimize-game-side-panel");
  const badge = el("#egyptian-war-chat-badge");

  return {
    instance,
    panel,
    bubble,
    arrow,
    minimize,
    badge,
    isOpen: () => !panel.hidden && bubble.hidden,
    isClosed: () => panel.hidden && !bubble.hidden,
    isLarge: () => panel.classList.contains("is-expanded"),
    sendChat: (senderId, message = "hi") =>
      instance.receivePlatformEvent({
        type: "chat-message",
        payload: { senderId, senderName: senderId, message }
      }),
    close() {
      instance.destroy();
      dom.window.close();
      delete global.window;
      delete global.document;
      delete global.localStorage;
    }
  };
}

test("the side panel starts open at medium size", () => {
  const view = mountClient();

  try {
    assert.equal(view.isOpen(), true);
    assert.equal(view.isLarge(), false);
    // aria-expanded describes the panel the bubble controls.
    assert.equal(view.bubble.getAttribute("aria-expanded"), "true");
  } finally {
    view.close();
  }
});

test("the arrow still switches between medium and large", () => {
  const view = mountClient();

  try {
    view.arrow.click();
    assert.equal(view.isLarge(), true);
    assert.equal(view.arrow.getAttribute("aria-label"), "Collapse panel");
    view.arrow.click();
    assert.equal(view.isLarge(), false);
    assert.equal(view.arrow.getAttribute("aria-label"), "Expand panel");
  } finally {
    view.close();
  }
});

test("the corner button collapses to the chat bubble and it reopens to the same size", () => {
  const view = mountClient();

  try {
    // medium -> circle -> medium
    view.minimize.click();
    assert.equal(view.isClosed(), true);
    assert.equal(view.bubble.getAttribute("aria-expanded"), "false");
    assert.equal(document.activeElement, view.bubble);
    view.bubble.click();
    assert.equal(view.isOpen(), true);
    assert.equal(view.isLarge(), false);

    // large -> circle -> large
    view.arrow.click();
    assert.equal(view.isLarge(), true);
    view.minimize.click();
    assert.equal(view.isClosed(), true);
    view.bubble.click();
    assert.equal(view.isOpen(), true);
    assert.equal(view.isLarge(), true);

    // and the arrow keeps working from there
    view.arrow.click();
    assert.equal(view.isLarge(), false);
  } finally {
    view.close();
  }
});

test("reopening puts focus on the selected tab", () => {
  const view = mountClient();

  try {
    view.minimize.click();
    view.bubble.click();
    assert.equal(document.activeElement, document.querySelector("#show-game-chat"));
  } finally {
    view.close();
  }
});

test("a new game starts at medium again", () => {
  const view = mountClient();

  try {
    view.arrow.click();
    view.minimize.click();
    view.instance.destroy();

    const { egyptianWarClientModule } = require("../public/client.js");
    egyptianWarClientModule.mount({
      memberId: "me",
      role: "player",
      isHost: false,
      launchData: { settings: {}, chatEnabled: true, isPaused: false },
      submitAction: async () => ({ success: true }),
      removeMember: async () => ({ success: true }),
      requestLeave() {},
      requestExit() {},
      notify() {}
    });
    assert.equal(view.isOpen(), true);
    assert.equal(view.isLarge(), false);
  } finally {
    view.close();
  }
});

test("messages from other players show an unread badge while collapsed", () => {
  const view = mountClient();

  try {
    view.sendChat("other");
    assert.equal(view.badge.hidden, true, "no badge while the panel is open");

    view.minimize.click();
    view.sendChat("me");
    assert.equal(view.badge.hidden, true, "your own messages are not unread");

    view.sendChat("other");
    view.sendChat("someone");
    assert.equal(view.badge.hidden, false);
    assert.equal(view.badge.textContent, "2");
    assert.match(view.bubble.getAttribute("aria-label"), /2 new messages/);

    view.bubble.click();
    assert.equal(view.badge.hidden, true);
    assert.equal(view.bubble.getAttribute("aria-label"), "Open chat");
  } finally {
    view.close();
  }
});

test("the badge caps at 9+", () => {
  const view = mountClient();

  try {
    view.minimize.click();
    for (let index = 0; index < 12; index += 1) view.sendChat("other");
    assert.equal(view.badge.textContent, "9+");
  } finally {
    view.close();
  }
});
