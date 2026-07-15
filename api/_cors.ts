/**
 * Shared CORS for the serverless API routes.
 *
 * The website calls /api/* same-origin and never needs CORS. The native mobile
 * apps (Capacitor shells) load the UI from a local origin instead -
 * capacitor://localhost on iOS, https://localhost on Android - and call the
 * production API cross-origin, so the browser engine inside the app enforces
 * CORS and preflights every call (they all carry the Supabase Bearer token).
 * This allowlists exactly those two app origins. Auth is still enforced
 * per-request by _auth: CORS is a browser-side gate, not the security
 * boundary.
 *
 * Underscore-prefixed so the platform treats it as a helper module imported by
 * the route handlers, not as a route of its own.
 */

const ALLOWED_ORIGINS = new Set([
  "capacitor://localhost", // iOS Capacitor webview
  "https://localhost", // Android Capacitor webview
]);

/**
 * Apply CORS headers when the caller is one of the native app origins, and
 * fully answer OPTIONS preflights. Returns true when the request was a
 * preflight and has been handled - the route handler must return immediately.
 */
export function handleCors(req: any, res: any): boolean {
  const origin: string = req.headers?.origin || "";
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    // Per-origin negotiation must not be cached across origins.
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type"
    );
    // WebKit caps preflight caching at 600s anyway; ask for exactly that.
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}
