/**
 * Tiny per-class localStorage cache for the study-tool history lists (Quiz +
 * Flashcards). The history loads from the server on open, so the history
 * button's count badge + list used to pop in a beat late. Seeding state from
 * this cache on open shows them INSTANTLY, while the fresh (user-scoped) fetch
 * runs in the background and overwrites it (stale-while-revalidate).
 *
 * Keyed by tool + class only (not user) so the seed stays synchronous; the
 * background fetch is user-scoped and corrects any mismatch within a few ms, and
 * the dropdown list isn't visible on open (only the count is) so nothing
 * sensitive is shown from a stale cache.
 */
const PREFIX = "lumiStudyHistory";

export function readHistoryCache<T>(tool: string, classId: string): T[] | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}:${tool}:${classId}`);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as T[]) : null;
  } catch {
    return null;
  }
}

export function writeHistoryCache(
  tool: string,
  classId: string,
  items: unknown[]
): void {
  try {
    localStorage.setItem(
      `${PREFIX}:${tool}:${classId}`,
      JSON.stringify(items)
    );
  } catch {
    /* quota / disabled - just lose the instant-load optimization */
  }
}
