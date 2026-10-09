const path = require("node:path");

const manifest = {
  apiVersion: 1,
  packageVersion: "1.0.0",
  definition: {
    id: "fixture-game",
    name: "Fixture Game",
    description: "A minimal plugin used to verify GameHub's generic host.",
    isPlayable: true,
    chatEnabled: true,
    rules: ["Submit an action to advance the fixture counter."],
    minPlayers: 2,
    maxPlayers: 12,
    settings: []
  },
  client: {
    delivery: "module",
    entryPath: "client.js",
    markupPath: "template.html",
    stylePaths: ["style.css"]
  }
};

class FixtureSession {
  constructor(context) {
    this.context = context;
    this.actionCount = 0;
    this.isPaused = false;
  }

  getPublicState(viewer) {
    return {
      actionCount: this.actionCount,
      isPaused: this.isPaused,
      viewerRole: viewer.role,
      members: this.context.members()
    };
  }

  getLifecycleState() {
    return { isPaused: this.isPaused, isBusy: false };
  }

  handleAction(memberId, action) {
    const member = this.context.members().find(
      (candidate) => candidate.id === memberId
    );
    if (member?.role !== "player") {
      return { success: false, message: "You are not a player in that room." };
    }
    if (action.type === "throw") {
      throw new Error("Fixture action failure");
    }
    if (action.type !== "advance") {
      return { success: false, message: "That fixture action is unsupported." };
    }
    if (this.isPaused) {
      return { success: false, message: "The fixture game is paused." };
    }
    this.actionCount += 1;
    this.context.broadcastState();
    return { success: true };
  }

  pause() {
    this.isPaused = true;
    this.context.broadcastState();
    return { success: true };
  }

  resume() {
    this.isPaused = false;
    this.context.broadcastState();
    return { success: true };
  }

  memberDisconnected(memberId) {
    const member = this.context.members().find(
      (candidate) => candidate.id === memberId
    );
    if (member?.role === "player") {
      this.isPaused = true;
      this.context.broadcastState();
    }
  }

  memberReconnected() {
    if (this.context.members().every(
      (member) => member.role !== "player" || member.isConnected
    )) {
      this.isPaused = false;
      this.context.broadcastState();
    }
  }

  memberRemoved() {
    return { success: true };
  }

  dispose() {}
}

const server = {
  manifest,
  createSession(context) {
    return new FixtureSession(context);
  }
};

module.exports.gameHubPlugin = {
  manifest,
  publicDirectory: path.join(__dirname, "public"),
  server
};
