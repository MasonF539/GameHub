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
      this.activeInputCleanups = new Set();
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
      const baseContext = this.createContext(gameId) ?? {};
      const inputCleanups = new Set();
      const trackSubscriptions = (api, methods) => {
        if (!api) return api;
        const wrapped = { ...api };
        for (const method of methods) {
          if (typeof api[method] !== "function") continue;
          wrapped[method] = (...args) => {
            const unsubscribe = api[method](...args);
            if (typeof unsubscribe !== "function") {
              throw new Error(`Game client subscription ${gameId}.${method} did not return a cleanup function.`);
            }
            let active = true;
            const cleanup = () => {
              if (!active) return;
              active = false;
              inputCleanups.delete(cleanup);
              unsubscribe();
            };
            inputCleanups.add(cleanup);
            return cleanup;
          };
        }
        return wrapped;
      };
      const input = trackSubscriptions(baseContext.input, ["onAction", "onBindingsChanged"]);
      const display = trackSubscriptions(baseContext.display, ["onChange"]);
      const context = {
        ...baseContext,
        get isHost() { return baseContext.isHost; },
        ...(input ? { input } : {}),
        ...(display ? { display } : {}),
        root: gameRoot,
        gameId,
        launchData
      };
      this.activeGameId = gameId;
      this.activeInputCleanups = inputCleanups;
      try {
        const instance = gameModule.mount(context);
        this.activeInstance = instance;
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
        return instance;
      } catch (error) {
        try {
          this.unmount();
        } catch {
          // Preserve the original mount error after making a best-effort cleanup.
        }
        throw error;
      }
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
      const inputCleanups = this.activeInputCleanups;
      this.activeGameId = null;
      this.activeInstance = null;
      this.activeInputCleanups = new Set();
      let cleanupError = null;
      try {
        instance?.destroy?.();
      } catch (error) {
        cleanupError = error;
      }
      for (const cleanup of [...inputCleanups]) {
        try {
          cleanup();
        } catch (error) {
          cleanupError ??= error;
        }
      }
      if (typeof this.root.querySelectorAll === "function") {
        for (const candidate of this.root.querySelectorAll("[data-game-plugin-root]")) {
          candidate.hidden = true;
        }
      }
      this.setActiveStyles(null);
      if (cleanupError) throw cleanupError;
    }
  }

  globalScope.GameHubGameClientHost = GameClientHost;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { GameClientHost };
  }
})(typeof window === "undefined" ? globalThis : window);
