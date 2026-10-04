import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeck,
  createEgyptianWarState,
  createPublicEgyptianWarState,
  shuffleDeck,
  type EgyptianWarPlayerInput,
  type EgyptianWarSettings
} from "./egyptianWarEngine.js";

const settings: EgyptianWarSettings = {
  includeJokers: true,
  allowDoubles: true,
  allowSandwiches: true,
  allowFourInARow: true,
  allowTopBottom: false,
  allowTens: false,
  allowMarriage: false
};

const players: EgyptianWarPlayerInput[] = [
  { id: "player-1", name: "Ada", avatar: "🐱" },
  { id: "player-2", name: "Grace", avatar: "🐶" },
  { id: "player-3", name: "Katherine", avatar: "🦊" }
];

test("creates a unique standard deck with optional Jokers", () => {
  const standardDeck = createDeck(false);
  const deckWithJokers = createDeck(true);

  assert.equal(standardDeck.length, 52);
  assert.equal(deckWithJokers.length, 54);
  assert.equal(
    new Set(deckWithJokers.map((card) => card.id)).size,
    deckWithJokers.length
  );
  assert.equal(
    deckWithJokers.filter((card) => card.rank === "joker").length,
    2
  );
});

test("shuffles a copy without changing the source deck", () => {
  const deck = createDeck(false);
  const originalIds = deck.map((card) => card.id);
  const shuffledDeck = shuffleDeck(deck, () => 0);

  assert.deepEqual(deck.map((card) => card.id), originalIds);
  assert.notDeepEqual(
    shuffledDeck.map((card) => card.id),
    originalIds
  );
  assert.deepEqual(
    new Set(shuffledDeck.map((card) => card.id)),
    new Set(originalIds)
  );
});

test("deals every card and randomly chooses the first player", () => {
  const state = createEgyptianWarState(
    players,
    settings,
    (maxExclusive) => maxExclusive - 1
  );

  const cardCounts = state.players.map((player) => player.cards.length);
  const dealtCards = state.players.flatMap((player) => player.cards);

  assert.equal(dealtCards.length, 54);
  assert.equal(new Set(dealtCards.map((card) => card.id)).size, 54);
  assert.ok(Math.max(...cardCounts) - Math.min(...cardCounts) <= 1);
  assert.equal(state.currentPlayerIndex, players.length - 1);
  assert.equal(state.pile.length, 0);
});

test("public state exposes card counts but not hidden decks", () => {
  const state = createEgyptianWarState(players, settings, () => 0);
  const publicState = createPublicEgyptianWarState(state);
  const serializedState = JSON.stringify(publicState);

  assert.equal(publicState.currentPlayerId, players[0].id);
  assert.equal(
    publicState.players.reduce(
      (total, player) => total + player.cardCount,
      0
    ),
    54
  );
  assert.equal(serializedState.includes('"cards"'), false);
  assert.equal(serializedState.includes("clubs-2"), false);
});

test("rejects unsupported player lists and invalid randomness", () => {
  assert.throws(
    () => createEgyptianWarState(players.slice(0, 1), settings),
    /between 2 and 6 players/
  );

  assert.throws(
    () =>
      createEgyptianWarState(
        [players[0], { ...players[1], id: players[0].id }],
        settings
      ),
    /unique IDs/
  );

  assert.throws(
    () => shuffleDeck(createDeck(false), (maximum) => maximum),
    /Random index/
  );
});
