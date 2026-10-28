type AttemptWindow = {
  failures: number;
  expiresAt: number;
};

export class FailedAttemptLimiter {
  readonly #attempts = new Map<string, AttemptWindow>();

  /** Creates a bounded failed-attempt limiter with the configured failure threshold and window. */
  constructor(
    private readonly maximumFailures: number,
    private readonly windowMs: number,
    private readonly maximumKeys = 10_000
  ) {
    if (maximumFailures < 1 || windowMs < 1 || maximumKeys < 1) {
      throw new Error("Rate-limit settings must be positive.");
    }
  }

  /** Checks whether a key has reached its failure limit within the current time window. */
  isBlocked(key: string, now = Date.now()): boolean {
    const window = this.#attempts.get(key);
    if (!window) return false;
    if (window.expiresAt <= now) {
      this.#attempts.delete(key);
      return false;
    }
    return window.failures >= this.maximumFailures;
  }

  /** Records a failed attempt, starting a new window when the previous one expired. */
  recordFailure(key: string, now = Date.now()): void {
    const window = this.#attempts.get(key);
    if (!window || window.expiresAt <= now) {
      this.#makeRoom(now);
      this.#attempts.set(key, {
        failures: 1,
        expiresAt: now + this.windowMs
      });
      return;
    }
    window.failures += 1;
  }

  /** Clears a key's recorded failures after successful validation. */
  clear(key: string): void {
    this.#attempts.delete(key);
  }

  // Only does work when the map is full, so a failure never costs a full scan
  // and a flood of unique keys cannot grow the map without limit.
  /** Evicts expired and then oldest entries when the bounded limiter map is full. */
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
