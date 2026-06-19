/**
 * First-run tour "seen" flag - persisted per user in localStorage (matches the
 * app's other lumi* caches: wrapped in try/catch, never throws). Keyed by user
 * id so a shared browser doesn't hide the tour from a different account, and
 * falls back to an unscoped key when the id isn't known yet.
 */
const KEY = "lumiTourSeen";

function keyFor(userId?: string | null): string {
  return userId ? `${KEY}:${userId}` : KEY;
}

export function isTourSeen(userId?: string | null): boolean {
  try {
    return localStorage.getItem(keyFor(userId)) === "1";
  } catch {
    return false;
  }
}

export function markTourSeen(userId?: string | null): void {
  try {
    localStorage.setItem(keyFor(userId), "1");
  } catch {
    /* quota / disabled - the tour will simply show again next time */
  }
}
