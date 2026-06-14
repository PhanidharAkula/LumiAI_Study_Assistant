/**
 * Shared auth for the serverless API routes.
 *
 * Verifies the caller's Supabase session from the Bearer access token so an
 * endpoint can't be hit anonymously to burn provider credits. Validates against
 * Supabase's auth endpoint with the public URL + anon key (no secrets needed),
 * and distinguishes a bad/missing token (401) from the auth service being
 * unreachable (503) so a brief blip doesn't tell a signed-in user to re-login.
 *
 * Underscore-prefixed so the platform treats it as a helper module imported by
 * the route handlers, not as a route of its own.
 */
export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 503 };

export async function getAuthedUser(req: any): Promise<AuthResult> {
  const header: string =
    req.headers?.authorization || req.headers?.Authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401 };

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon =
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error("[auth] Supabase URL/anon key not set - cannot verify session");
    return { ok: false, status: 503 };
  }

  try {
    const resp = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
      // Don't let a hung auth endpoint hang the whole request.
      signal: AbortSignal.timeout(8000),
    });
    // A real auth rejection is the only "please sign in" case; anything else
    // (5xx, unexpected) is a service problem, not the user's token.
    if (resp.status === 401 || resp.status === 403) {
      return { ok: false, status: 401 };
    }
    if (!resp.ok) return { ok: false, status: 503 };
    const user = (await resp.json()) as { id?: string };
    return user?.id ? { ok: true, userId: user.id } : { ok: false, status: 401 };
  } catch (err: any) {
    // Network error / timeout: the auth service is unreachable, not a bad token.
    console.error("[auth] session verification failed:", err?.message);
    return { ok: false, status: 503 };
  }
}
