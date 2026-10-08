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
  const egyptianWarAudioScript = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "games",
      "egyptian-war",
      "public",
      "register.js"
    ),
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
  dom.window.eval(egyptianWarAudioScript);

  const music = audioInstances[0];
  const audio = dom.window.GameHubAudio;
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

  audio.setScene("egyptian-war");
  assert.match(music.src, /egyptian-war\.mp3$/);
  assert.equal(music.playCount, 2);

  audio.playEffect("slap");
  assert.match(audioInstances.at(-1).src, /effects\/slap\.mp3$/);
  assert.equal(audioInstances.at(-1).playCount, 1);

  musicVolume.value = "50";
  musicVolume.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  assert.equal(music.volume, 0.21);
  assert.equal(musicVolumeValue.textContent, "50%");

  gameVolume.value = "25";
  gameVolume.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  audio.playEffect("slap");
  assert.equal(audioInstances.at(-1).volume, 0.225);

  joinVolume.value = "0";
  joinVolume.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  const instanceCountWithJoinDisabled = audioInstances.length;
  audio.playEffect("player-join");
  assert.equal(audioInstances.length, instanceCountWithJoinDisabled);

  audio.playEffect("card-play");
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
