/**
 * Vercel serverless function - daily usage readout.
 *
 * Returns the signed-in user's shared daily token budget (used / limit /
 * remaining) so the client can render a usage bar across every AI surface.
 * Auth-gated; reads the same counter and admin-set limit the chat/tts endpoints
 * enforce. Reads as the full budget (used 0) until a KV store is connected.
 */
import { getAuthedUser } from "./_auth.js";
import {
  getDailyTokens,
  getDailyTokenLimit,
  getContextLimit,
} from "./_ratelimit.js";

function sendJson(res: any, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const auth = await getAuthedUser(req);
  if (!auth.ok) {
    return sendJson(res, auth.status, {
      error:
        auth.status === 401 ? "Please sign in." : "Usage is unavailable now.",
    });
  }

  const [used, limit, contextLimit] = await Promise.all([
    getDailyTokens(auth.userId),
    getDailyTokenLimit(auth.token),
    getContextLimit(auth.token),
  ]);

  return sendJson(res, 200, {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    contextLimit,
  });
}
