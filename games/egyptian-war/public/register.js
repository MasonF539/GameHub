(() => {
  const audio = window.GameHubAudio;
  if (!audio) {
    throw new Error("Egyptian War requires the GameHub audio service.");
  }

  const assetRoot = "/games/egyptian-war/assets/audio";
  audio.registerMusicScene(
    "egyptian-war",
    `${assetRoot}/music/egyptian-war.mp3`
  );
  audio.registerEffect("card-play", {
    source: `${assetRoot}/effects/card-play.mp3`,
    volume: 0.85
  });
  audio.registerEffect("slap", {
    source: `${assetRoot}/effects/slap.mp3`,
    volume: 0.9
  });
  audio.registerEffect("pile-win", {
    source: `${assetRoot}/effects/pile-win.mp3`,
    volume: 0.85
  });
  audio.registerEffect("game-win", {
    source: `${assetRoot}/effects/game-win.mp3`,
    volume: 0.95
  });
})();
