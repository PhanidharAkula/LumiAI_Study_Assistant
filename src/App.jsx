import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";
import { motion } from "framer-motion";
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
      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession();
      setSession(activeSession);
      setLoading(false);

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });

      return () => subscription.unsubscribe();
    };

    setupAuth();
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <motion.div
          className="loading-spinner"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.1 2.182a10 10 0 0 1 3.8 0"></path>
            <path d="M13.9 21.818a10 10 0 0 1-3.8 0"></path>
            <path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"></path>
            <path d="M3.701 17.579a10 10 0 0 1-2.69-2.7"></path>
            <path d="M21.719 7.291a10 10 0 0 1 1.09 3.8"></path>
            <path d="M1.19 12.9a10 10 0 0 1-1.09-3.8"></path>
            <path d="M21.181 13.9a10 10 0 0 1-3.5 6.8"></path>
            <path d="M6.32 2.3a10 10 0 0 1 3.5 6.8"></path>
          </svg>
        </motion.div>
        <p>Loading LumiAI...</p>
      </div>
    );
  }

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
