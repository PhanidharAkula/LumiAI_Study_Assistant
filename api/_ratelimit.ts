/**
 * Per-user rate limiter for the serverless API routes.
 *
 * Caps how many times a single signed-in user can hit the AI / TTS endpoints in
 * a short window, so one account can't script thousands of calls and run up
 * provider cost. Backed by a Redis-compatible REST store (Vercel KV or Upstash)
 * via plain fetch - no SDK dependency.
 *
 * FAILS OPEN: if the store isn't configured (no env vars) or is unreachable, it
 * allows the request. A KV outage (or not having set one up yet) must never
 * block a paying user from chatting - we'd rather lose limiting than the app.
 *
 * Setup to ACTIVATE: create a Vercel KV / Upstash store and connect it to the
 * project; that injects KV_REST_API_URL + KV_REST_API_TOKEN (or the
 * UPSTASH_REDIS_REST_* equivalents). Until then this is a no-op.
 */
const KV_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export interface RateLimitResult {
  /** false => over the limit; the caller should respond 429. */
  ok: boolean;
  /** Requests left in the current window (best-effort). */
  remaining: number;
}

/**
 * Fixed-window counter: allow up to `limit` requests per `windowSec` per user.
 * One round-trip (INCR + first-hit EXPIRE) via the Upstash REST pipeline.
 */
export async function rateLimit(
  bucket: string,
  userId: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  if (!KV_URL || !KV_TOKEN) return { ok: true, remaining: limit }; // not configured
  const key = `rl:${bucket}:${userId}`;
  try {
    const resp = await fetch(`${KV_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        "Content-Type": "application/json",
      },
      // INCR returns the new count; EXPIRE ... NX sets the TTL only on the first
      // hit of the window, so the window is fixed (it doesn't slide on each call).
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(windowSec), "NX"],
      ]),
      signal: AbortSignal.timeout(2000),
    });
    if (!resp.ok) throw new Error(`KV ${resp.status}`);
    const data = (await resp.json()) as Array<{ result?: unknown }>;
    const count = Number(data?.[0]?.result ?? 0);
    return { ok: count <= limit, remaining: Math.max(0, limit - count) };
  } catch (err) {
    // Store down / misconfigured -> fail open so chat keeps working.
    console.error(
      "[ratelimit] backend error, allowing request:",
      (err as Error)?.message
    );
    return { ok: true, remaining: limit };
  }
}
