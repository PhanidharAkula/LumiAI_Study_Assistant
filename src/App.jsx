import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/auth/Login";
import AuthRedirect from "./pages/auth/AuthRedirect";
import WelcomePage from "./pages/WelcomePage";
import Dashboard from "./pages/Dashboard";
import "./App.css";

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const setupAuth = async () => {
      // Get the current session - this checks localStorage automatically
      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession();

      setSession(activeSession);
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
    return (
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
  }

  return (
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
        path="/chat/:classId?"
        element={<Navigate to="/dashboard?chat=true" />}
      />
    </Routes>
  );
}

export default App;
