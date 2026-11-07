// In-memory fixed-window limiter (single-process). `now` is injectable for tests.
type Entry = { count: number; resetAt: number };

const globalForRl = globalThis as unknown as { __rateLimit?: Map<string, Entry> };
const store = globalForRl.__rateLimit ?? (globalForRl.__rateLimit = new Map<string, Entry>());

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now()
): { allowed: boolean; retryAfterSec: number } {
  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (store.size > 10_000) {
    for (const [k, e] of store) if (e.resetAt <= now) store.delete(k);
  }
  let e = store.get(key);
  if (!e || e.resetAt <= now) {
    e = { count: 0, resetAt: now + windowMs };
    store.set(key, e);
  }
  if (e.count >= max) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((e.resetAt - now) / 1000)) };
  }
  e.count++;
  return { allowed: true, retryAfterSec: 0 };
}
