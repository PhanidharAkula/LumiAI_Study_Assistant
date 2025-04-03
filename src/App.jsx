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

  useEffect(() => {
    const setupAuth = async () => {
      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession();
      setSession(activeSession);

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });

      return () => subscription.unsubscribe();
    };

    setupAuth();
  }, []);

  return (
    <Routes>
      <Route
        path="/"
        element={session ? <Navigate to="/dashboard" /> : <WelcomePage />}
      />
      <Route path="/login" element={<Login />} />
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
