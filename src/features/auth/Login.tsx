import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import { supabase } from "@shared/lib/supabaseClient";
import {
  Constellation,
  LumiStar,
  CornerTicks,
  UI,
  btnClass,
} from "@shared/components/atlas";
import { BackButton } from "@shared/components/controls";
import { fadeRise, pressLift } from "@shared/motion";
import { usePageMeta } from "@shared/hooks/usePageMeta";

const GoogleG = () => (
  <svg viewBox="0 0 48 48" width="19" height="19" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

const Login = () => {
  usePageMeta({ title: "Sign in - Lumi AI", path: "/login" });
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
      setError("We couldn't start Google sign in. Please try again.");
      setLoading(false);
    }
  };

  // Animations - children use the shared fadeRise; the container also fades
  // itself so the backdrop constellations arrive with the page.
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { delayChildren: 0.15, staggerChildren: 0.12 },
    },
  };

  const itemVariants = fadeRise;

  const itemBackVariants: Variants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 100, damping: 14 },
    },
  };

  return (
    <motion.div
      className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden px-6 py-15 max-md:px-5 max-md:py-10 max-[480px]:px-3.75 [@media(max-height:700px)]:justify-start [@media(max-height:700px)]:overflow-y-auto [@media(max-height:700px)]:pt-20"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Faint sky behind the entrance. */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <Constellation
          name="observatory entrance"
          size={520}
          twinkle
          className="absolute -right-28 -top-20 text-ink/13 max-md:-right-16 max-md:-top-12 max-md:h-64 max-md:w-64 max-[420px]:h-56 max-[420px]:w-56"
        />
        <Constellation
          name="lumi at night"
          size={380}
          twinkle
          className="absolute -bottom-24 -left-20 text-ink/10 max-md:-bottom-12 max-md:-left-14 max-md:h-56 max-md:w-56 max-[420px]:h-48 max-[420px]:w-48"
        />
      </div>

      <BackButton
        className="absolute left-7 top-7 z-20 max-md:left-5 max-md:top-5"
        onClick={() => navigate("/")}
        variants={itemBackVariants}
        label="Back to home"
      />

      <motion.div
        className={`${UI.plate} z-10 flex w-full max-w-110 flex-col items-center px-10 py-12 text-center max-[480px]:px-6 max-[480px]:py-9`}
        variants={itemVariants}
      >
        <CornerTicks />

        <motion.div variants={itemVariants} className="text-ink/40">
          <LumiStar size={64} orbit breathe />
        </motion.div>

        <motion.p className={`mt-6 ${UI.overline}`} variants={itemVariants}>
          Observatory entrance
        </motion.p>

        <motion.h1
          className="mt-3 font-display text-[32px] font-semibold leading-[1.15] tracking-[-0.01em] text-ink max-[480px]:text-[27px]"
          variants={itemVariants}
        >
          Welcome back to{" "}
          <em className="[font-variation-settings:'SOFT'_60,'WONK'_1]">
            your sky
          </em>
        </motion.h1>

        <motion.p
          className="mt-3 max-w-80 text-[14.5px] leading-[1.65] text-muted"
          variants={itemVariants}
        >
          Sign in to keep charting - your classes, conversations, and
          constellations are right where you left them.
        </motion.p>

        {error && (
          <motion.div
            className="mt-5 w-full rounded-lg border border-solid border-vermilion/30 bg-vermilion-wash px-4 py-3 text-center text-[13.5px] font-medium text-vermilion"
            variants={itemVariants}
          >
            {error}
          </motion.div>
        )}

        {/* bg-white is a deliberate exception to the no-white-fills rule: the
            Google brand affordance reads best on a true white field. */}
        <motion.button
          className={`${btnClass("ghost")} mt-7 w-full gap-3 bg-white! py-3.75!`}
          variants={itemVariants}
          {...pressLift}
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          <GoogleG />
          {loading ? "Connecting…" : "Continue with Google"}
        </motion.button>

        <motion.p
          className={`mt-5 ${UI.overlineMuted}`}
          variants={itemVariants}
        >
          Secure Google OAuth
        </motion.p>
      </motion.div>

      <motion.div
        className="z-10 mt-7 flex items-center gap-4 text-[11px]"
        variants={itemVariants}
      >
        <Link
          to="/privacy"
          state={{ from: "/login" }}
          className="font-mono uppercase tracking-[0.16em] text-muted no-underline transition-colors hover:text-gold-deep"
        >
          Privacy
        </Link>
        <span className="text-gold" aria-hidden="true">
          ✦
        </span>
        <Link
          to="/terms"
          state={{ from: "/login" }}
          className="font-mono uppercase tracking-[0.16em] text-muted no-underline transition-colors hover:text-gold-deep"
        >
          Terms
        </Link>
      </motion.div>
    </motion.div>
  );
};

export default Login;
