import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables! Check your .env file.");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storage: localStorage,
  },
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
