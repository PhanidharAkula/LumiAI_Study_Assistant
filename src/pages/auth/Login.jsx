import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "../../lib/supabaseClient";
import Lottie from "lottie-react";
import google from "../../assets/google.json";
import "./Auth.css";

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
          redirectTo: "https://studywithlumi.com/dashboard",
          queryParams: {
            hd: "studywithlumi.com",
          },
        },
      });
      if (error) throw error;
    } catch (error) {
      setError(error.message);
      setLoading(false);
    }
  };

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
          <motion.div className="error-message" variants={itemVariants}>
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
            <Lottie
              style={{ width: 50 }}
              animationData={google}
              loop={true}
              autoplay={true}
            />
            {loading ? "Connecting..." : "Continue with Google"}
          </motion.button>
        </motion.div>
      </motion.div>
    </>
  );
};

export default Login;
