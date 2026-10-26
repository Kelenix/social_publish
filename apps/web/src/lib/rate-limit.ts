/**
 * Limiteur d'échecs en mémoire : suffisant pour un seul administrateur et un seul processus web.
 * Après `max` échecs, la clé est bloquée pendant `windowMs`.
 */
export function createFailureLimiter(max: number, windowMs: number, now = () => Date.now()) {
  const entries = new Map<string, { count: number; until: number }>();
  return {
    retryAfterSeconds(key: string): number {
      const entry = entries.get(key);
      if (!entry || entry.until <= now()) return 0;
      return entry.count >= max ? Math.ceil((entry.until - now()) / 1000) : 0;
    },
    fail(key: string): void {
      const entry = entries.get(key);
      const fresh = !entry || entry.until <= now();
      entries.set(key, { count: fresh ? 1 : entry.count + 1, until: fresh ? now() + windowMs : entry.until });
    },
    reset(key: string): void {
      entries.delete(key);
    },
  };
}

export const loginLimiter = createFailureLimiter(5, 15 * 60 * 1000);
