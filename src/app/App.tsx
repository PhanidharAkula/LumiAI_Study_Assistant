import { useState, useEffect, useLayoutEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@shared/lib/supabaseClient";
import { isInAppBrowser } from "@shared/lib/inAppBrowser";
import ProtectedRoute from "@shared/components/ProtectedRoute";
import "./App.css";

// Route components are code-split so the initial (pre-login) bundle stays small.
// Each screen — and the heavy libraries it pulls in (pdf.js, markdown, Lottie) —
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

const PageLoader = () => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      flexDirection: "column",
      gap: "10px",
    }}
  >
    <div
      className="spinner"
      style={{
        width: "40px",
        height: "40px",
        border: "3px solid rgba(0, 0, 0, 0.1)",
        borderRadius: "50%",
        borderTopColor: "#000",
        animation: "spin 1s ease-in-out infinite",
      }}
    ></div>
    <p>Loading...</p>
  </div>
);

// Reset scroll to the top on every route change (keyed on pathname, so
// in-page query-param navigation — e.g. the dashboard's ?chat / ?classId — is
// left alone). Without this, SPA navigation keeps the previous page's scroll.
function ScrollToTop(): null {
  const { pathname } = useLocation();
  // useLayoutEffect runs before paint, and behavior:"instant" bypasses the
  // global `scroll-behavior: smooth` — so the new route paints at the top
  // immediately instead of rendering then animating up.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up the auth listener synchronously so the effect cleanup actually
    // unsubscribes it on unmount (previously it was created inside an async
    // function, so the returned cleanup was never wired to the effect).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    // Validate any stored session on load.
    const setupAuth = async () => {
      try {
        const {
          data: { session: activeSession },
        } = await supabase.auth.getSession();
        if (activeSession) {
          const {
            data: { user },
            error: getUserError,
          } = await supabase.auth.getUser();
          if (getUserError || !user) {
            await supabase.auth.signOut();
            setSession(null);
          } else {
            setSession(activeSession);
          }
        } else {
          setSession(null);
        }
      } catch (err) {
        console.warn("Error validating stored session:", err);
      } finally {
        setLoading(false);
      }
    };

    setupAuth();

    return () => subscription.unsubscribe();
  }, []);

  // Show a loading state while checking authentication
  if (loading) {
    return <PageLoader />;
  }

  // Google OAuth is blocked inside embedded in-app browsers (LinkedIn,
  // Instagram, etc.). When detected, the sign-in entry points show a screen
  // guiding the user to open Lumi AI in their real browser instead of letting
  // them hit a dead-end "disallowed_useragent" error. Legal pages stay
  // reachable so OAuth verification (run in a real browser) is unaffected.
  const inAppBrowser = isInAppBrowser();

  return (
    <Suspense fallback={<PageLoader />}>
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
  );
}

export default App;
