import assert from "node:assert/strict";
import test from "node:test";
import type {
  GameEvent,
  GameMember,
  GameSessionContext
} from "@gamehub/game-sdk";
import type { PublicEgyptianWarState } from "./engine.js";
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
      if (current.isSlappable) break;
      assert.ok(current.currentPlayerId);
      const result = await session.handleAction(current.currentPlayerId, {
        type: "play-card"
      });
      assert.equal(result.success, true);
    }

    assert.equal(state().isSlappable, true, "expected a valid slap");
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
