import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import "./Auth.css";

const AuthRedirect = () => {
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthRedirect = async () => {
      try {
        const hash = window.location.hash;

        // Prefer SDK helper when available
        if (
          supabase?.auth &&
          typeof supabase.auth.getSessionFromUrl === "function"
        ) {
          const result = await supabase.auth.getSessionFromUrl({
            storeSession: true,
          });
          const session = result?.data?.session;
          const urlError = result?.error;

          if (urlError) throw urlError;
          if (session) {
            navigate("/dashboard");
            return;
          }
        }

        // Fallback: parse hash for tokens
        const trimmedHash = (hash || "").replace(/^#/, "");
        const params = new URLSearchParams(trimmedHash);

        const searchParams = new URLSearchParams(window.location.search);
        const errorFromQuery = searchParams.get("error") || params.get("error");
        const errorDescription = decodeURIComponent(
          (
            searchParams.get("error_description") ||
            params.get("error_description") ||
            ""
          ).replace(/\+/g, " ")
        );

        if (errorFromQuery) {
          const desc = errorDescription || errorFromQuery;
          setError(`Authentication error: ${desc}`);
          console.error(
            "Auth callback error:",
            errorFromQuery,
            errorDescription
          );
          return;
        }

        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");

        if (access_token) {
          const { data, error: setErr } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (setErr) throw setErr;
          if (data?.session) {
            navigate("/dashboard");
            return;
          }
        }

        // Poll briefly for session
        let sessionFound = false;
        for (let i = 0; i < 8; i++) {
          // eslint-disable-next-line no-await-in-loop
          const data = await supabase.auth.getSession();
          const polledSession = data?.data?.session;
          if (polledSession) {
            sessionFound = true;
            navigate("/dashboard");
            break;
          }
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 250));
        }

        if (!sessionFound) {
          setError(
            "No authentication data found. Check the callback URL or server logs."
          );
          setTimeout(() => navigate("/login"), 1200);
        }
      } catch (err) {
        console.error("Authentication error:", err);
        setError(`Authentication failed: ${err?.message || err}`);
        setTimeout(() => navigate("/login"), 1800);
      }
    };

    handleAuthRedirect();
  }, [navigate]);

  // Render nothing during a normal redirect; only show UI when there's an error
  if (error) {
    return (
      <div className="auth-container">
        <div className="auth-form">
          <div className="auth-logo">Lumi AI</div>
          <div className="auth-error">{error}</div>
        </div>
      </div>
    );
  }

  return null;
};

export default AuthRedirect;
