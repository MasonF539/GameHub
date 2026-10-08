(() => {
  const settingsStorageKey = "gamehub:audio-settings";
  const legacyMutedStorageKey = "gamehub:audio-muted";
  const categories = ["music", "join", "game"];
  const defaultSettings = {
    music: 1,
    join: 1,
    game: 1
  };
  const musicSources = {
    menu: "/assets/audio/music/menu-lobby.mp3",
    "egyptian-war": "/games/egyptian-war/assets/audio/music/egyptian-war.mp3"
  };
  const effectSources = {
    "player-join": "/assets/audio/effects/player-join.mp3",
    "card-play": "/games/egyptian-war/assets/audio/effects/card-play.mp3",
    slap: "/games/egyptian-war/assets/audio/effects/slap.mp3",
    "pile-win": "/games/egyptian-war/assets/audio/effects/pile-win.mp3",
    "game-win": "/games/egyptian-war/assets/audio/effects/game-win.mp3"
  };
  const effectVolumes = {
    "player-join": 0.8,
    "card-play": 0.85,
    slap: 0.9,
    "pile-win": 0.85,
    "game-win": 0.95
  };
  const effectCategories = {
    "player-join": "join",
    "card-play": "game",
    slap: "game",
    "pile-win": "game",
    "game-win": "game"
  };
  const musicBaseVolume = 0.42;
  const music = new Audio();
  const effectTemplates = new Map();
  const controls = new Map();
  let currentScene = null;
  let isUnlocked = false;
  let settings = loadSettings();

  music.loop = true;
  music.preload = "auto";

  for (const [name, source] of Object.entries(effectSources)) {
    const template = new Audio(source);
    template.preload = "auto";
    effectTemplates.set(name, template);
  }

  for (const category of categories) {
    controls.set(category, {
      volume: document.querySelector(`#audio-${category}-volume`),
      output: document.querySelector(`#audio-${category}-volume-value`)
    });
  }

  function clampVolume(value, fallback = 1) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(1, Math.max(0, number));
  }

  function normalizeSettings(candidate) {
    const normalized = {};

    for (const category of categories) {
      const candidateCategory = candidate?.[category];
      const savedVolume = typeof candidateCategory === "object"
        ? candidateCategory?.enabled === false
          ? 0
          : candidateCategory?.volume
        : candidateCategory;
      normalized[category] = clampVolume(
        savedVolume,
        defaultSettings[category]
      );
    }

    return normalized;
  }

  function loadSettings() {
    try {
      const saved = localStorage.getItem(settingsStorageKey);

      if (saved !== null) {
        return normalizeSettings(JSON.parse(saved));
      }

      if (localStorage.getItem(legacyMutedStorageKey) === "true") {
        return normalizeSettings({
          music: 0,
          join: 0,
          game: 0
        });
      }
    } catch {
      // Defaults keep audio usable if storage is unavailable or malformed.
    }

    return normalizeSettings(defaultSettings);
  }

  function saveSettings() {
    try {
      localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
      localStorage.removeItem(legacyMutedStorageKey);
    } catch {
      // Settings still apply for the current page when storage is unavailable.
    }
  }

  function safelyPlay(audio) {
    const playResult = audio.play();

    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => {
        // Browsers can block playback until the first user interaction.
      });
    }
  }

  function categoryCanPlay(category) {
    return settings[category] > 0;
  }

  function syncControls(category) {
    const control = controls.get(category);
    const categoryVolume = settings[category];

    if (!control) {
      return;
    }

    if (control.volume) {
      control.volume.value = String(Math.round(categoryVolume * 100));
    }

    if (control.output) {
      control.output.textContent = `${Math.round(categoryVolume * 100)}%`;
    }
  }

  function applyMusicSettings() {
    music.volume = musicBaseVolume * settings.music;

    if (!categoryCanPlay("music")) {
      music.pause();
      return;
    }

    playCurrentMusic();
  }

  function playCurrentMusic() {
    if (
      !categoryCanPlay("music") ||
      !isUnlocked ||
      document.hidden ||
      currentScene === null
    ) {
      return;
    }

    safelyPlay(music);
  }

  function unlock() {
    isUnlocked = true;
    playCurrentMusic();
  }

  function setCategoryEnabled(category, enabled) {
    if (!categories.includes(category)) {
      return;
    }

    settings[category] = enabled
      ? settings[category] || defaultSettings[category]
      : 0;
    saveSettings();
    syncControls(category);

    if (category === "music") {
      applyMusicSettings();
    }
  }

  function setCategoryVolume(category, volume) {
    if (!categories.includes(category)) {
      return;
    }

    settings[category] = clampVolume(volume, settings[category]);
    saveSettings();
    syncControls(category);

    if (category === "music") {
      applyMusicSettings();
    }
  }

  function setMuted(nextMuted) {
    const volume = nextMuted ? 0 : 1;

    for (const category of categories) {
      settings[category] = volume;
      syncControls(category);
    }

    saveSettings();
    applyMusicSettings();
  }

  function setScene(scene) {
    const source = musicSources[scene] ?? null;

    if (scene === currentScene) {
      playCurrentMusic();
      return;
    }

    currentScene = source === null ? null : scene;
    music.pause();

    if (source === null) {
      music.removeAttribute("src");
      music.load();
      return;
    }

    music.src = source;
    music.currentTime = 0;
    music.load();
    playCurrentMusic();
  }

  function playEffect(name) {
    const category = effectCategories[name];

    if (!category || !categoryCanPlay(category)) {
      return;
    }

    const template = effectTemplates.get(name);

    if (!template) {
      return;
    }

    unlock();
    const effect = template.cloneNode();
    effect.volume = effectVolumes[name] * settings[category];
    safelyPlay(effect);
  }

  for (const category of categories) {
    const control = controls.get(category);

    control?.volume?.addEventListener("input", (event) => {
      setCategoryVolume(category, Number(event.currentTarget.value) / 100);
    });
    syncControls(category);
  }

  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      music.pause();
    } else {
      playCurrentMusic();
    }
  });

  applyMusicSettings();

  window.GameHubAudio = {
    getSettings: () => JSON.parse(JSON.stringify(settings)),
    playEffect,
    setCategoryEnabled,
    setCategoryVolume,
    setMuted,
    setScene
  };
})();
