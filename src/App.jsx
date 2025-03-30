import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";
import ProtectedRoute from "./components/ProtectedRoute";
import WelcomePage from "./pages/WelcomePage";
import Login from "./pages/auth/Login";
import Dashboard from "./pages/Dashboard";
import AuthRedirect from "./pages/auth/AuthRedirect";
import "./App.css";

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log(
        "Initial auth session:",
        session ? "Logged in" : "No session"
      );
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(
        "Auth event:",
        event,
        session ? "User session updated" : "User logged out"
      );
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const LoginRoute = () => {
    return session ? <Navigate to="/dashboard" /> : <Login />;
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<WelcomePage session={session} />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/auth/callback" element={<AuthRedirect />} />
      <Route
        path="/dashboard/*"
        element={
          <ProtectedRoute session={session}>
            <Dashboard session={session} />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;
