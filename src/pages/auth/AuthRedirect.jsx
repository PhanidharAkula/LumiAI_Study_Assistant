import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import "./Auth.css";

const AuthRedirect = () => {
  const [message, setMessage] = useState("Processing authentication...");
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthRedirect = async () => {
      try {
        // Get the URL hash (Supabase redirects with hash parameters)
        const hash = window.location.hash;

        // If no hash, there's no auth data to process
        if (!hash) {
          setError("No authentication data found");
          return;
        }

        setMessage("Completing authentication...");

        // Let Supabase handle the auth redirect and exchange tokens
        const { data, error: authError } = await supabase.auth.getSession();

        if (authError) {
          throw authError;
        }

        // Check if we have a valid session
        if (data?.session) {
          setMessage("Authentication successful! Redirecting...");

          // Important: Redirect to login page instead of dashboard
          // This ensures proper session handling and user data loading
          setTimeout(() => navigate("/login"), 1500);
        } else {
          setError("No session found. Please try logging in directly.");
          setTimeout(() => navigate("/login"), 2500);
        }
      } catch (err) {
        console.error("Authentication error:", err);
        setError(`Authentication failed: ${err.message}`);
        setTimeout(() => navigate("/login"), 2500);
      }
    };

    handleAuthRedirect();
  }, [navigate]);

  return (
    <div className="auth-container">
      <div className="auth-form">
        <div className="auth-logo">Lumi AI</div>
        {error ? (
          <div className="auth-error">{error}</div>
        ) : (
          <div className="auth-progress">
            <div className="auth-spinner"></div>
            <p>{message}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthRedirect;
