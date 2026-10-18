const assert = require("node:assert/strict");
const test = require("node:test");
const { createRequire } = require("node:module");
const { GameClientHost } = require("../public/gameHost.js");

test("configured games share the hub SDK installation", () => {
  for (const packageName of require("../gamehub.config.json").gamePackages) {
    const gameRequire = createRequire(require.resolve(packageName));
    assert.equal(gameRequire.resolve("@masonf539/game-sdk"), require.resolve("@masonf539/game-sdk"));
  }
});

test("mounts one registered game client and routes only its envelopes", () => {
  const receivedStates = [];
  const receivedEvents = [];
  const platformEvents = [];
  let destroyCount = 0;
  const root = {};
  const host = new GameClientHost({
    root,
    createContext: (gameId) => ({ memberId: "member-1", gameId })
  });

  host.register("first", {
    mount(context) {
      assert.equal(context.root, root);
      assert.equal(context.gameId, "first");
      assert.deepEqual(context.launchData, { isPaused: false });
      return {
        receiveState: (state) => receivedStates.push(state),
        receiveEvent: (event) => receivedEvents.push(event),
        receivePlatformEvent: (event) => platformEvents.push(event),
        destroy: () => {
          destroyCount += 1;
        }
      };
    }
  });

  host.mount("first", { isPaused: false });
  host.receiveState({ gameId: "other", state: "ignored" });
  host.receiveState({ gameId: "first", state: "visible" });
  host.receiveEvent({ gameId: "first", event: { type: "animation" } });
  host.receivePlatformEvent({ type: "spectators", payload: [] });

  assert.deepEqual(receivedStates, ["visible"]);
  assert.deepEqual(receivedEvents, [{ type: "animation" }]);
  assert.deepEqual(platformEvents, [{ type: "spectators", payload: [] }]);
  host.unmount();
  assert.equal(destroyCount, 1);
});

test("rejects duplicate modules and replaces the active instance safely", () => {
  let destroyCount = 0;
  const host = new GameClientHost({
    root: {},
    createContext: () => ({})
  });
  const gameModule = {
    mount: () => ({
      receiveState() {},
      receiveEvent() {},
      destroy() {
        destroyCount += 1;
      }
    })
  };

  host.register("first", gameModule);
  assert.throws(
    () => host.register("first", gameModule),
    /already registered/
  );
  host.mount("first");
  host.mount("first");
  assert.equal(destroyCount, 1);
});

test("mounts a game inside its package root and hides inactive package markup", () => {
  const firstRoot = {
    hidden: true,
    getAttribute: () => "first"
  };
  const secondRoot = {
    hidden: true,
    getAttribute: () => "second"
  };
  const firstStyle = {
    disabled: true,
    getAttribute: () => "first"
  };
  const secondStyle = {
    disabled: true,
    getAttribute: () => "second"
  };
  const root = {
    querySelectorAll: () => [firstRoot, secondRoot],
    ownerDocument: {
      querySelectorAll: () => [firstStyle, secondStyle]
    }
  };
  const host = new GameClientHost({ root, createContext: () => ({}) });
  let mountedRoot = null;
  host.register("second", {
    mount(context) {
      mountedRoot = context.root;
      return {
        receiveState() {},
        receiveEvent() {},
        destroy() {}
      };
    }
  });

  host.mount("second");

  assert.equal(mountedRoot, secondRoot);
  assert.equal(firstRoot.hidden, true);
  assert.equal(secondRoot.hidden, false);
  assert.equal(firstStyle.disabled, true);
  assert.equal(secondStyle.disabled, false);
  host.unmount();
  assert.equal(secondRoot.hidden, true);
  assert.equal(secondStyle.disabled, true);
});

test("cleans input subscriptions even when a game forgets to unsubscribe", () => {
  const handlers = new Set();
  const host = new GameClientHost({
    root: {},
    createContext: () => ({
      input: {
        onAction(_actionId, handler) {
          handlers.add(handler);
          return () => handlers.delete(handler);
        }
      }
    })
  });
  host.register("first", {
    mount(context) {
      context.input.onAction("act", () => {});
      return {
        receiveState() {},
        receiveEvent() {},
        destroy() {}
      };
    }
  });

  host.mount("first");
  assert.equal(handlers.size, 1);
  host.unmount();
  assert.equal(handlers.size, 0);
});

test("cleans input subscriptions and presentation after mount throws", () => {
  const handlers = new Set();
  const gameRoot = {
    hidden: true,
    getAttribute: () => "first"
  };
  const gameStyle = {
    disabled: true,
    getAttribute: () => "first"
  };
  const host = new GameClientHost({
    root: {
      querySelectorAll: () => [gameRoot],
      ownerDocument: { querySelectorAll: () => [gameStyle] }
    },
    createContext: () => ({
      input: {
        onAction(_actionId, handler) {
          handlers.add(handler);
          return () => handlers.delete(handler);
        }
      }
    })
  });
  host.register("first", {
    mount(context) {
      context.input.onAction("act", () => {});
      throw new Error("mount failed");
    }
  });

  assert.throws(() => host.mount("first"), /mount failed/);
  assert.equal(handlers.size, 0);
  assert.equal(gameRoot.hidden, true);
  assert.equal(gameStyle.disabled, true);
  assert.equal(host.activeGameId, null);
});
