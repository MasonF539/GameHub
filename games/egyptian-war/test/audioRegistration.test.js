const assert = require("node:assert/strict");
const test = require("node:test");

test("registers Egyptian War music and action effects with GameHub", () => {
  const musicScenes = [];
  const effects = [];
  global.window = {
    GameHubAudio: {
      registerMusicScene(name, source) {
        musicScenes.push({ name, source });
      },
      registerEffect(name, options) {
        effects.push({ name, ...options });
      }
    }
  };

  const modulePath = require.resolve("../public/register.js");
  delete require.cache[modulePath];
  try {
    require(modulePath);
  } finally {
    delete require.cache[modulePath];
    delete global.window;
  }

  assert.deepEqual(musicScenes, [{
    name: "egyptian-war",
    source: "/games/egyptian-war/assets/audio/music/egyptian-war.mp3"
  }]);
  assert.deepEqual(
    effects.map(({ name, category }) => ({ name, category })),
    [
      { name: "card-play", category: undefined },
      { name: "slap", category: undefined },
      { name: "pile-win", category: undefined },
      { name: "game-win", category: undefined }
    ]
  );
  assert.ok(effects.every((effect) =>
    effect.source.startsWith("/games/egyptian-war/assets/audio/effects/")
  ));
});
