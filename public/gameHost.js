(function initializeGameClientHost(globalScope) {
  const pendingModules = new Map();

  globalScope.GameHubRegisterGameClientModule = (gameId, gameModule) => {
    pendingModules.set(gameId, gameModule);
  };

  class GameClientHost {
    constructor({ root, createContext }) {
      if (!root) {
        throw new Error("A game client root is required.");
      }
      if (typeof createContext !== "function") {
        throw new Error("A game client context factory is required.");
      }

      this.root = root;
      this.createContext = createContext;
      this.modules = new Map();
      for (const [gameId, gameModule] of pendingModules) {
        this.register(gameId, gameModule);
      }
      this.activeGameId = null;
      this.activeInstance = null;
    }

    register(gameId, gameModule) {
      if (typeof gameId !== "string" || gameId.trim() === "") {
        throw new Error("A game client module must have an id.");
      }
      if (!gameModule || typeof gameModule.mount !== "function") {
        throw new Error(`Game client module ${gameId} must provide mount().`);
      }
      if (this.modules.has(gameId)) {
        throw new Error(`Game client module ${gameId} is already registered.`);
      }

      this.modules.set(gameId, gameModule);
    }

    has(gameId) {
      return this.modules.has(gameId);
    }

    mount(gameId, launchData = {}) {
      const gameModule = this.modules.get(gameId);
      if (!gameModule) {
        throw new Error(`Game client module ${gameId} is not registered.`);
      }

      this.unmount();
      let gameRoot = this.root;
      const pluginRoots = typeof this.root.querySelectorAll === "function"
        ? this.root.querySelectorAll("[data-game-plugin-root]")
        : [];
      for (const candidate of pluginRoots) {
        const isActive = candidate.getAttribute("data-game-plugin-root") === gameId;
        candidate.hidden = !isActive;
        if (isActive) gameRoot = candidate;
      }
      this.setActiveStyles(gameId);
      const context = {
        ...this.createContext(gameId),
        root: gameRoot,
        gameId,
        launchData
      };
      const instance = gameModule.mount(context);
      if (
        !instance ||
        typeof instance.receiveState !== "function" ||
        typeof instance.receiveEvent !== "function" ||
        typeof instance.destroy !== "function"
      ) {
        throw new Error(
          `Game client module ${gameId} returned an invalid instance.`
        );
      }

      this.activeGameId = gameId;
      this.activeInstance = instance;
      return instance;
    }

    receiveState({ gameId, state }) {
      if (gameId === this.activeGameId) {
        this.activeInstance?.receiveState(state);
      }
    }

    receiveEvent({ gameId, event }) {
      if (gameId === this.activeGameId && event) {
        this.activeInstance?.receiveEvent(event);
      }
    }

    receivePlatformEvent(event) {
      this.activeInstance?.receivePlatformEvent?.(event);
    }

    setActiveStyles(gameId) {
      const ownerDocument = this.root.ownerDocument ?? globalScope.document;
      if (typeof ownerDocument?.querySelectorAll !== "function") return;
      for (const stylesheet of ownerDocument.querySelectorAll("[data-game-plugin-style]")) {
        stylesheet.disabled =
          stylesheet.getAttribute("data-game-plugin-style") !== gameId;
      }
    }

    unmount() {
      const instance = this.activeInstance;
      this.activeGameId = null;
      this.activeInstance = null;
      instance?.destroy();
      if (typeof this.root.querySelectorAll === "function") {
        for (const candidate of this.root.querySelectorAll("[data-game-plugin-root]")) {
          candidate.hidden = true;
        }
      }
      this.setActiveStyles(null);
    }
  }

  globalScope.GameHubGameClientHost = GameClientHost;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { GameClientHost };
  }
})(typeof window === "undefined" ? globalThis : window);
