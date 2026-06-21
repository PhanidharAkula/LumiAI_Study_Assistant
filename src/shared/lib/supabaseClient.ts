import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables! Check your .env file.");
}

// ── Per-request timeout ──────────────────────────────────────────────────────
// Without one, a stalled connection - typically the first auth/refresh/query
// round-trip on a cold mobile tab reopened with an expired token - produces a
// fetch that never resolves OR rejects. The awaiting screen's `finally` then
// never runs and its full-screen loader ("Charting...", "Charting your sky")
// sticks until a manual page refresh. A hard timeout converts that hang into a
// normal rejection, which every screen's existing catch/finally already handles.
// Auth wraps an aborted request as a RETRYABLE network error, so the session is
// kept (never signed out) and the SDK refreshes/retries on its own.
const REQUEST_TIMEOUT_MS = 20000;
// Storage transfers (uploads/downloads) need far more headroom than a query and
// don't gate any loader, so give them a generous ceiling instead of cutting off.
const TRANSFER_TIMEOUT_MS = 300000;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

// AbortController + setTimeout (not AbortSignal.timeout/any) for universal mobile
// support. Forwards any upstream signal so callers can still cancel early.
const fetchWithTimeout: typeof fetch = (input, init) => {
  const ms = requestUrl(input).includes("/storage/v1/")
    ? TRANSFER_TIMEOUT_MS
    : REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, ms);
  const upstream = init?.signal;
  if (upstream) {
    if (upstream.aborted) controller.abort(upstream.reason);
    else
      upstream.addEventListener(
        "abort",
        () => controller.abort(upstream.reason),
        { once: true }
      );
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
};

/**
 * An AbortSignal that aborts after `ms`. Use to bound a specific query tighter
 * than the global request timeout (e.g. so a screen can fail fast and retry).
 */
export function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => {
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, ms);
  return controller.signal;
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storage: localStorage,
  },
  global: { fetch: fetchWithTimeout },
});

// The SDK persists the session as plain JSON under this key (it computes the
// same `sb-<project-ref>-auth-token` from the URL's first hostname segment).
const AUTH_STORAGE_KEY = (() => {
  try {
    return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  } catch {
    return "";
  }
})();

/**
 * Read the persisted session straight from localStorage, synchronously.
 *
 * Used to SEED the app's auth state at boot so first paint reflects the real
 * logged-in/out state instantly and never waits on - or hangs on - the SDK's
 * async getSession()/init-time token refresh. A stalled call there used to pin
 * the entire app on the boot loader until a manual page refresh. The SDK still
 * validates + refreshes in the background and fires onAuthStateChange to correct
 * this, and every request is authorized server-side (RLS) regardless of the seed.
 */
export function readStoredSession(): Session | null {
  try {
    if (!AUTH_STORAGE_KEY) return null;
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && typeof s.access_token === "string" && s.user) return s as Session;
  } catch {
    /* unreadable / not-yet-written - treat as logged out (corrected on init) */
  }
  return null;
}
