import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";
import { ThemeProvider } from "./context/ThemeContext";
import { setupSessionSync, updateLastActivity } from "./utils/sessionSync";

// Pages
import WelcomePage from "./pages/WelcomePage";
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import AuthErrorPage from "./pages/auth/AuthErrorPage";
import AuthRedirect from "./pages/auth/AuthRedirect";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";

// Styles
import "./App.css";
import "./styles/animations.css"; // Import the animations

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial session check
    const checkSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("Session check error:", error);
          throw error;
        }

        setSession(session);

        // Update activity timestamp whenever session is retrieved
        if (session) updateLastActivity();
      } catch (error) {
        console.error("Session check failed:", error);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Setup session sync across tabs
    const cleanup = setupSessionSync(setSession);

    // Page visibility handling to refresh session on tab focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) {
            setSession(data.session);
            updateLastActivity();
          }
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cleanup();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/auth/callback" element={<AuthRedirect />} />
          <Route path="/auth/error" element={<AuthErrorPage />} />
          <Route
            path="/dashboard/*"
            element={
              <ProtectedRoute session={session}>
                <Dashboard session={session} />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </ThemeProvider>
  );
}

export default App;
