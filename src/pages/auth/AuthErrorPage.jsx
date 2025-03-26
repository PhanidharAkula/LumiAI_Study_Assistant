import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import "./Auth.css";

const AuthErrorPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Parse hash parameters
  useEffect(() => {
    const hashParams = new URLSearchParams(location.hash.replace("#", "?"));
    const errorCode = hashParams.get("error_code");
    const errorDesc = hashParams.get("error_description");

    if (errorCode === "otp_expired") {
      setError(
        "Your verification link has expired. Please request a new one below."
      );
    } else if (error) {
      setError(
        `Authentication error: ${errorDesc || errorCode || "unknown error"}`
      );
    }

    // Try to retrieve the email from localStorage if it was saved during signup
    const savedEmail = localStorage.getItem("lastSignupEmail");
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, [location]);

  const resendVerificationEmail = async () => {
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const { data, error } = await supabase.auth.resend({
        type: "signup",
        email: email,
      });

      if (error) throw error;

      setSuccess(
        "A new verification link has been sent to your email. Please check your inbox and spam folder."
      );
    } catch (error) {
      console.error("Error resending verification email:", error);
      setError(error.message || "Failed to send verification email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Email Verification</h2>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Your Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>

          <button
            onClick={resendVerificationEmail}
            className="auth-button"
            disabled={loading}
          >
            {loading ? "Sending..." : "Resend Verification Email"}
          </button>

          <div className="auth-links">
            <Link to="/login">Back to Login</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthErrorPage;
