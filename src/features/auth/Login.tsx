import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import { supabase } from "@shared/lib/supabaseClient";
import LazyLottie from "@shared/components/LazyLottie";
import google from "../../assets/google.json";

const Login = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  // Animations
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: 0.2,
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants: Variants = {
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

  const itemBackVariants: Variants = {
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
    <motion.div
      className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center gap-6 overflow-hidden px-10 py-[60px] max-md:gap-[18px] max-md:px-6 max-md:py-10 max-[480px]:pt-6 max-[360px]:gap-3 max-[360px]:px-3"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <motion.button
        className="back-button"
        onClick={() => navigate("/")}
        variants={itemBackVariants}
        whileHover={{
          x: -5,
          transition: { type: "spring", stiffness: 300, damping: 5 },
        }}
        whileTap={{ scale: 0.98 }}
        aria-label="Back to home"
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

      <motion.p
        className="relative text-[clamp(60px,12vw,120px)] font-extrabold tracking-[-2px] max-[1024px]:text-[clamp(50px,10vw,90px)] max-md:text-[52px] max-md:tracking-[-1px] max-[480px]:text-[42px] max-[360px]:text-[36px]"
        variants={itemVariants}
      >
        Lumi AI
      </motion.p>
      <motion.p variants={itemVariants}>Login & Sign Up</motion.p>

      {error && (
        <motion.div
          className="mb-5 rounded bg-[#ffebee] p-2.5 text-center text-[#d32f2f]"
          variants={itemVariants}
        >
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
          className="mt-5 flex w-[350px] items-center justify-center gap-[15px] rounded-full border-[1.5px] border-solid border-ink bg-white px-[50px] text-[medium] font-medium shadow-[0px_3px_0_#000] disabled:cursor-not-allowed disabled:opacity-70 max-md:w-[300px] max-md:px-[30px] max-[480px]:w-[300px] max-[480px]:px-5 max-[480px]:text-[small]"
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
    </motion.div>
  );
};

export default Login;
