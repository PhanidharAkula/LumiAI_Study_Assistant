import { useState, useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";
import ProtectedRoute from "./components/ProtectedRoute";
import "./App.css";

// Route components are code-split so the initial (pre-login) bundle stays small.
// Each screen — and the heavy libraries it pulls in (pdf.js, markdown, Lottie) —
// loads on demand instead of up front.
const WelcomePage = lazy(() => import("./pages/WelcomePage"));
const Login = lazy(() => import("./pages/auth/Login"));
const AuthRedirect = lazy(() => import("./pages/auth/AuthRedirect"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const Support = lazy(() => import("./pages/Support"));
const Review = lazy(() => import("./pages/Review"));

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

function App() {
  const [session, setSession] = useState(null);
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

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route
          path="/"
          element={session ? <Navigate to="/dashboard" /> : <WelcomePage />}
        />
        <Route
          path="/login"
          element={session ? <Navigate to="/dashboard" /> : <Login />}
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
