/**
 * API base for the serverless /api/* routes.
 *
 * On the website the app and API share an origin, so paths stay relative
 * (behavior unchanged). The native shells load the UI from a local origin
 * instead (capacitor://localhost on iOS, https://localhost on Android), where
 * a relative "/api/…" would resolve into the app bundle - so on native, paths
 * are rewritten to the production API origin. api/_cors.ts allowlists the two
 * app origins for exactly this traffic.
 */
import { isNativeApp } from "./platform";

// VITE_API_ORIGIN lets a dev build of the native app point at a tunnel or
// staging deployment; unset (normal) it's the production site.
const API_ORIGIN: string =
  (import.meta.env.VITE_API_ORIGIN as string | undefined) ??
  "https://www.studywithlumi.com";

/** Resolve an "/api/…" path: absolute on native, unchanged on the website. */
export function apiUrl(path: string): string {
  if (!isNativeApp()) return path;
  // Dev live-reload shell (capacitor.config CAP_SERVER_URL): the app is
  // LOADED FROM the Vite dev server, which also serves /api/* locally - keep
  // paths relative/same-origin. Packaged builds never load over http:
  // (iOS is capacitor://, Android is https://), so this only matches dev.
  if (window.location.protocol === "http:") return path;
  return `${API_ORIGIN}${path}`;
}
