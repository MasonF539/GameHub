import assert from "node:assert/strict";
import test from "node:test";
import type { Card } from "./definition.js";
import {
  applyEgyptianWarAction,
  createDeck,
  createEgyptianWarState,
  createPublicEgyptianWarState,
  isEgyptianWarPileSlappable,
  removeEgyptianWarPlayer,
  resolveEgyptianWarTurnTimeout,
  shuffleDeck,
  type EgyptianWarState,
  type EgyptianWarPlayerInput,
  type EgyptianWarSettings
} from "./engine.js";
import {
  getSlapComparisonWindow,
  selectWeightedSlapWinner
} from "./slapArbitration.js";

const settings: EgyptianWarSettings = {
  deckCount: 1,
  includeJokers: true,
  allowDoubles: true,
  allowSandwiches: true,
  allowFourInARow: true,
  allowTopBottom: false,
  allowTens: false,
  allowMarriage: false,
  falseSlapPenaltyCards: 2
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
    deferredCards: [],
    penaltyPileCardCount: 0,
    pileVersion: 0,
    currentPlayerIndex: 0,
    settings,
    challenge: null,
    pendingPileWinnerId: null,
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
  const threeDecksWithJokers = createDeck(true, 3);

  assert.equal(standardDeck.length, 52);
  assert.equal(deckWithJokers.length, 54);
  assert.equal(threeDecksWithJokers.length, 162);
  assert.equal(
    new Set(deckWithJokers.map((card) => card.id)).size,
    deckWithJokers.length
  );
  assert.equal(
    new Set(threeDecksWithJokers.map((card) => card.id)).size,
    threeDecksWithJokers.length
  );
  assert.equal(
    deckWithJokers.filter((card) => card.rank === "joker").length,
    2
  );
  assert.equal(
    threeDecksWithJokers.filter((card) => card.rank === "joker").length,
    6
  );
  assert.throws(() => createDeck(false, 0), RangeError);
  assert.throws(() => createDeck(false, 4), RangeError);
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

test("clamps slap comparison windows between 20 and 50 milliseconds", () => {
  assert.equal(getSlapComparisonWindow(3, 4), 20);
  assert.equal(getSlapComparisonWindow(15, 20), 35);
  assert.equal(getSlapComparisonWindow(30, 40), 50);
  assert.equal(
    getSlapComparisonWindow(Number.NaN, 5),
    30
  );
  assert.equal(
    getSlapComparisonWindow(Number.POSITIVE_INFINITY, 5),
    30
  );
  assert.equal(getSlapComparisonWindow(-10, -20), 20);
});

test("smoothly favors earlier slaps inside the jitter window", () => {
  const candidates = [
    {
      playerId: "early",
      receivedAtMs: 100,
      jitterMs: 2
    },
    {
      playerId: "slightly-later",
      receivedAtMs: 115,
      jitterMs: 2
    }
  ];

  assert.equal(
    selectWeightedSlapWinner(candidates, 0)?.playerId,
    "early"
  );

  assert.equal(
    selectWeightedSlapWinner(candidates, 0.99)?.playerId,
    "slightly-later"
  );
});

test("excludes slaps outside their jitter comparison window", () => {
  const candidates = [
    {
      playerId: "early",
      receivedAtMs: 100,
      jitterMs: 2
    },
    {
      playerId: "too-late",
      receivedAtMs: 121,
      jitterMs: 2
    }
  ];

  assert.equal(
    selectWeightedSlapWinner(candidates, 0.999)?.playerId,
    "early"
  );

  assert.equal(selectWeightedSlapWinner([]), undefined);
});

test("rejects non-finite slap candidates and random values safely", () => {
  const validCandidate = {
    playerId: "valid",
    receivedAtMs: 100,
    jitterMs: 5
  };
  const invalidCandidates = [
    {
      playerId: "nan-arrival",
      receivedAtMs: Number.NaN,
      jitterMs: 5
    },
    {
      playerId: "infinite-arrival",
      receivedAtMs: Number.POSITIVE_INFINITY,
      jitterMs: 5
    },
    {
      playerId: "nan-jitter",
      receivedAtMs: 90,
      jitterMs: Number.NaN
    }
  ];

  assert.equal(
    selectWeightedSlapWinner(
      [invalidCandidates[0], validCandidate],
      Number.NaN
    )?.playerId,
    "valid"
  );
  assert.equal(
    selectWeightedSlapWinner(invalidCandidates),
    undefined
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

test("deals every card from the configured number of decks", () => {
  const state = createEgyptianWarState(
    players,
    { ...settings, deckCount: 3 },
    () => 0
  );
  const dealtCards = state.players.flatMap((player) => player.cards);

  assert.equal(state.totalCardCount, 162);
  assert.equal(dealtCards.length, 162);
  assert.equal(new Set(dealtCards.map((card) => card.id)).size, 162);
});

test("public state exposes card counts but not hidden decks", () => {
  const state = createEgyptianWarState(players, settings, () => 0);
  const publicState = createPublicEgyptianWarState(state);
  const serializedState = JSON.stringify(publicState);

  assert.equal(publicState.currentPlayerId, players[0].id);
  assert.equal(publicState.isPaused, false);
  assert.equal(publicState.isAnimating, false);
  assert.equal(publicState.hasFaceUpCards, false);
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

test("defers a kicked player's cards until the current pile is awarded", () => {
  const state = makeState(
    [
      [card("4", "p1-4")],
      [card("6", "p2-6"), card("8", "p2-8")],
      [card("9", "p3-9")]
    ],
    {
      pile: [card("2", "pile-2"), card("2", "pile-2b")],
      totalCardCount: 6
    }
  );

  removeEgyptianWarPlayer(state, players[1].id);

  assert.equal(state.players.length, 2);
  assert.deepEqual(
    state.deferredCards.map((removedCard) => removedCard.id),
    ["p2-6", "p2-8"]
  );
  assert.deepEqual(
    state.pile.map((pileCard) => pileCard.id),
    ["pile-2", "pile-2b"]
  );

  applyEgyptianWarAction(state, players[0].id, "slap");

  assert.equal(state.players[0].cards.length, 3);
  assert.deepEqual(
    state.pile.map((pileCard) => pileCard.id),
    ["p2-6", "p2-8"]
  );
  assert.equal(state.penaltyPileCardCount, 2);
  assert.equal(createPublicEgyptianWarState(state).hasFaceUpCards, false);
  assert.match(state.activityMessage, /added face-down to the next pile/);
});

test("rejects slaps when the pile contains only face-down cards", () => {
  const state = makeState(
    [
      [card("4", "p1-4")],
      [card("6", "p2-6")]
    ],
    {
      pile: [card("2", "penalty-2")],
      penaltyPileCardCount: 1
    }
  );

  assert.throws(
    () => applyEgyptianWarAction(state, players[0].id, "slap"),
    /no face-up cards/
  );
  assert.equal(state.players[0].cards.length, 1);
});

test("kicking the final opponent finishes with the host as winner", () => {
  const state = makeState(
    [
      [card("4", "host-4")],
      [card("6", "opponent-6")]
    ],
    {
      pile: [card("8", "pile-8")],
      totalCardCount: 3
    }
  );

  removeEgyptianWarPlayer(state, players[1].id);

  assert.equal(state.status, "finished");
  assert.equal(state.winnerId, players[0].id);
  assert.equal(state.players[0].cards.length, 3);
  assert.equal(state.pile.length, 0);
  assert.equal(state.deferredCards.length, 0);
});

test("public state includes recent face-up cards for reconnect snapshots", () => {
  const state = makeState(
    [
      [card("4", "p1-4")],
      [card("6", "p2-6")]
    ],
    {
      pile: [
        card("9", "penalty-card"),
        card("2", "visible-2"),
        card("3", "visible-3")
      ],
      penaltyPileCardCount: 1
    }
  );

  const publicState = createPublicEgyptianWarState(state);

  assert.deepEqual(
    publicState.recentCards.map((visibleCard) => visibleCard.id),
    ["visible-2", "visible-3"]
  );
  assert.equal(publicState.topCard?.id, "visible-3");
  assert.equal(publicState.hasFaceUpCards, true);
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

test("uses the correct article when announcing played cards", () => {
  const numberCardState = makeState([
    [card("2", "p1-2"), card("4", "p1-4")],
    [card("3", "p2-3"), card("5", "p2-5")]
  ]);
  applyEgyptianWarAction(
    numberCardState,
    players[0].id,
    "play-card"
  );
  assert.match(numberCardState.activityMessage, /played a 2\./);

  const aceState = makeState([
    [card("ace", "p1-ace"), card("4", "p1-4")],
    [card("3", "p2-3"), card("5", "p2-5")]
  ]);
  applyEgyptianWarAction(aceState, players[0].id, "play-card");
  assert.match(aceState.activityMessage, /played an ace\./);
});

test("starts and passes face-card challenges, then awards the pile to the challenger", () => {
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
  assert.equal(state.players[0].cards.length, 4);
  assert.equal(state.players[1].cards.length, 1);
  assert.equal(state.pile.length, 0);
  assert.equal(state.currentPlayerIndex, 0);
  assert.equal(state.challenge, null);
});

test("awards a failed final challenge attempt to the challenger even if they ran out", () => {
  const state = makeState([
    [card("queen", "p1-q")],
    [
      card("3", "p2-3"),
      card("4", "p2-4"),
      card("5", "p2-5")
    ],
    [card("6", "p3-6")]
  ]);

  applyEgyptianWarAction(state, players[0].id, "play-card");
  assert.equal(state.players[0].isEliminated, true);

  applyEgyptianWarAction(state, players[1].id, "play-card");
  applyEgyptianWarAction(state, players[1].id, "play-card");

  assert.equal(state.players[0].cards.length, 3);
  assert.equal(state.players[0].isEliminated, false);
  assert.equal(state.players[1].cards.length, 1);
  assert.equal(state.players[1].isEliminated, false);
  assert.equal(state.winnerId, null);
  assert.equal(state.status, "playing");
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

test("a Joker starts a five-attempt challenge", () => {
  const state = makeState([
    [card("joker", "p1-joker"), card("2", "p1-2")],
    [card("3", "p2-3"), card("4", "p2-4")]
  ]);

  applyEgyptianWarAction(state, players[0].id, "play-card");

  assert.deepEqual(state.challenge, {
    challengerId: players[0].id,
    responderId: players[1].id,
    attemptsRemaining: 5
  });
});

test("a final failed challenge that creates a slap waits for a slap or timer", () => {
  const state = makeState(
    [
      [card("4", "p1-4")],
      [card("2", "p2-2"), card("3", "p2-3")]
    ],
    {
      pile: [card("2", "pile-2"), card("jack", "pile-jack")],
      currentPlayerIndex: 1,
      challenge: {
        challengerId: players[0].id,
        responderId: players[1].id,
        attemptsRemaining: 1
      }
    }
  );

  applyEgyptianWarAction(state, players[1].id, "play-card");

  assert.equal(state.pendingPileWinnerId, players[0].id);
  assert.equal(state.pile.length, 3);
  assert.equal(state.challenge, null);
  assert.equal(state.status, "playing");
  assert.throws(
    () => applyEgyptianWarAction(state, players[0].id, "play-card"),
    /pile is being resolved/
  );

  resolveEgyptianWarTurnTimeout(state);

  assert.equal(state.pendingPileWinnerId, null);
  assert.equal(state.pile.length, 0);
  assert.equal(state.players[0].cards.length, 4);
});

test("a slappable last card stays available so an eliminated player can reenter", () => {
  const state = makeState(
    [[card("2", "p1-last")], []],
    {
      pile: [card("2", "pile-2")],
      players: [
        { ...players[0], cards: [card("2", "p1-last")], isEliminated: false },
        { ...players[1], cards: [], isEliminated: true }
      ]
    }
  );

  applyEgyptianWarAction(state, players[0].id, "play-card");

  assert.equal(state.status, "playing");
  assert.equal(state.pendingPileWinnerId, players[0].id);
  assert.equal(state.pile.length, 2);

  applyEgyptianWarAction(state, players[1].id, "slap");

  assert.equal(state.winnerId, players[1].id);
  assert.equal(state.players[1].cards.length, 2);
  assert.equal(state.pile.length, 0);
});

test("removing a pending pile winner preserves the reentry slap window", () => {
  const state = makeState(
    [[], [], []],
    {
      pile: [card("2", "pile-1"), card("2", "pile-2")],
      players: players.map((player) => ({
        ...player,
        cards: [],
        isEliminated: true
      })),
      pendingPileWinnerId: players[0].id
    }
  );

  removeEgyptianWarPlayer(state, players[0].id);

  assert.equal(state.status, "playing");
  assert.equal(state.pendingPileWinnerId, players[1].id);
  assert.equal(state.pile.length, 2);

  applyEgyptianWarAction(state, players[2].id, "slap");

  assert.equal(state.winnerId, players[2].id);
  assert.equal(state.players[1].cards.length, 2);
});

test("passes remaining challenge attempts when a responder runs out of cards", () => {
  const state = makeState([
    [card("queen", "p1-q"), card("2", "p1-2")],
    [card("3", "p2-3")],
    [card("4", "p3-4"), card("5", "p3-5")]
  ]);

  applyEgyptianWarAction(state, players[0].id, "play-card");
  applyEgyptianWarAction(state, players[1].id, "play-card");

  assert.equal(state.players[1].isEliminated, true);
  assert.equal(state.players[0].cards.length, 1);
  assert.equal(state.players[1].cards.length, 0);
  assert.equal(state.currentPlayerIndex, 2);
  assert.equal(state.pile.length, 2);
  assert.deepEqual(state.challenge, {
    challengerId: players[0].id,
    responderId: players[2].id,
    attemptsRemaining: 1
  });

  applyEgyptianWarAction(state, players[2].id, "play-card");

  assert.equal(state.players[0].cards.length, 4);
  assert.equal(state.players[1].cards.length, 0);
  assert.equal(state.players[2].cards.length, 1);
  assert.equal(state.currentPlayerIndex, 0);
  assert.equal(state.pile.length, 0);
  assert.equal(state.challenge, null);
});

test("passes an untouched challenge to the next player when its responder has no cards", () => {
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

  assert.equal(state.players[1].isEliminated, true);
  assert.equal(state.players[1].cards.length, 0);
  assert.equal(state.pile.length, 2);
  assert.deepEqual(state.challenge, {
    challengerId: players[0].id,
    responderId: players[2].id,
    attemptsRemaining: 2
  });
  assert.equal(state.currentPlayerIndex, 2);
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

test("rejects out-of-turn plays and penalizes invalid slaps", () => {
  const state = makeState(
    [
      [card("2", "p1-2")],
      [card("3", "p2-3")],
      [card("4", "p3-4")]
    ],
    { pile: [card("6", "pile-6")] }
  );

  assert.throws(
    () => applyEgyptianWarAction(state, players[1].id, "play-card"),
    /not your turn/
  );
  applyEgyptianWarAction(state, players[1].id, "slap");
  assert.equal(state.players[1].cards.length, 0);
  assert.equal(state.players[1].isEliminated, true);
  assert.equal(state.pile.length, 2);
  assert.equal(state.pile[0].id, "p2-3");
  assert.equal(state.pile[1].id, "pile-6");
});

test("rejects slaps between rounds without moving or eliminating cards", () => {
  const state = makeState([
    [card("2", "p1-2")],
    [card("3", "p2-3")]
  ]);

  assert.throws(
    () => applyEgyptianWarAction(state, players[1].id, "slap"),
    /no face-up cards to slap/
  );
  assert.equal(state.players[1].cards.length, 1);
  assert.equal(state.players[1].isEliminated, false);
  assert.equal(state.pile.length, 0);
});

test("supports configured false-slap penalties of one and three cards", () => {
  for (const penaltyCards of [1, 3]) {
    const initialPileCard = card("2", `pile-${penaltyCards}`);
    const penaltyHand = [
      card("3", `p2-a-${penaltyCards}`),
      card("4", `p2-b-${penaltyCards}`),
      card("5", `p2-c-${penaltyCards}`)
    ];
    const state = makeState(
      [
        [card("6", `p1-${penaltyCards}`)],
        penaltyHand,
        [card("7", `p3-${penaltyCards}`)]
      ],
      {
        pile: [initialPileCard],
        settings: {
          ...settings,
          falseSlapPenaltyCards: penaltyCards
        }
      }
    );

    applyEgyptianWarAction(state, players[1].id, "slap");

    assert.equal(
      state.players[1].cards.length,
      3 - penaltyCards
    );
    assert.deepEqual(
      state.players[1].cards.map((heldCard) => heldCard.id),
      penaltyHand.slice(penaltyCards).map((heldCard) => heldCard.id)
    );
    assert.deepEqual(
      state.pile.map((pileCard) => pileCard.id),
      [
        ...penaltyHand
          .slice(0, penaltyCards)
          .map((penaltyCard) => penaltyCard.id),
        initialPileCard.id
      ]
    );
    assert.equal(state.players[0].cards[0].id, `p1-${penaltyCards}`);
    assert.equal(
      state.players[1].isEliminated,
      penaltyCards === penaltyHand.length
    );
    assert.equal(state.penaltyPileCardCount, penaltyCards);
  }
});

test("does not let repeated false-slap penalties create a valid slap", () => {
  const state = makeState(
    [
      [card("9", "p1-9"), card("8", "p1-8")],
      [
        card("5", "p2-5"),
        card("7", "p2-7"),
        card("joker", "p2-joker")
      ],
      [card("6", "p3-6")]
    ],
    {
      pile: [card("5", "pile-5")],
      settings: {
        ...settings,
        allowTopBottom: true,
        falseSlapPenaltyCards: 1
      }
    }
  );

  applyEgyptianWarAction(state, players[1].id, "slap");
  applyEgyptianWarAction(state, players[1].id, "slap");
  applyEgyptianWarAction(state, players[1].id, "slap");

  assert.equal(state.players[1].cards.length, 0);
  assert.equal(state.players[1].isEliminated, true);
  assert.equal(state.pile.length, 4);
  assert.equal(state.penaltyPileCardCount, 3);
  assert.equal(state.winnerId, null);
  assert.equal(
    isEgyptianWarPileSlappable(
      state.pile.slice(state.penaltyPileCardCount),
      state.settings
    ),
    false
  );
});

test("ends when only one card owner remains and no face-up slap is available", () => {
  const state = makeState(
    [
      [card("9", "p1-9")],
      [card("5", "p2-5")]
    ],
    {
      pile: [card("2", "pile-2")],
      currentPlayerIndex: 1,
      settings: {
        ...settings,
        falseSlapPenaltyCards: 1
      }
    }
  );

  applyEgyptianWarAction(state, players[1].id, "slap");

  assert.equal(state.status, "finished");
  assert.equal(state.winnerId, players[0].id);
  assert.equal(state.players[0].cards.length, 3);
  assert.equal(state.pile.length, 0);
  assert.equal(state.penaltyPileCardCount, 0);
});

test("keeps the game open for a valid reentry slap when one card owner remains", () => {
  const state = makeState([
    [card("9", "p1-9")],
    [card("2", "p2-2")]
  ], {
    pile: [card("2", "pile-2")],
    currentPlayerIndex: 1
  });

  applyEgyptianWarAction(state, players[1].id, "play-card");

  assert.equal(state.status, "playing");
  assert.equal(state.winnerId, null);
  assert.equal(state.players[1].isEliminated, true);
  assert.equal(state.pile.length, 2);

  applyEgyptianWarAction(state, players[1].id, "slap");

  assert.equal(state.players[1].isEliminated, false);
  assert.equal(state.players[1].cards.length, 2);
  assert.equal(state.pile.length, 0);
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
      [card("8")],
      { ...settings, allowTopBottom: true }
    ),
    false
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
  assert.equal(
    isEgyptianWarPileSlappable(
      [card("joker"), card("2")],
      { ...settings, includeJokers: true }
    ),
    false
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

test("a challenger never has to answer their own challenge", () => {
  const state = makeState([
    [card("ace", "p1-ace"), card("4", "p1-4"), card("5", "p1-5"), card("6", "p1-6")],
    [card("2", "p2-2"), card("2", "p2-2b")]
  ]);

  applyEgyptianWarAction(state, players[0].id, "play-card");
  applyEgyptianWarAction(state, players[1].id, "play-card");
  // The second 2 makes a double and empties the only opponent's hand.
  applyEgyptianWarAction(state, players[1].id, "play-card");

  assert.equal(state.challenge, null);
  assert.equal(state.pendingPileWinnerId, players[0].id);

  resolveEgyptianWarTurnTimeout(state);

  assert.equal(state.status, "finished");
  assert.equal(state.winnerId, players[0].id);
});

test("a slap from a player with no cards is ignored when the pile is not slappable", () => {
  const state = makeState(
    [
      [card("4", "p1-4"), card("5", "p1-5")],
      [card("6", "p2-6"), card("7", "p2-7")],
      []
    ],
    { pile: [card("2", "pile-2"), card("9", "pile-9")] }
  );
  state.players[2].isEliminated = true;
  const message = state.activityMessage;
  const version = state.pileVersion;

  assert.throws(
    () => applyEgyptianWarAction(state, players[2].id, "slap"),
    /did not count/
  );
  assert.equal(state.pile.length, 2);
  assert.equal(state.activityMessage, message);
  assert.equal(state.pileVersion, version);
});

test("messages about a pending final pile do not reveal that it is slappable", () => {
  const state = makeState(
    [
      [card("4", "p1-4")],
      [card("2", "p2-2"), card("3", "p2-3")]
    ],
    {
      pile: [card("2", "pile-2"), card("jack", "pile-jack")],
      currentPlayerIndex: 1,
      challenge: {
        challengerId: players[0].id,
        responderId: players[1].id,
        attemptsRemaining: 1
      }
    }
  );

  applyEgyptianWarAction(state, players[1].id, "play-card");

  assert.equal(state.pendingPileWinnerId, players[0].id);
  assert.doesNotMatch(state.activityMessage, /slap/i);
});

test("pileVersion changes only when the face-up pile changes", () => {
  const state = makeState([
    [card("4", "p1-4"), card("7", "p1-7")],
    [card("5", "p2-5"), card("9", "p2-9"), card("3", "p2-3")]
  ]);

  assert.equal(state.pileVersion, 0);

  applyEgyptianWarAction(state, players[0].id, "play-card");
  assert.equal(state.pileVersion, 1);

  // A false slap moves cards under the pile but leaves the face-up cards alone.
  applyEgyptianWarAction(state, players[1].id, "slap");
  assert.equal(state.pileVersion, 1);

  applyEgyptianWarAction(state, players[1].id, "play-card");
  assert.equal(state.pileVersion, 2);
  assert.equal(
    createPublicEgyptianWarState(state).pileVersion,
    2
  );
});

test("removing the only player who holds cards hands everything over immediately", () => {
  const state = makeState(
    [
      [card("4", "p1-4"), card("5", "p1-5"), card("6", "p1-6")],
      [],
      []
    ],
    { pile: [card("2", "pile-2"), card("9", "pile-9")] }
  );
  state.players[1].isEliminated = true;
  state.players[2].isEliminated = true;

  removeEgyptianWarPlayer(state, players[0].id);

  assert.equal(state.status, "finished");
  assert.equal(state.winnerId, players[1].id);
  assert.equal(state.deferredCards.length, 0);
});

test("public state does not expose slap-pattern flags", () => {
  const state = makeState(
    [[card("4", "p1-4")], [card("5", "p2-5")]],
    { pile: [card("9", "pile-9a"), card("9", "pile-9b")] }
  );
  const publicState = createPublicEgyptianWarState(state) as Record<string, unknown>;

  assert.equal("isSlappable" in publicState, false);
  assert.equal("isSlapWindow" in publicState, false);
});
