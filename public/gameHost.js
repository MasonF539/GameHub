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
      const context = {
        ...this.createContext(gameId),
        root: this.root,
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

    unmount() {
      const instance = this.activeInstance;
      this.activeGameId = null;
      this.activeInstance = null;
      instance?.destroy();
    }
  }

  globalScope.GameHubGameClientHost = GameClientHost;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { GameClientHost };
  }
})(typeof window === "undefined" ? globalThis : window);
