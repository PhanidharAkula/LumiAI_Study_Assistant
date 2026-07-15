/**
 * Native app bootstrap (the iOS/Android Capacitor shells). No-op on the site.
 *
 * Everything mobile-specific hangs off this one entry point so the web code
 * stays untouched: the `is-native` root class that activates native.css
 * (safe-area insets), status-bar styling, and the deep-link listener that
 * completes the native Google sign-in (see googleSignIn.ts).
 *
 * Called from main.tsx before render. The synchronous part (root classes) runs
 * immediately so first paint gets safe-area padding; plugin setup is async
 * fire-and-forget and must never gate or hang boot (same doctrine as the auth
 * seeding in App.tsx). Plugins are dynamic imports so the website bundle never
 * carries them.
 */
import { supabase } from "@shared/lib/supabaseClient";
import { isNativeApp, nativePlatform } from "./platform";
import { NATIVE_AUTH_CALLBACK } from "./googleSignIn";
import "./native.css";

export function initNativeApp(): void {
  if (!isNativeApp()) return;

  // Activates the safe-area rules in native.css. Synchronous, pre-render.
  document.documentElement.classList.add(
    "is-native",
    `is-native-${nativePlatform()}`
  );

  // Status bar: parchment UI → dark glyphs. Cosmetic; never blocks boot.
  void (async () => {
    try {
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      await StatusBar.setStyle({ style: Style.Light });
      if (nativePlatform() === "android") {
        await StatusBar.setBackgroundColor({ color: "#f3edde" });
      }
    } catch (err) {
      console.warn("[native] status bar setup skipped:", err);
    }
  })();

  // Deep links: the OAuth callback arrives here (warm start via appUrlOpen,
  // cold start via getLaunchUrl when the link itself launched the app).
  void (async () => {
    try {
      const { App } = await import("@capacitor/app");
      await App.addListener("appUrlOpen", ({ url }) => {
        void handleDeepLink(url);
      });
      const launch = await App.getLaunchUrl();
      if (launch?.url) void handleDeepLink(launch.url);
    } catch (err) {
      console.error("[native] deep-link listener failed to attach:", err);
    }
  })();
}

/**
 * Complete the native OAuth round-trip. The system browser lands on
 * com.studywithlumi.app://auth/callback#access_token=…&refresh_token=… and the
 * OS hands that URL to the app. Store the session; onAuthStateChange then
 * flips the whole UI to signed-in (Login navigates to /dashboard on
 * SIGNED_IN), mirroring what the web /auth/callback route does.
 */
async function handleDeepLink(url: string): Promise<void> {
  if (!url.startsWith(NATIVE_AUTH_CALLBACK)) return;

  // Close the OAuth browser sheet (iOS; Android Custom Tabs dismiss on their
  // own when the deep link fires).
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
  } catch {
    /* sheet not open, or close unsupported on this platform */
  }

  try {
    const params = new URLSearchParams(url.split("#")[1] ?? "");
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) {
      console.error(
        "[native] OAuth callback carried no tokens:",
        params.get("error_description") || params.get("error") || url
      );
      return;
    }
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) throw error;

    // Region backfill, same as the web callback (best-effort; the RPC only
    // fills region while it's still empty).
    try {
      const { detectRegion } = await import("@shared/utils/region");
      await supabase.rpc("set_my_region", { p_region: detectRegion() });
    } catch {
      /* region is not critical */
    }
  } catch (err) {
    console.error("[native] completing sign-in failed:", err);
  }
}
