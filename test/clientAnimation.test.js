const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

function createClient(reducedMotion = false) {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "public", "index.html"),
    "utf8"
  );
  const dom = new JSDOM(html, { url: "http://localhost" });
  const handlers = new Map();
  const playedEffects = [];
  const audioScenes = [];

  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  global.CSS = dom.window.CSS ?? { escape: (value) => String(value) };
  if (!global.CSS.escape) {
    global.CSS.escape = (value) => String(value);
  }
  window.matchMedia = () => ({ matches: reducedMotion });
  window.GameHubAudio = {
    playEffect(effectName) {
      playedEffects.push(effectName);
    },
    setScene(sceneName) {
      audioScenes.push(sceneName);
    }
  };
  global.bootstrap = {
    Toast: { getOrCreateInstance: () => ({ show() {} }) },
    Modal: {
      getInstance: () => null,
      getOrCreateInstance: () => ({ hide() {}, show() {} })
    }
  };
  global.io = () => ({
    on(event, handler) {
      handlers.set(event, handler);
    },
    emit() {}
  });

  const intervals = [];
  const originalSetInterval = global.setInterval;
  global.setInterval = (...arguments_) => {
    const interval = originalSetInterval(...arguments_);
    intervals.push(interval);
    return interval;
  };
  const modulePath = require.resolve("../public/client.js");
  delete require.cache[modulePath];
  const client = require(modulePath);
  global.setInterval = originalSetInterval;
  const arena = document.querySelector("#egyptian-war-arena");
  const pile = document.querySelector("#egyptian-war-pile-stack");
  const players = document.querySelector("#egyptian-war-players");
  arena.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400 });
  pile.getBoundingClientRect = () => ({ left: 280, top: 180, width: 40, height: 40 });

  const addSeat = (id, left, top) => {
    const seat = document.createElement("div");
    seat.dataset.playerId = id;
    seat.getBoundingClientRect = () => ({ left, top, width: 60, height: 60 });
    players.appendChild(seat);
    return seat;
  };

  const close = () => {
    intervals.forEach((interval) => clearInterval(interval));
    dom.window.close();
  };

  return { client, close, addSeat, playedEffects, audioScenes };
}

function animation(overrides = {}) {
  return {
    id: 1,
    action: "slap",
    actorId: "winner",
    winnerId: "winner",
    slapAttempts: [],
    transferCardCount: 0,
    penaltyCardCount: 0,
    playedCard: null,
    isFinalWin: false,
    activityMessage: "Winner slapped first and won the pile.",
    ...overrides
  };
}

test("orders slap hands, sounds, and pile transfer after every hand lands", async () => {
  const { client, close, addSeat, playedEffects } = createClient();
  const winnerSeat = addSeat("winner", 20, 170);
  addSeat("later", 520, 170);
  const message = document.querySelector("#egyptian-war-message");
  message.textContent = "Waiting for slaps.";

  client.animateEgyptianWarOutcome(animation({
    slapAttempts: [
      { playerId: "winner", delayMs: 0, isWinner: true },
      { playerId: "later", delayMs: 80, isWinner: false }
    ],
    transferCardCount: 3
  }));

  const hands = [...document.querySelectorAll(".egyptian-war-flying-hand")];
  assert.equal(hands.length, 2);
  assert.deepEqual(hands.map((hand) => hand.style.zIndex), ["5", "6"]);
  assert.deepEqual(hands.map((hand) => hand.style.animationDelay), ["0ms", "80ms"]);
  assert.equal(document.querySelectorAll(".is-transferring").length, 0);
  assert.equal(winnerSeat.classList.contains("is-pile-winner"), false);
  assert.equal(message.textContent, "Waiting for slaps.");
  assert.deepEqual(playedEffects, []);

  await new Promise((resolve) => setTimeout(resolve, 550));
  assert.equal(winnerSeat.classList.contains("is-pile-winner"), false);
  assert.equal(message.textContent, "Waiting for slaps.");
  assert.deepEqual(playedEffects, ["slap"]);

  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(winnerSeat.classList.contains("is-pile-winner"), true);
  assert.equal(
    message.textContent,
    "Winner slapped first and won the pile."
  );
  assert.deepEqual(playedEffects, ["slap", "slap", "pile-win"]);
  assert.equal(document.querySelectorAll(".is-transferring").length, 0);

  await new Promise((resolve) => setTimeout(resolve, 240));
  assert.equal(document.querySelectorAll(".is-transferring").length, 3);
  close();
});

