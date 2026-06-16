/**
 * Per-user rate limiter for the serverless API routes.
 *
 * Two windows per user so heavy, legitimate study isn't punished while abuse is
 * still bounded:
 *   - a generous DAILY budget = the real fair-use / cost ceiling (a serious
 *     learner won't reach it), and
 *   - a light per-MINUTE burst guard so a script can't spend the whole daily
 *     budget - or spike provider cost - in a single second. A human never gets
 *     near the burst (it's ~a request every 2s, sustained). Set perMin to 0 to
 *     disable the burst check entirely.
 *
 * Backed by a Redis-compatible REST store (Vercel KV / Upstash) via plain fetch.
 * FAILS OPEN: if the store isn't configured or is unreachable, requests are
 * allowed - a KV outage must never block a real user.
 *
 * Activate by connecting a Vercel KV / Upstash store to the project (injects
 * KV_REST_API_URL + KV_REST_API_TOKEN, or the UPSTASH_REDIS_REST_* names).
 */
const KV_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

const DAY_SEC = 86400;
const MIN_SEC = 60;

export interface RateLimitResult {
  /** false => over a limit; the caller should respond 429. */
  ok: boolean;
  /** Which window was exceeded, for a tailored message. */
  scope?: "minute" | "day";
}

export interface RateLimitOptions {
  /** Max requests per rolling day - the fair-use / cost ceiling. */
  perDay: number;
  /** Max requests per minute - anti-flood burst guard. 0 disables it. */
  perMin?: number;
}

/**
 * Fixed-window counters (one per window) for a user. One round-trip via the
 * Upstash REST pipeline: INCR each counter, and set its TTL only on the first
 * hit (EXPIRE ... NX) so the window is fixed, not sliding.
 */
export async function rateLimit(
  bucket: string,
  userId: string,
  { perDay, perMin = 0 }: RateLimitOptions
): Promise<RateLimitResult> {
  if (!KV_URL || !KV_TOKEN) return { ok: true }; // not configured -> off
  const dKey = `rl:${bucket}:d:${userId}`;
  const mKey = `rl:${bucket}:m:${userId}`;
  try {
    const cmds: string[][] = [
      ["INCR", dKey],
      ["EXPIRE", dKey, String(DAY_SEC), "NX"],
    ];
    if (perMin > 0) {
      cmds.push(["INCR", mKey], ["EXPIRE", mKey, String(MIN_SEC), "NX"]);
    }
    const data = (await kvPipeline(cmds)) as Array<{ result?: unknown }>;
    const dayCount = Number(data?.[0]?.result ?? 0);
    if (dayCount > perDay) return { ok: false, scope: "day" };
    if (perMin > 0 && Number(data?.[2]?.result ?? 0) > perMin) {
      return { ok: false, scope: "minute" };
    }
    return { ok: true };
  } catch (err) {
    // Store down / misconfigured -> fail open so the app keeps working.
    console.error(
      "[ratelimit] backend error, allowing request:",
      (err as Error)?.message
    );
    return { ok: true };
  }
}

async function kvPipeline(commands: string[][]): Promise<unknown> {
  const resp = await fetch(`${KV_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(2000),
  });
  if (!resp.ok) throw new Error(`KV ${resp.status}`);
  return resp.json();
}
