import assert from "node:assert/strict";
import test from "node:test";
import type { Card } from "./egyptianWar.js";
import {
  applyEgyptianWarAction,
  createDeck,
  createEgyptianWarState,
  createPublicEgyptianWarState,
  isEgyptianWarPileSlappable,
  shuffleDeck,
  type EgyptianWarState,
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

function makeState(
  hands: Card[][],
  overrides: Partial<EgyptianWarState> = {}
): EgyptianWarState {
  const playerStates = players.slice(0, hands.length).map(
    (player, index) => ({
      ...player,
      cards: [...hands[index]],
      isEliminated: false
    })
  );
  const heldCardCount = hands.reduce(
    (total, hand) => total + hand.length,
    0
  );
  const pile = overrides.pile ?? [];

  return {
    players: playerStates,
    pile: [...pile],
    currentPlayerIndex: 0,
    settings,
    challenge: null,
    totalCardCount: heldCardCount + pile.length,
    winnerId: null,
    status: "playing",
    activityMessage: "",
    ...overrides
  };
}

function card(rank: Card["rank"], id: string = rank): Card {
  return {
    id,
    rank,
    suit: rank === "joker" ? null : "clubs"
  };
}

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

test("plays a card and advances to the next active player", () => {
  const state = makeState([
    [card("2", "p1-2")],
    [card("3", "p2-3")],
    [card("4", "p3-4")]
  ]);

  applyEgyptianWarAction(state, players[0].id, "play-card");

  assert.equal(state.players[0].cards.length, 0);
  assert.equal(state.players[0].isEliminated, true);
  assert.equal(state.currentPlayerIndex, 1);
  assert.equal(state.pile[0].id, "p1-2");
});

test("starts and passes face-card challenges, then awards the pile to the responder", () => {
  const state = makeState([
    [card("queen", "p1-q"), card("5", "p1-5")],
    [
      card("2", "p2-2"),
      card("3", "p2-3"),
      card("4", "p2-4")
    ],
    [card("king", "p3-k"), card("6", "p3-6")]
  ]);

  applyEgyptianWarAction(state, players[0].id, "play-card");
  assert.deepEqual(state.challenge, {
    challengerId: players[0].id,
    responderId: players[1].id,
    attemptsRemaining: 2
  });

  applyEgyptianWarAction(state, players[1].id, "play-card");
  assert.equal(state.challenge?.attemptsRemaining, 1);
  assert.equal(state.currentPlayerIndex, 1);

  applyEgyptianWarAction(state, players[1].id, "play-card");
  assert.equal(state.players[0].cards.length, 1);
  assert.equal(state.players[1].cards.length, 4);
  assert.equal(state.pile.length, 0);
  assert.equal(state.currentPlayerIndex, 1);
  assert.equal(state.challenge, null);
});

test("passes a challenge to the player who reveals a new face card", () => {
  const state = makeState([
    [card("jack", "p1-j"), card("2", "p1-2")],
    [card("ace", "p2-a"), card("3", "p2-3")],
    [card("4", "p3-4"), card("5", "p3-5")]
  ]);

  applyEgyptianWarAction(state, players[0].id, "play-card");
  applyEgyptianWarAction(state, players[1].id, "play-card");

  assert.deepEqual(state.challenge, {
    challengerId: players[1].id,
    responderId: players[2].id,
    attemptsRemaining: 4
  });
  assert.equal(state.currentPlayerIndex, 2);
});

test("awards the pile to a responder who runs out before completing the challenge", () => {
  const state = makeState([
    [card("queen", "p1-q"), card("2", "p1-2")],
    [card("3", "p2-3")],
    [card("4", "p3-4"), card("5", "p3-5")]
  ]);

  applyEgyptianWarAction(state, players[0].id, "play-card");
  applyEgyptianWarAction(state, players[1].id, "play-card");

  assert.equal(state.players[1].isEliminated, false);
  assert.equal(state.players[0].cards.length, 1);
  assert.equal(state.players[1].cards.length, 2);
  assert.equal(state.currentPlayerIndex, 1);
  assert.equal(state.pile.length, 0);
  assert.equal(state.challenge, null);
});

test("awards the pile to a challenged responder who has no cards to play", () => {
  const state = makeState(
    [[card("2", "p1-2")], [], [card("4", "p3-4")]],
    {
      pile: [card("queen", "pile-q"), card("5", "pile-5")],
      currentPlayerIndex: 1,
      challenge: {
        challengerId: players[0].id,
        responderId: players[1].id,
        attemptsRemaining: 2
      }
    }
  );

  applyEgyptianWarAction(state, players[1].id, "play-card");

  assert.equal(state.players[1].isEliminated, false);
  assert.equal(state.players[1].cards.length, 2);
  assert.equal(state.pile.length, 0);
  assert.equal(state.challenge, null);
  assert.equal(state.currentPlayerIndex, 1);
});

test("valid slaps award the pile and let eliminated players re-enter", () => {
  const state = makeState(
    [
      [card("2", "p1-2")],
      [card("4", "p2-4")],
      []
    ],
    {
      pile: [card("7", "pile-7"), card("7", "pile-7b")],
      players: [
        {
          ...players[0],
          cards: [card("2", "p1-2")],
          isEliminated: false
        },
        {
          ...players[1],
          cards: [card("4", "p2-4")],
          isEliminated: false
        },
        {
          ...players[2],
          cards: [],
          isEliminated: true
        }
      ]
    }
  );

  applyEgyptianWarAction(state, players[2].id, "slap");

  assert.equal(state.players[2].isEliminated, false);
  assert.equal(state.players[2].cards.length, 2);
  assert.equal(state.pile.length, 0);
  assert.equal(state.currentPlayerIndex, 2);
});

test("rejects out-of-turn plays and invalid slaps", () => {
  const state = makeState([
    [card("2", "p1-2")],
    [card("3", "p2-3")]
  ]);

  assert.throws(
    () => applyEgyptianWarAction(state, players[1].id, "play-card"),
    /not your turn/
  );
  assert.throws(
    () => applyEgyptianWarAction(state, players[1].id, "slap"),
    /no valid slap/
  );
});

test("validates configured slap patterns", () => {
  assert.equal(
    isEgyptianWarPileSlappable(
      [card("4"), card("4", "four-2")],
      { ...settings, allowDoubles: true }
    ),
    true
  );
  assert.equal(
    isEgyptianWarPileSlappable(
      [card("2"), card("3"), card("2", "two-2")],
      { ...settings, allowDoubles: false, allowSandwiches: true }
    ),
    true
  );
  const enabledSettings = {
    ...settings,
    allowDoubles: false,
    allowSandwiches: false,
    allowFourInARow: true,
    allowTopBottom: false,
    allowTens: false,
    allowMarriage: false
  };

  assert.equal(
    isEgyptianWarPileSlappable(
      [card("2"), card("3"), card("4"), card("5")],
      enabledSettings
    ),
    true
  );
  assert.equal(
    isEgyptianWarPileSlappable(
      [card("ace"), card("2"), card("3"), card("4")],
      enabledSettings
    ),
    true
  );
  assert.equal(
    isEgyptianWarPileSlappable(
      [card("jack"), card("queen"), card("king"), card("ace")],
      enabledSettings
    ),
    true
  );
  assert.equal(
    isEgyptianWarPileSlappable(
      [card("10"), card("jack"), card("king"), card("queen")],
      enabledSettings
    ),
    false
  );

  assert.equal(
    isEgyptianWarPileSlappable(
      [card("king"), card("queen")],
      { ...settings, allowMarriage: true, allowDoubles: false }
    ),
    true
  );
  assert.equal(
    isEgyptianWarPileSlappable(
      [card("7"), card("jack"), card("3")],
      { ...settings, allowTens: true, allowDoubles: false }
    ),
    true
  );
  assert.equal(
    isEgyptianWarPileSlappable(
      [card("6"), card("4")],
      { ...settings, allowTens: true, allowDoubles: false }
    ),
    true
  );
  assert.equal(
    isEgyptianWarPileSlappable(
      [card("2"), card("3"), card("4"), card("2", "two-top")],
      {
        ...settings,
        allowDoubles: false,
        allowSandwiches: false,
        allowTopBottom: true
      }
    ),
    true
  );
  assert.equal(
    isEgyptianWarPileSlappable(
      [card("2"), card("joker")],
      { ...settings, includeJokers: true }
    ),
    true
  );
});

test("finishes when one player owns all cards", () => {
  const state = makeState(
    [
      [card("2", "p1-2"), card("3", "p1-3")],
      []
    ],
    {
      pile: [card("4", "pile-4")],
      players: [
        {
          ...players[0],
          cards: [card("2", "p1-2"), card("3", "p1-3")],
          isEliminated: false
        },
        { ...players[1], cards: [], isEliminated: true }
      ]
    }
  );

  applyEgyptianWarAction(state, players[0].id, "play-card");

  assert.equal(state.status, "finished");
  assert.equal(state.winnerId, players[0].id);
  assert.equal(state.players[0].cards.length, 3);
  assert.equal(state.pile.length, 0);
});
