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

/**
 * Cost-weighted tokens for the daily budget. A raw sum of the usage buckets
 * over-meters cached conversations badly: a cache READ is billed at ~10% of
 * the base input price (that's the point of the prompt caching /api/chat sets
 * up), but a raw sum counts it at 100% - so a long chat drains the budget
 * 5-10x faster than its actual cost. Weight each bucket by its price relative
 * to base input tokens (cache write 1.25x, cache read 0.1x) so the meter
 * tracks what a turn really costs.
 */
export function meteredTokens(
  u:
    | {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      }
    | null
    | undefined
): number {
  if (!u) return 0;
  return Math.ceil(
    (u.input_tokens ?? 0) +
      (u.output_tokens ?? 0) +
      1.25 * (u.cache_creation_input_tokens ?? 0) +
      0.1 * (u.cache_read_input_tokens ?? 0)
  );
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

// --- Admin-configurable limits (app_settings, set via the admin sliders) ---
const settingCache = new Map<string, { value: number; at: number }>();
const SETTING_TTL_MS = 60_000;

/** Read a positive numeric app_setting (admin slider), cached 60s per key,
 *  falling back to `fallback`. Needs the caller's bearer token (app_settings is
 *  authenticated-read). */
async function getNumericSetting(
  key: string,
  fallback: number,
  userToken: string
): Promise<number> {
  const now = Date.now();
  const cached = settingCache.get(key);
  if (cached && now - cached.at < SETTING_TTL_MS) return cached.value;
  if (!SUPABASE_URL || !SUPABASE_ANON || !userToken) {
    return cached?.value ?? fallback;
  }
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/app_settings?key=eq.${key}&select=value`,
      {
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${userToken}` },
        signal: AbortSignal.timeout(2000),
      }
    );
    if (!resp.ok) return cached?.value ?? fallback;
    const rows = (await resp.json()) as Array<{ value?: unknown }>;
    const n = Number(rows?.[0]?.value);
    const value = Number.isFinite(n) && n > 0 ? n : fallback;
    settingCache.set(key, { value, at: now });
    return value;
  } catch (err) {
    console.error(`[budget] getNumericSetting(${key}) failed:`, (err as Error)?.message);
    return cached?.value ?? fallback;
  }
}

/** Shared daily token limit (admin slider; env LUMI_DAILY_TOKENS; default 50k). */
export function getDailyTokenLimit(userToken: string): Promise<number> {
  return getNumericSetting(
    "daily_token_limit",
    Number(process.env.LUMI_DAILY_TOKENS) || 50000,
    userToken
  );
}

/** Per-chat context limit before auto-compaction (admin slider; default 50k). */
export function getContextLimit(userToken: string): Promise<number> {
  return getNumericSetting(
    "chat_context_limit",
    Number(process.env.LUMI_CONTEXT_TOKENS) || 50000,
    userToken
  );
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
