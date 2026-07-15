/**
 * Native Google sign-in.
 *
 * Google blocks OAuth inside embedded webviews ("Error 403:
 * disallowed_useragent") - and the packaged app IS one - so on native the
 * OAuth dance runs in the SYSTEM browser (SFSafariViewController on iOS,
 * Chrome Custom Tabs on Android) and returns to the app through its deep-link
 * scheme. init.ts owns the appUrlOpen listener that catches the callback and
 * stores the session; the web /auth/callback flow is untouched.
 *
 * SETUP: the callback URL below must be allowlisted in the Supabase dashboard
 * (Authentication → URL Configuration → Redirect URLs), or Supabase will
 * bounce the browser to the site URL and the app will never hear back.
 */
import { supabase } from "@shared/lib/supabaseClient";

/** Deep link the OAuth callback returns on (scheme = the app's bundle id). */
export const NATIVE_AUTH_CALLBACK = "com.studywithlumi.app://auth/callback";

export async function signInWithGoogleNative(): Promise<void> {
  const { Browser } = await import("@capacitor/browser");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: NATIVE_AUTH_CALLBACK,
      // Don't navigate the webview to Google (blocked there); hand the URL to
      // the system browser instead.
      skipBrowserRedirect: true,
      queryParams: { access_type: "offline" },
    },
  });
  if (error || !data?.url) {
    throw error ?? new Error("No OAuth URL returned");
  }
  await Browser.open({ url: data.url });
}
