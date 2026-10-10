type RateWindow = {
  count: number;
  expiresAt: number;
};

/**
 * Fixed-window rate limiter: allows `maximumEvents` per `windowMs` per key.
 * The number of tracked keys is capped so a flood of unique keys cannot
 * grow memory without limit.
 */
export class RateLimiter {
  readonly #windows = new Map<string, RateWindow>();

  constructor(
    private readonly maximumEvents: number,
    private readonly windowMs: number,
    private readonly maximumKeys = 10_000
  ) {
    if (maximumEvents < 1 || windowMs < 1 || maximumKeys < 1) {
      throw new Error("Rate-limit settings must be positive.");
    }
  }

  /** Counts one event for the key. Returns false when the key is over its limit. */
  consume(key: string, now = Date.now()): boolean {
    const existing = this.#windows.get(key);

    if (!existing || existing.expiresAt <= now) {
      this.#makeRoom(now);
      this.#windows.set(key, { count: 1, expiresAt: now + this.windowMs });
      return true;
    }

    existing.count += 1;
    return existing.count <= this.maximumEvents;
  }

  forget(key: string): void {
    this.#windows.delete(key);
  }

  #makeRoom(now: number): void {
    if (this.#windows.size < this.maximumKeys) {
      return;
    }

    for (const [key, window] of this.#windows) {
      if (window.expiresAt <= now) this.#windows.delete(key);
    }

    while (this.#windows.size >= this.maximumKeys) {
      const oldest = this.#windows.keys().next();
      if (oldest.done) break;
      this.#windows.delete(oldest.value);
    }
  }
}
