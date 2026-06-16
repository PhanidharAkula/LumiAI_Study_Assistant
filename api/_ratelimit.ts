/**
 * Per-user usage budget for the serverless AI routes.
 *
 * ONE shared daily TOKEN budget per user, drawn down by every AI feature (chat,
 * quiz/flashcard generation, and voice) so cost is capped by what's actually
 * billed - tokens - not by a request count. Plus a light per-minute request
 * burst guard so a script can't fire many calls in parallel and blow the budget
 * (or spike cost) in one second; a human never approaches it.
 *
 * Backed by a Redis-compatible REST store (Vercel KV / Upstash) via plain fetch.
 * FAILS OPEN: if the store isn't configured or is unreachable, requests are
 * allowed and usage reads as 0 - an outage must never block a real user.
 *
 * Activate by connecting a Vercel KV / Upstash store to the project (injects
 * KV_REST_API_URL + KV_REST_API_TOKEN, or the UPSTASH_REDIS_REST_* names).
 */
const KV_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const KV_CONFIGURED = !!(KV_URL && KV_TOKEN);

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_ANON =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

const DAY_SEC = 86400;
const MIN_SEC = 60;

const tokKey = (userId: string) => `tok:${userId}`;
const burstKey = (userId: string) => `burst:${userId}`;

/** Tokens (input+output) a user has consumed today. 0 if no store / on error. */
export async function getDailyTokens(userId: string): Promise<number> {
  if (!KV_CONFIGURED) return 0;
  try {
    const v = await kvSingle(["GET", tokKey(userId)]);
    return Number(v ?? 0) || 0;
  } catch (err) {
    console.error("[budget] getDailyTokens failed:", (err as Error)?.message);
    return 0; // fail open
  }
}

/** Add to a user's daily token total; sets the 24h TTL on the first write. */
export async function addDailyTokens(
  userId: string,
  tokens: number
): Promise<void> {
  if (!KV_CONFIGURED || !(tokens > 0)) return;
  const key = tokKey(userId);
  try {
    await kvPipe([
      ["INCRBY", key, String(Math.ceil(tokens))],
      ["EXPIRE", key, String(DAY_SEC), "NX"],
    ]);
  } catch (err) {
    console.error("[budget] addDailyTokens failed:", (err as Error)?.message);
  }
}

/** Anti-flood: true if the user is under `perMin` requests this minute. */
export async function burstOk(userId: string, perMin: number): Promise<boolean> {
  if (!KV_CONFIGURED || !(perMin > 0)) return true;
  const key = burstKey(userId);
  try {
    const res = await kvPipe([
      ["INCR", key],
      ["EXPIRE", key, String(MIN_SEC), "NX"],
    ]);
    return Number(res?.[0]?.result ?? 0) <= perMin;
  } catch (err) {
    console.error("[budget] burstOk failed:", (err as Error)?.message);
    return true; // fail open
  }
}

// --- Admin-configurable daily limit (app_settings.daily_token_limit) ---
let limitCache = { value: 0, at: 0 };
const LIMIT_TTL_MS = 60_000;

/**
 * The shared daily token limit: from app_settings (the admin slider), cached
 * 60s, falling back to LUMI_DAILY_TOKENS or 50000. Needs the caller's bearer
 * token because app_settings is authenticated-read.
 */
export async function getDailyTokenLimit(userToken: string): Promise<number> {
  const fallback = Number(process.env.LUMI_DAILY_TOKENS) || 50000;
  const now = Date.now();
  if (limitCache.value && now - limitCache.at < LIMIT_TTL_MS) {
    return limitCache.value;
  }
  if (!SUPABASE_URL || !SUPABASE_ANON || !userToken) return fallback;
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/app_settings?key=eq.daily_token_limit&select=value`,
      {
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${userToken}` },
        signal: AbortSignal.timeout(2000),
      }
    );
    if (!resp.ok) return limitCache.value || fallback;
    const rows = (await resp.json()) as Array<{ value?: unknown }>;
    const n = Number(rows?.[0]?.value);
    const limit = Number.isFinite(n) && n > 0 ? n : fallback;
    limitCache = { value: limit, at: now };
    return limit;
  } catch (err) {
    console.error(
      "[budget] getDailyTokenLimit failed:",
      (err as Error)?.message
    );
    return limitCache.value || fallback;
  }
}

function kvHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${KV_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function kvSingle(cmd: (string | number)[]): Promise<unknown> {
  const resp = await fetch(KV_URL, {
    method: "POST",
    headers: kvHeaders(),
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(2000),
  });
  if (!resp.ok) throw new Error(`KV ${resp.status}`);
  return ((await resp.json()) as { result?: unknown })?.result;
}

async function kvPipe(
  cmds: (string | number)[][]
): Promise<Array<{ result?: unknown }>> {
  const resp = await fetch(`${KV_URL}/pipeline`, {
    method: "POST",
    headers: kvHeaders(),
    body: JSON.stringify(cmds),
    signal: AbortSignal.timeout(2000),
  });
  if (!resp.ok) throw new Error(`KV ${resp.status}`);
  return resp.json();
}
