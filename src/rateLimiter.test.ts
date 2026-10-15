import assert from "node:assert/strict";
import test from "node:test";
import { RateLimiter } from "./rateLimiter.js";

test("allows the configured number of events per window, then blocks", () => {
  const limiter = new RateLimiter(3, 1_000);

  assert.equal(limiter.consume("a", 0), true);
  assert.equal(limiter.consume("a", 1), true);
  assert.equal(limiter.consume("a", 2), true);
  assert.equal(limiter.consume("a", 3), false);
  assert.equal(limiter.consume("b", 3), true, "other keys are independent");
});

test("a new window starts after the old one expires", () => {
  const limiter = new RateLimiter(1, 100);

  assert.equal(limiter.consume("a", 0), true);
  assert.equal(limiter.consume("a", 50), false);
  assert.equal(limiter.consume("a", 150), true);
});

test("forget clears a key", () => {
  const limiter = new RateLimiter(1, 1_000);

  limiter.consume("a", 0);
  limiter.forget("a");
  assert.equal(limiter.consume("a", 1), true);
});

test("never tracks more keys than the cap", () => {
  const limiter = new RateLimiter(1, 1_000, 3);

  for (let index = 0; index < 50; index += 1) {
    limiter.consume(`key-${index}`, index);
  }
  // The oldest keys were evicted, so the first key is fresh again.
  assert.equal(limiter.consume("key-0", 60), true);
  assert.equal(limiter.consume("key-49", 60), false);
});
