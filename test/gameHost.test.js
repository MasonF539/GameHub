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

for (const fails of [false, true]) {
  test(`cleans binding and display subscriptions after ${fails ? "failed mount" : "unmount"}`, () => {
    let subscriptions = 0;
    let removals = 0;
    const subscribe = () => { subscriptions++; return () => { subscriptions--; removals++; }; };
    const host = new GameClientHost({ root: {}, createContext: () => ({
      input: { onBindingsChanged: subscribe }, display: { onChange: subscribe }
    }) });
    host.register("preferences", { mount(context) {
      const unsubscribe = context.input.onBindingsChanged(() => {});
      context.display.onChange(() => {});
      if (fails) throw new Error("mount failed");
      return { receiveState() {}, receiveEvent() {}, destroy() { unsubscribe(); unsubscribe(); } };
    } });
    if (fails) assert.throws(() => host.mount("preferences"), /mount failed/);
    else { host.mount("preferences"); assert.equal(subscriptions, 2); host.unmount(); }
    assert.equal(subscriptions, 0);
    assert.equal(removals, 2);
  });
}

test("mounted games observe host handoff without being remounted", () => {
  let isHost = false, context;
  const host = new GameClientHost({ root: {}, createContext: () => ({ get isHost() { return isHost; } }) });
  host.register("handoff", { mount(value) {
    context = value; return { receiveState() {}, receiveEvent() {}, destroy() {} };
  } });
  host.mount("handoff");
  assert.equal(context.isHost, false); isHost = true;
  assert.equal(context.isHost, true); host.unmount();
});


test("a host discovers and mounts modules registered after its construction", () => {
  const host = new GameClientHost({ root: {}, createContext: () => ({}) });
  let mounted = false;
  assert.equal(host.has("late-module"), false);
  global.GameHubRegisterGameClientModule("late-module", {
    mount() {
      mounted = true;
      return { receiveState() {}, receiveEvent() {}, destroy() {} };
    }
  });
  assert.equal(host.has("late-module"), true);
  host.mount("late-module");
  assert.equal(mounted, true);
  host.unmount();
});


test("mounted games observe spectator promotion without remounting", () => {
  let role = "spectator", context, mounts = 0;
  const host = new GameClientHost({ root: {}, createContext: () => ({ get role() { return role; } }) });
  host.register("admission", { mount(value) { mounts++; context = value; return { receiveState() {}, receiveEvent() {}, destroy() {} }; } });
  host.mount("admission"); assert.equal(context.role, "spectator"); role = "player";
  assert.equal(context.role, "player"); assert.equal(mounts, 1); host.unmount();
});


test("the general scoreboard hook opens only the mounted supported game", () => {
  const host = new GameClientHost({ root: {}, createContext: () => ({}) }); let opens = 0;
  assert.equal(host.showScoreboard(), false);
  host.register("scores", { mount() { return { receiveState() {}, receiveEvent() {}, showScoreboard() { opens++; }, destroy() {} }; } });
  host.mount("scores"); assert.equal(host.showScoreboard(), true); assert.equal(opens, 1); host.unmount(); assert.equal(host.showScoreboard(), false);
});


test("context initialization failures hide game markup and styles before a clean retry", () => {
  const gameRoot = { hidden: true, getAttribute: () => "context-failure" };
  const gameStyle = { disabled: true, getAttribute: () => "context-failure" };
  let fail = true, mounts = 0;
  const host = new GameClientHost({
    root: { querySelectorAll: () => [gameRoot], ownerDocument: { querySelectorAll: () => [gameStyle] } },
    createContext() { if (fail) throw new Error("Context unavailable"); return {}; }
  });
  host.register("context-failure", { mount() { mounts++; return { receiveState() {}, receiveEvent() {}, destroy() {} }; } });
  assert.throws(() => host.mount("context-failure"), /Context unavailable/);
  assert.equal(mounts, 0); assert.equal(host.activeGameId, null); assert.equal(host.activeInstance, null);
  assert.equal(gameRoot.hidden, true); assert.equal(gameStyle.disabled, true);
  fail = false; host.mount("context-failure");
  assert.equal(mounts, 1); assert.equal(gameRoot.hidden, false); assert.equal(gameStyle.disabled, false);
  host.unmount();
});
