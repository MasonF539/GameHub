type AttemptWindow = {
  failures: number;
  expiresAt: number;
};

export class FailedAttemptLimiter {
  readonly #attempts = new Map<string, AttemptWindow>();

  constructor(
    private readonly maximumFailures: number,
    private readonly windowMs: number
  ) {
    if (maximumFailures < 1 || windowMs < 1) {
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
    this.#pruneExpired(now);
    const window = this.#attempts.get(key);
    if (!window) {
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

  #pruneExpired(now: number): void {
    for (const [key, window] of this.#attempts) {
      if (window.expiresAt <= now) this.#attempts.delete(key);
    }
  }
}
