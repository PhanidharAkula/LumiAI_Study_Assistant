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
    const setupAuth = async () => {
      // Get the current session - this checks localStorage automatically
      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession();
      if (activeSession) {
        try {
          const {
            data: { user },
            error: getUserError,
          } = await supabase.auth.getUser();
          if (getUserError || !user) {
            // Clear the client session
            await supabase.auth.signOut();
            setSession(null);
          } else {
            setSession(activeSession);
          }
        } catch (err) {
          console.warn("Error validating stored session:", err);
          setSession(activeSession);
        }
      } else {
        setSession(activeSession);
      }

      setLoading(false);

      // Set up the auth state listener for future changes
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });

      return () => subscription.unsubscribe();
    };

    setupAuth();
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
          path="/chat/:classId?"
          element={<Navigate to="/dashboard?chat=true" />}
        />
      </Routes>
    </Suspense>
  );
}

export default App;
