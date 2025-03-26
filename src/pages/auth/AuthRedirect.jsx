import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const AuthRedirect = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Get hash parameters
    const hash = location.hash.substring(1);
    const params = new URLSearchParams(hash);

    // Check for errors
    const error = params.get("error");
    const errorCode = params.get("error_code");

    if (error || errorCode) {
      // Redirect to error handler page with the hash preserved
      navigate(`/auth/error${location.hash}`);
    } else {
      // If no errors, redirect to login with success
      navigate("/login?verified=success");
    }
  }, [navigate, location]);

  return <div className="loading-container">Redirecting...</div>;
};

export default AuthRedirect;
