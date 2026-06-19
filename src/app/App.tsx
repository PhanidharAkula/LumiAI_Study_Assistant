import { useState, useEffect, useLayoutEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import type { Session } from "@supabase/supabase-js";
import { supabase, readStoredSession } from "@shared/lib/supabaseClient";
import { isInAppBrowser } from "@shared/lib/inAppBrowser";
import ProtectedRoute from "@shared/components/ProtectedRoute";
import GlobalLoader from "@shared/components/GlobalLoader";
import { LoadingSignal } from "@shared/lib/loadingSignal";
import { loaderLabel } from "@shared/lib/loaderLabel";
import MaintenanceScreen from "@features/marketing/MaintenanceScreen";
import "./App.css";

// Route components are code-split so the initial (pre-login) bundle stays small.
// Each screen - and the heavy libraries it pulls in (pdf.js, markdown, Lottie) -
// loads on demand instead of up front.
const WelcomePage = lazy(() => import("@features/marketing/WelcomePage"));
const Login = lazy(() => import("@features/auth/Login"));
const AuthRedirect = lazy(() => import("@features/auth/AuthRedirect"));
const Dashboard = lazy(() => import("@features/classes/Dashboard"));
const Admin = lazy(() => import("@features/support/Admin"));
const PrivacyPage = lazy(() => import("@features/marketing/PrivacyPage"));
const TermsPage = lazy(() => import("@features/marketing/TermsPage"));
const Support = lazy(() => import("@features/support/Support"));
const Review = lazy(() => import("@features/learning/Review"));
const Progress = lazy(() => import("@features/learning/Progress"));
const OpenInBrowser = lazy(() => import("@features/marketing/OpenInBrowser"));

// Reset scroll to the top on every route change (keyed on pathname, so
// in-page query-param navigation - e.g. the dashboard's ?chat / ?classId - is
// left alone). Without this, SPA navigation keeps the previous page's scroll.
function ScrollToTop(): null {
  const { pathname } = useLocation();
  // Own scroll restoration instead of the browser's: every route change jumps to
  // the top (below), so there's nothing for the browser to "restore" on
  // back/forward. Notably this stops Chrome on iOS from leaving a partial scroll
  // after a back navigation (its retractable URL bar otherwise offsets it).
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }, []);
  // useLayoutEffect runs before paint, and behavior:"instant" bypasses the
  // global `scroll-behavior: smooth` - so the new route paints at the top
  // immediately instead of rendering then animating up.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

function App() {
  // Seed auth state synchronously from the persisted session so first paint
  // reflects logged-in/out instantly and the SDK's async auth work never gates -
  // or hangs - the boot (a stalled getSession/getUser on a cold tab used to pin
  // the app on the loader until a manual refresh). The SDK validates + refreshes
  // in the background and fires onAuthStateChange to correct this.
  const [session, setSession] = useState<Session | null>(() =>
    readStoredSession()
  );
  // Admin "maintenance mode" gate (non-admins see a maintenance screen; admins
  // bypass). Both are best-effort and fail-open so a query error never locks
  // anyone out.
  const [maintenance, setMaintenance] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);

  useEffect(() => {
    // Set up the auth listener synchronously so the effect cleanup actually
    // unsubscribes it on unmount (previously it was created inside an async
    // function, so the returned cleanup was never wired to the effect).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    // First paint already rendered from the seeded session, so NOTHING below
    // gates (or can hang) the UI. In the background: validate the stored token
    // and read the maintenance/admin gates. The SDK refreshes the token and
    // fires onAuthStateChange (incl. SIGNED_OUT) on its own; every request is
    // RLS-gated, so optimistic render from the stored session is safe.
    const stored = readStoredSession();
    if (stored?.user?.id) {
      (async () => {
        try {
          const {
            data: { user },
            error,
          } = await supabase.auth.getUser();
          if (!user) {
            // Sign out only on a definitive auth rejection (revoked/deleted),
            // never on a transient network blip - keep the session otherwise.
            const status = (error as { status?: number } | null)?.status;
            if (typeof status === "number" && status >= 400 && status < 500) {
              await supabase.auth.signOut();
              setSession(null);
            }
            return;
          }
          // Best-effort maintenance gate + admin bypass (fail-open).
          const [settingsRes, profileRes] = await Promise.all([
            supabase
              .from("app_settings")
              .select("value")
              .eq("key", "maintenance_mode")
              .maybeSingle(),
            supabase
              .from("profiles")
              .select("is_admin")
              .eq("id", user.id)
              .maybeSingle(),
          ]);
          setMaintenance(settingsRes.data?.value === true);
          setIsAdminUser(profileRes.data?.is_admin === true);
        } catch {
          /* offline / error - leave the app live with the stored session */
        }
      })();
    }

    return () => subscription.unsubscribe();
  }, []);

  // Name the screen the loader is fetching, from the URL, so every phase shows
  // the same label instead of flashing through generic precursors first.
  const location = useLocation();
  const routeLabel = loaderLabel(location.pathname, location.search);

  // routeLabel names the route-chunk loader (the GlobalLoader, fed by the
  // Suspense fallback below) from the URL. Auth no longer feeds the loader - it
  // resolves synchronously from the seeded session, so there's no auth phase to
  // span and nothing that can hang the loader.

  // Maintenance mode: a signed-in non-admin sees the maintenance screen on every
  // route. Admins bypass it (so they can reach /admin and turn it back off);
  // signed-out visitors aren't gated (they can't read the setting anyway).
  const showMaintenance = session && maintenance && !isAdminUser;

  // Google OAuth is blocked inside embedded in-app browsers (LinkedIn,
  // Instagram, etc.). When detected, the sign-in entry points show a screen
  // guiding the user to open Lumi AI in their real browser instead of letting
  // them hit a dead-end "disallowed_useragent" error. Legal pages stay
  // reachable so OAuth verification (run in a real browser) is unaffected.
  const inAppBrowser = isInAppBrowser();

  return (
    // reducedMotion="user": framer transform/layout animations collapse to
    // simple fades for prefers-reduced-motion users (the CSS ambient loops
    // are disabled in index.css under the same media query).
    <MotionConfig reducedMotion="user">
      <GlobalLoader />
      {showMaintenance ? (
        <MaintenanceScreen />
      ) : (
      <Suspense fallback={<LoadingSignal label={routeLabel} />}>
        <ScrollToTop />
        <Routes>
          <Route
            path="/"
            element={
              session ? (
                <Navigate to="/dashboard" />
              ) : inAppBrowser ? (
                <OpenInBrowser />
              ) : (
                <WelcomePage />
              )
            }
          />
          <Route
            path="/login"
            element={
              session ? (
                <Navigate to="/dashboard" />
              ) : inAppBrowser ? (
                <OpenInBrowser />
              ) : (
                <Login />
              )
            }
          />
          <Route path="/auth/callback" element={<AuthRedirect />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute session={session}>
                <Dashboard session={session} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute session={session}>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/support"
            element={
              <ProtectedRoute session={session}>
                <Support session={session} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/review"
            element={
              <ProtectedRoute session={session}>
                <Review />
              </ProtectedRoute>
            }
          />
          <Route
            path="/progress"
            element={
              <ProtectedRoute session={session}>
                <Progress />
              </ProtectedRoute>
            }
          />
          {/* Public legal pages (must be reachable logged-out for Google OAuth review). */}
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route
            path="/chat/:classId?"
            element={<Navigate to="/dashboard?chat=true" />}
          />
        </Routes>
      </Suspense>
      )}
    </MotionConfig>
  );
}

export default App;
