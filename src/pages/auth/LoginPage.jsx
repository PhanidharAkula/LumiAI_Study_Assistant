import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import "./Auth.css";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [verificationSuccess, setVerificationSuccess] = useState(null);

  useEffect(() => {
    // Check if redirected with successful verification
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get("verified") === "success") {
      setVerificationSuccess(
        "Email successfully verified! You can now log in."
      );
    }
  }, [location]);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      console.log("Attempting login with:", email);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Login error details:", error);

        // Save email for potential use in error recovery
        if (error.message.includes("Email not confirmed")) {
          localStorage.setItem("lastSignupEmail", email);
          navigate("/auth/error");
          return;
        }

        throw error;
      }

      console.log("Login successful, user data:", data.user);
      navigate("/dashboard");
    } catch (error) {
      console.error("Full login error:", error);
      setError(
        error.message || "Failed to log in. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        console.error("OAuth error details:", error);
        throw error;
      }

      // Google OAuth redirects the user, so we don't need to navigate programmatically
    } catch (error) {
      console.error("Full error object:", error);
      setError(`Authentication failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Login to Lumi AI</h2>

        {error && <div className="error-message">{error}</div>}
        {verificationSuccess && (
          <div className="success-message">{verificationSuccess}</div>
        )}

        <form onSubmit={handleEmailLogin}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? "Logging In..." : "Login"}
          </button>
        </form>

        <div className="divider">OR</div>

        <button
          onClick={handleGoogleLogin}
          className="google-button"
          disabled={loading}
        >
          Continue with Google
        </button>

        <p className="auth-redirect">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
