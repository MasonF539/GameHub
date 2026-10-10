import assert from "node:assert/strict";
import test from "node:test";
import type {
  GameEvent,
  GameMember,
  GameSessionContext
} from "@gamehub/game-sdk";
import type { Card } from "./definition.js";
import {
  isEgyptianWarStateSlappable,
  type EgyptianWarState,
  type PublicEgyptianWarState
} from "./engine.js";
import { egyptianWarServer } from "./session.js";

const settings = {
  deckCount: 1,
  includeJokers: true,
  allowDoubles: true,
  allowSandwiches: true,
  allowFourInARow: true,
  allowTopBottom: true,
  allowTens: true,
  allowMarriage: true,
  falseSlapPenaltyCards: 2,
  turnTimerSeconds: 120
};

function internals(session: unknown): { state: EgyptianWarState } {
  return session as { state: EgyptianWarState };
}

function card(rank: Card["rank"], id: string): Card {
  return { id, rank, suit: rank === "joker" ? null : "clubs" };
}

function makeSession(playerCount = 3, overrides: Record<string, number | boolean> = {}) {
  const names = ["host", "guest", "third"];
  const members: GameMember[] = names.slice(0, playerCount).map((id) => ({
    id,
    name: id,
    avatar: "\u{1F431}",
    isConnected: true,
    role: "player"
  }));
  const events: GameEvent[] = [];
  const context: GameSessionContext = {
    roomCode: "TEST01",
    members: () => members,
    broadcastState: () => {},
    emitEvent: (event) => events.push(event),
    finish: () => {},
    now: Date.now,
    randomInteger: (maxExclusive) => maxExclusive - 1
  };
  const session = egyptianWarServer.createSession(context, { ...settings, ...overrides });
  return { session, events, members };
}

function deal(session: unknown, hands: Card[][], pile: Card[]): void {
  const state = internals(session).state;
  state.players.forEach((player, index) => {
    player.cards = hands[index] ?? [];
    player.isEliminated = player.cards.length === 0;
  });
  state.pile = pile;
  state.penaltyPileCardCount = 0;
  state.currentPlayerIndex = 0;
  state.totalCardCount =
    hands.reduce((total, hand) => total + hand.length, 0) + pile.length;
}

