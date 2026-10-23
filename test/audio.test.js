const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

test("switches music scenes and independently adjusts persisted audio categories", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "public", "index.html"),
    "utf8"
  );
  const audioScript = fs.readFileSync(
    path.join(__dirname, "..", "public", "audio.js"),
    "utf8"
  );
  const dom = new JSDOM(html, {
    url: "http://localhost",
    runScripts: "outside-only"
  });
  const audioInstances = [];

  class FakeAudio {
    constructor(source = "") {
      this.src = source;
      this.currentTime = 0;
      this.loop = false;
      this.preload = "";
      this.volume = 1;
      this.playCount = 0;
      this.pauseCount = 0;
      audioInstances.push(this);
    }

    play() {
      this.playCount += 1;
      return Promise.resolve();
    }

    pause() {
      this.pauseCount += 1;
    }

    load() {}

    removeAttribute(attribute) {
      if (attribute === "src") {
        this.src = "";
      }
    }

    cloneNode() {
      const clone = new FakeAudio(this.src);
      clone.volume = this.volume;
      return clone;
    }
  }

  dom.window.Audio = FakeAudio;
  Object.defineProperty(dom.window.document, "hidden", {
    configurable: true,
    value: false
  });
  dom.window.eval(audioScript);

  const music = audioInstances[0];
  const audio = dom.window.GameHubAudio;
  audio.registerMusicScene("test-game", "/games/test-game/music.mp3");
  audio.registerEffect("test-action", {
    source: "/games/test-game/action.mp3",
    category: "game",
    volume: 0.9
  });
  const musicVolume = dom.window.document.querySelector(
    "#audio-music-volume"
  );
  const musicVolumeValue = dom.window.document.querySelector(
    "#audio-music-volume-value"
  );
  const joinVolume = dom.window.document.querySelector(
    "#audio-join-volume"
  );
  const gameVolume = dom.window.document.querySelector(
    "#audio-game-volume"
  );

  audio.setScene("menu");
  assert.match(music.src, /menu-lobby\.mp3$/);
  assert.equal(music.playCount, 0);

  dom.window.document.dispatchEvent(new dom.window.Event("pointerdown"));
  assert.equal(music.playCount, 1);

  audio.setScene("test-game");
  assert.match(music.src, /test-game\/music\.mp3$/);
  assert.equal(music.playCount, 2);

  audio.playEffect("test-action");
  assert.match(audioInstances.at(-1).src, /test-game\/action\.mp3$/);
  assert.equal(audioInstances.at(-1).playCount, 1);

  audio.playEffect("game-finished");
  assert.match(audioInstances.at(-1).src, /game-finished\.mp3$/);
  assert.equal(audioInstances.at(-1).playCount, 1);

  musicVolume.value = "50";
  musicVolume.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  assert.equal(music.volume, 0.21);
  assert.equal(musicVolumeValue.textContent, "50%");

  gameVolume.value = "25";
  gameVolume.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  audio.playEffect("test-action");
  assert.equal(audioInstances.at(-1).volume, 0.225);

  joinVolume.value = "0";
  joinVolume.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  const instanceCountWithJoinDisabled = audioInstances.length;
  audio.playEffect("player-join");
  assert.equal(audioInstances.length, instanceCountWithJoinDisabled);

  audio.playEffect("test-action");
  assert.equal(audioInstances.length, instanceCountWithJoinDisabled + 1);

  musicVolume.value = "0";
  musicVolume.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  assert.equal(music.volume, 0);

  const saved = JSON.parse(
    dom.window.localStorage.getItem("gamehub:audio-settings")
  );
  assert.deepEqual(saved, {
    music: 0,
    join: 0,
    game: 0.25
  });

  dom.window.close();
});


test("changing one audio category preserves volumes saved by another tab", () => {
  const dom = new JSDOM('<input id="audio-game-volume" type="range">', {
    url: "http://localhost", runScripts: "outside-only"
  });
  dom.window.Audio = class {
    play() { return Promise.resolve(); }
    pause() {}
  };
  try {
    dom.window.eval(fs.readFileSync(path.join(__dirname, "..", "public", "audio.js"), "utf8"));
    dom.window.localStorage.setItem("gamehub:audio-settings", JSON.stringify({ music: 0.3, join: 0, game: 0.8 }));
    dom.window.GameHubAudio.setCategoryVolume("game", 0.4);
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem("gamehub:audio-settings")), {
      music: 0.3, join: 0, game: 0.4
    });
  } finally { dom.window.close(); }
});


for (const blockedReads of [false, true]) {
  test(`temporary audio choices recover without replacing other volumes (reads ${blockedReads ? "blocked" : "allowed"})`, () => {
    const dom = new JSDOM("", { url: "http://localhost", runScripts: "outside-only" });
    dom.window.Audio = class {
      play() { return Promise.resolve(); }
      pause() {}
    };
    try {
      dom.window.eval(fs.readFileSync(path.join(__dirname, "..", "public", "audio.js"), "utf8"));
      const storage = dom.window.localStorage;
      const prototype = dom.window.Storage.prototype;
      const originalGet = prototype.getItem;
      const originalSet = prototype.setItem;
      const audio = dom.window.GameHubAudio;
      try {
        prototype.setItem = function(key, value) {
          if (key === "gamehub:audio-settings") throw new Error("Storage unavailable");
          return originalSet.call(this, key, value);
        };
        if (blockedReads) prototype.getItem = function(key) {
          if (key === "gamehub:audio-settings") throw new Error("Storage unavailable");
          return originalGet.call(this, key);
        };
        audio.setCategoryVolume("music", 0.2);
        audio.setCategoryEnabled("join", false);
        originalSet.call(storage, "gamehub:audio-settings", JSON.stringify({ music: 0.8, join: 0.8, game: 0.6 }));
      } finally {
        prototype.getItem = originalGet;
        prototype.setItem = originalSet;
      }
      audio.setCategoryVolume("join", 0.4);
      assert.deepEqual(JSON.parse(storage.getItem("gamehub:audio-settings")), { music: 0.2, join: 0.4, game: 0.6 });
      audio.setMuted(true);
      assert.deepEqual(JSON.parse(storage.getItem("gamehub:audio-settings")), { music: 0, join: 0, game: 0 });
      audio.setMuted(false);
      assert.deepEqual(JSON.parse(storage.getItem("gamehub:audio-settings")), { music: 1, join: 1, game: 1 });
    } finally { dom.window.close(); }
  });
}
