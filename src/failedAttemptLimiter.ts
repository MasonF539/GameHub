type AttemptWindow = {
  failures: number;
  expiresAt: number;
};

export class FailedAttemptLimiter {
  readonly #attempts = new Map<string, AttemptWindow>();

  constructor(
    private readonly maximumFailures: number,
    private readonly windowMs: number,
    private readonly maximumKeys = 10_000
  ) {
    if (maximumFailures < 1 || windowMs < 1 || maximumKeys < 1) {
      throw new Error("Rate-limit settings must be positive.");
    }
  }

  isBlocked(key: string, now = Date.now()): boolean {
    const window = this.#attempts.get(key);
    if (!window) return false;
    if (window.expiresAt <= now) {
      this.#attempts.delete(key);
      return false;
    }
    return window.failures >= this.maximumFailures;
  }

  recordFailure(key: string, now = Date.now()): void {
    const window = this.#attempts.get(key);
    if (!window) {
      this.#makeRoom(now);
      this.#attempts.set(key, {
        failures: 1,
        expiresAt: now + this.windowMs
      });
      return;
    }
    window.failures += 1;
  }

  clear(key: string): void {
    this.#attempts.delete(key);
  }

  // Only does work when the map is full, so a failure never costs a full scan
  // and a flood of unique keys cannot grow the map without limit.
  #makeRoom(now: number): void {
    if (this.#attempts.size < this.maximumKeys) return;

    for (const [key, window] of this.#attempts) {
      if (window.expiresAt <= now) this.#attempts.delete(key);
    }

    while (this.#attempts.size >= this.maximumKeys) {
      const oldest = this.#attempts.keys().next();
      if (oldest.done) break;
      this.#attempts.delete(oldest.value);
    }
  }
}