function animationEvents(events: GameEvent[]): Array<Record<string, unknown>> {
  return events
    .filter((event) => event.type === "animation")
    .map((event) => event.payload as Record<string, unknown>);
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 5_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for the Egyptian War session.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("accepted slaps survive a disconnect pause", { timeout: 30_000 }, async () => {
  const members: GameMember[] = [
    {
      id: "host",
      name: "Host",
      avatar: "\u{1F431}",
      isConnected: true,
      role: "player"
    },
    {
      id: "guest",
      name: "Guest",
      avatar: "\u{1F436}",
      isConnected: true,
      role: "player"
    }
  ];
  const events: GameEvent[] = [];
  const context: GameSessionContext = {
    roomCode: "TEST01",
    members: () => members,
    broadcastState: () => {},
    emitEvent: (event) => events.push(event),
    finish: () => {},
    now: Date.now,
    randomInteger: (maxExclusive) => maxExclusive - 1
  };
  const session = egyptianWarServer.createSession(context, settings);
  const state = (): PublicEgyptianWarState =>
    session.getPublicState({ memberId: "host", role: "player" }) as
      PublicEgyptianWarState;

  try {
    session.start?.();
    for (let turns = 0; turns < 54; turns += 1) {
      await waitUntil(() => !state().isAnimating);
      const current = state();
      if (isEgyptianWarStateSlappable(internals(session).state)) break;
      assert.ok(current.currentPlayerId);
      const result = await session.handleAction(current.currentPlayerId, {
        type: "play-card"
      });
      assert.equal(result.success, true);
    }

    assert.equal(
      isEgyptianWarStateSlappable(internals(session).state),
      true,
      "expected a valid slap"
    );
    assert.equal((await session.handleAction("host", { type: "slap" })).success, true);

    const pauseResult = session.pause?.();
    assert.equal(pauseResult?.success, false);
    assert.match(pauseResult?.message ?? "", /slap decision/i);

    assert.equal((await session.handleAction("guest", { type: "slap" })).success, true);
    members[1].isConnected = false;
    session.memberDisconnected?.("guest");

    await waitUntil(() => events.some(
      (event) =>
        event.type === "animation" &&
        typeof event.payload === "object" &&
        event.payload !== null &&
        "action" in event.payload &&
        event.payload.action === "slap"
    ));
    const slapEvent = [...events].reverse().find(
      (event) =>
        event.type === "animation" &&
        typeof event.payload === "object" &&
        event.payload !== null &&
        "action" in event.payload &&
        event.payload.action === "slap"
    );
    assert.ok(slapEvent);
    const payload = slapEvent.payload as {
      slapAttempts: Array<{
        playerId: string;
        delayMs: number;
        isWinner: boolean;
      }>;
    };
    assert.equal(payload.slapAttempts.length, 2);
    assert.equal(
      payload.slapAttempts.filter((attempt) => attempt.isWinner).length,
      1
    );
    assert.ok(
      payload.slapAttempts.every((attempt) => Number.isFinite(attempt.delayMs))
    );
    assert.equal(state().isPaused, true);
  } finally {
    session.dispose();
  }
});

test("slaps are accepted while a card-play animation is running", { timeout: 15_000 }, async () => {
  const { session, events } = makeSession();

  try {
    deal(
      session,
      [
        [card("9", "h-9"), card("4", "h-4"), card("5", "h-5")],
        [card("8", "g-8"), card("3", "g-3"), card("6", "g-6")],
        [card("7", "t-7"), card("10", "t-10"), card("2", "t-2")]
      ],
      [card("9", "pile-9")]
    );
    session.start?.();

    // The host's 9 lands on a 9 (a double). The 650 ms card animation starts.
    assert.equal((await session.handleAction("host", { type: "play-card" })).success, true);
    assert.equal(session.getLifecycleState?.().isBusy, true);

    const early = await session.handleAction("guest", { type: "slap" });
    assert.equal(early.success, true, "a slap during the card animation must be collected");

    await waitUntil(() => animationEvents(events).some((event) => event.action === "slap"));
    const slap = animationEvents(events).find((event) => event.action === "slap");
    assert.equal(slap?.winnerId, "guest");
    assert.equal(internals(session).state.pile.length, 0);

    const cardPlay = animationEvents(events).find((event) => event.action === "play-card");
    assert.equal(cardPlay?.durationMs, 650);
    assert.equal(cardPlay?.allowsSlaps, true);
  } finally {
    session.dispose();
  }
});

test("a player with no cards cannot lock the table with free false slaps", { timeout: 15_000 }, async () => {
  const { session } = makeSession();

  try {
    deal(
      session,
      [
        [card("4", "h-4"), card("5", "h-5")],
        [card("6", "g-6"), card("7", "g-7")],
        []
      ],
      [card("2", "pile-2"), card("9", "pile-9")]
    );
    session.start?.();

    const result = await session.handleAction("third", { type: "slap" });
    assert.equal(result.success, false);
    assert.equal(session.getLifecycleState?.().isBusy, false);

    // The current player can still act immediately.
    assert.equal((await session.handleAction("host", { type: "play-card" })).success, true);
  } finally {
    session.dispose();
  }
});

test("a slap that lost a race with a card play is forgiven, a late one is not", { timeout: 15_000 }, async () => {
  const { session } = makeSession();

  try {
    deal(
      session,
      [
        [card("4", "h-4"), card("5", "h-5"), card("6", "h-6")],
        [card("8", "g-8"), card("3", "g-3"), card("7", "g-7"), card("10", "g-10")],
        [card("2", "t-2"), card("jack", "t-jack"), card("queen", "t-queen")]
      ],
      [card("9", "pile-9a"), card("9", "pile-9b")]
    );
    const state = internals(session).state;
    session.start?.();

    const seenVersion = state.pileVersion;
    // The host answers the double with a plain card instead of slapping.
    assert.equal((await session.handleAction("host", { type: "play-card" })).success, true);
    assert.equal(state.pileVersion, seenVersion + 1);

    const guestCards = state.players[1].cards.length;
    const forgiven = await session.handleAction("guest", {
      type: "slap",
      payload: { pileVersion: seenVersion }
    });
    assert.equal(forgiven.success, false);
    assert.match(forgiven.message ?? "", /no penalty/i);
    assert.equal(state.players[1].cards.length, guestCards);

    // Once the animation and the grace period are over, a stale slap is a false slap.
    await new Promise((resolve) => setTimeout(resolve, 800));
    await waitUntil(() => !(session.getPublicState({ memberId: "guest", role: "player" }) as PublicEgyptianWarState).isAnimating);
    const late = await session.handleAction("guest", {
      type: "slap",
      payload: { pileVersion: seenVersion }
    });
    assert.equal(late.success, true);
    assert.equal(state.players[1].cards.length, guestCards - 2);
  } finally {
    session.dispose();
  }
});

test("the final-card slap window is much shorter than a full turn", () => {
  const { session } = makeSession();

  try {
    const viewer = { memberId: "host", role: "player" } as const;
    const normal = session.getPublicState(viewer) as PublicEgyptianWarState;
    assert.equal(normal.turnTimerSeconds, 120);

    internals(session).state.pendingPileWinnerId = "host";
    const windowState = session.getPublicState(viewer) as PublicEgyptianWarState;
    assert.equal(windowState.turnTimerSeconds, 4);
  } finally {
    session.dispose();
  }
});
