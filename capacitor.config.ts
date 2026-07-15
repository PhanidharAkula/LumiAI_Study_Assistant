import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell config (iOS + Android). The shells load the BUILT web app from
 * dist/ - run `npm run cap:sync` after web changes to rebuild + copy it in,
 * then build/run from Xcode (`npm run cap:ios`) or Android Studio.
 *
 * There is no separate mobile backend: the packaged app calls the production
 * /api/* + Supabase directly (see src/shared/native/apiBase.ts and
 * api/_cors.ts for the cross-origin plumbing).
 */
const config: CapacitorConfig = {
  appId: "com.studywithlumi.app",
  appName: "Lumi AI",
  webDir: "dist",
  // Dev live-reload: `CAP_SERVER_URL=http://localhost:5173 npx cap sync ios`
  // makes the shell load the Vite DEV server instead of the packaged dist/ -
  // web edits hot-reload on the device, and /api/* is served locally by the
  // dev middleware (vite.config.js) so testing AI needs no prod deploy.
  // Unset = normal packaged behavior. The generated native config json is
  // gitignored so a dev sync can't leak into git, but run a plain
  // `npx cap sync` before building anything for release anyway.
  // (iOS simulator: localhost. Android emulator: 10.0.2.2. Phone: Mac LAN IP.)
  ...(process.env.CAP_SERVER_URL
    ? { server: { url: process.env.CAP_SERVER_URL, cleartext: true } }
    : {}),
  // Parchment behind the webview so load/rotation gaps never flash white.
  backgroundColor: "#f3edde",
  ios: {
    // The webview runs truly full-screen; the web layer owns the safe-area
    // insets (src/shared/native/native.css), not native content insets.
    contentInset: "never",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: "#f3edde",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    Keyboard: {
      // Shrink the webview when the keyboard opens so bottom-pinned bars
      // (the chat input) ride above it instead of hiding under it.
      resize: "native",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
