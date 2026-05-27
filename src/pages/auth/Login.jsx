import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "../../lib/supabaseClient";
import LazyLottie from "../../components/LazyLottie";
import google from "../../assets/google.json";
import "./Auth.css";
// Login reuses the welcome screen's layout classes (.welcome-container,
// .welcome-logo-name, .login-btn). Import their stylesheet so a direct hit on
// /login (session-expiry redirect, bookmark, OAuth bounce) is styled even when
// the welcome page hasn't been visited yet this session.
import "../WelcomePage.css";

const Login = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session) {
          navigate("/dashboard");
        }
      }
    );
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // Send OAuth callbacks to the dedicated callback route where
          // we exchange the URL params for a session and then redirect
          // to the dashboard. This ensures new-user signups are handled
          // correctly. (Region is captured after login via set_my_region;
          // OAuth signup metadata can't reliably carry custom fields.)
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            // No prompt parameter = consent screen only shown on first login
          },
        },
      });
      if (error) throw error;
    } catch (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  // Animations
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: 0.2,
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 10,
      },
    },
  };

  const itemBackVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 12,
      },
    },
  };

  return (
    <>
      <motion.div
        className="welcome-container"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        <motion.button
          className="back-button"
          id="back-button"
          onClick={() => navigate("/")}
          variants={itemBackVariants}
          whileHover={{
            x: -3,
            transition: { type: "spring", stiffness: 300, damping: 5 },
          }}
          whileTap={{ scale: 0.98 }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </motion.button>

        <motion.p className="welcome-logo-name" variants={itemVariants}>
          Lumi AI
        </motion.p>
        <motion.p variants={itemVariants}>Login & Sign Up</motion.p>

        {error && (
          <motion.div className="auth-error-message" variants={itemVariants}>
            {error}
          </motion.div>
        )}

        <motion.div
          variants={itemVariants}
          whileHover={{
            scale: 1.03,
            y: -6,
            transition: { type: "spring", stiffness: 300, damping: 5 },
          }}
          whileTap={{ scale: 0.98 }}
        >
          <motion.button
            className="login-btn"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            <LazyLottie
              style={{ width: 50 }}
              animationData={google}
              loop={true}
              autoplay={true}
            />
            {loading ? "Connecting..." : "Continue with Google"}
          </motion.button>
        </motion.div>

        <motion.p className="auth-legal-links" variants={itemVariants}>
          <Link to="/privacy">Privacy</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/terms">Terms</Link>
        </motion.p>
      </motion.div>
    </>
  );
};

export default Login;
