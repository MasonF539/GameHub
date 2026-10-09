import assert from "node:assert/strict";
import test from "node:test";
import { FailedAttemptLimiter } from "./failedAttemptLimiter.js";

test("blocks a key after the configured number of failures", () => {
  const limiter = new FailedAttemptLimiter(2, 1_000);

  limiter.recordFailure("client", 100);
  assert.equal(limiter.isBlocked("client", 101), false);
  limiter.recordFailure("client", 102);
  assert.equal(limiter.isBlocked("client", 103), true);
});

test("expired and successful attempt windows can be cleared", () => {
  const limiter = new FailedAttemptLimiter(1, 100);

  limiter.recordFailure("expired", 100);
  assert.equal(limiter.isBlocked("expired", 200), false);

  limiter.recordFailure("successful", 300);
  limiter.clear("successful");
  assert.equal(limiter.isBlocked("successful", 301), false);
});