test("animates single and invalid slaps", () => {
  const { client, close, addSeat } = createClient();
  addSeat("winner", 20, 170);

  client.animateEgyptianWarOutcome(animation());
  assert.equal(document.querySelectorAll(".egyptian-war-flying-hand").length, 1);

  client.animateEgyptianWarOutcome(animation({
    winnerId: null,
    penaltyCardCount: 2
  }));
  assert.equal(document.querySelectorAll(".egyptian-war-flying-hand").length, 1);
  assert.equal(document.querySelectorAll(".is-penalty-card").length, 2);
  close();
});

test("removes slap and transfer delays for reduced motion", () => {
  const { client, close, addSeat } = createClient(true);
  addSeat("winner", 20, 170);
  addSeat("later", 520, 170);

  client.animateEgyptianWarOutcome(animation({
    slapAttempts: [
      { playerId: "winner", delayMs: 0, isWinner: true },
      { playerId: "later", delayMs: 200, isWinner: false }
    ],
    transferCardCount: 2
  }));

  const hands = [...document.querySelectorAll(".egyptian-war-flying-hand")];
  assert.deepEqual(hands.map((hand) => hand.style.animationDelay), ["0ms", "0ms"]);
  assert.equal(document.querySelectorAll(".is-transferring").length, 2);
  close();
});

test("moves and sounds a played card from the player seat to the pile", async () => {
  const { client, close, addSeat, playedEffects } = createClient();
  addSeat("player", 20, 170);
  const dealtCard = document.createElement("div");
  dealtCard.className = "playing-card is-dealing";
  dealtCard.getBoundingClientRect = () => ({
    left: 250,
    top: 130,
    width: 100,
    height: 140
  });
  document.querySelector("#egyptian-war-pile-stack")
    .appendChild(dealtCard);

  client.animateEgyptianWarOutcome(animation({
    action: "play-card",
    actorId: "player",
    winnerId: null,
    playedCard: { id: "card-1", rank: "7", suit: "clubs" }
  }));

  const hand = document.querySelector(".egyptian-war-card-play-hand");
  assert.ok(hand);
  assert.equal(hand.style.left, "50px");
  assert.equal(hand.style.top, "200px");
  assert.equal(hand.style.getPropertyValue("--play-hand-x"), "178px");
  assert.equal(hand.style.getPropertyValue("--play-hand-y"), "0px");
  assert.equal(
    hand.style.getPropertyValue("--play-hand-rotation"),
    "90deg"
  );
  assert.deepEqual(playedEffects, []);
  await new Promise((resolve) => setTimeout(resolve, 440));
  assert.deepEqual(playedEffects, ["card-play"]);
  close();
});

test("shows and sounds the game winner distinctly", async () => {
  const { client, close, addSeat, playedEffects } = createClient(true);
  addSeat("winner", 270, 20);

  client.animateEgyptianWarOutcome(animation({
    isFinalWin: true,
    transferCardCount: 54,
    players: [{
      id: "winner",
      name: "Frog",
      avatar: "🐸",
      cardCount: 54
    }]
  }));

  const victory = document.querySelector("#egyptian-war-victory");
  assert.equal(victory.hidden, false);
  assert.equal(victory.parentElement.id, "egyptian-war-arena");
  assert.equal(
    victory.querySelector(".egyptian-war-victory-avatar").textContent,
    "🐸"
  );
  assert.equal(
    victory.querySelector(".egyptian-war-victory-winner").textContent,
    "Frog wins!"
  );
  assert.match(
    victory.querySelector(".egyptian-war-victory-champion").textContent,
    /54 cards/
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(playedEffects, ["slap", "game-win"]);
  close();
});
