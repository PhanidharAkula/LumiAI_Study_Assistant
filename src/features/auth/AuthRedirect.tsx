import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@shared/lib/supabaseClient";
import { detectRegion } from "@shared/utils/region";
import { UI } from "@shared/components/atlas";
import { useLoadingSignal } from "@shared/lib/loadingSignal";
import { fadeRise, stagger } from "@shared/motion";

const AuthRedirect = () => {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // While exchanging the OAuth session, keep the one persistent loader up
  // ("Signing you in") instead of rendering a second centered spinner - so it
  // stays in the same place right through to the dashboard's "Charting your sky"
  // (the spinner swap was what made it jump/reload between the two labels).
  useLoadingSignal(!error, "Signing you in");

  // Persist the browser-detected region. A direct profiles update is blocked by
  // RLS, so we go through the set_my_region() SECURITY DEFINER RPC, which only
  // fills region when it's still empty/Unknown (safe to call on every login).
  const updateUserRegion = async () => {
    try {
      await supabase.rpc("set_my_region", { p_region: detectRegion() });
    } catch (e) {
      console.log("Could not update region:", e);
      // Don't throw - region update is not critical
    }
  };

  useEffect(() => {
    const handleAuthRedirect = async () => {
      try {
        const hash = window.location.hash;

        // Prefer SDK helper when available. getSessionFromUrl isn't in the
        // current supabase-js types, so feature-detect it via an untyped view.
        const authAny = supabase.auth as unknown as {
          getSessionFromUrl?: (opts: { storeSession: boolean }) => Promise<{
            data?: { session?: unknown };
            error?: unknown;
          }>;
        };
        if (typeof authAny.getSessionFromUrl === "function") {
          const result = await authAny.getSessionFromUrl({
            storeSession: true,
          });
          const session = result?.data?.session;
          const urlError = result?.error;

          if (urlError) throw urlError;
          if (session) {
            await updateUserRegion();
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
            refresh_token: refresh_token as string,
          });
          if (setErr) throw setErr;
          if (data?.session) {
            // Update region in profile if not already set
            await updateUserRegion();
            navigate("/dashboard");
            return;
          }
        }

        // Poll briefly for session
        let sessionFound = false;
        for (let i = 0; i < 8; i++) {
          const data = await supabase.auth.getSession();
          const polledSession = data?.data?.session;
          if (polledSession) {
            sessionFound = true;
            // Update region in profile if not already set
            await updateUserRegion();
            navigate("/dashboard");
            break;
          }
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
        setError(
          "We couldn't finish signing you in. Taking you back to sign in..."
        );
        setTimeout(() => navigate("/login"), 1800);
      }
    };

    handleAuthRedirect();
  }, [navigate]);

  // Surface a styled error plate on failure; otherwise render nothing and let
  // the persistent global loader (above) cover the wait, so it stays in place
  // through to the dashboard instead of swapping spinners.
  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-5">
        <motion.div
          className={`${UI.plate} flex w-full max-w-105 flex-col items-center gap-3 px-8 py-9 text-center`}
          initial="hidden"
          animate="visible"
          variants={stagger()}
        >
          <motion.p className={UI.overline} variants={fadeRise}>
            Lumi AI
          </motion.p>
          <motion.p
            className="font-display text-[22px] font-semibold text-ink"
            variants={fadeRise}
          >
            Sign-in interrupted
          </motion.p>
          <motion.p
            className="rounded-lg border border-solid border-vermilion/30 bg-vermilion-wash px-4 py-3 text-[13.5px] font-medium leading-[1.6] text-vermilion"
            variants={fadeRise}
          >
            {error}
          </motion.p>
          <motion.p className={UI.overlineMuted} variants={fadeRise}>
            Returning to the entrance…
          </motion.p>
        </motion.div>
      </div>
    );
  }

  return null;
};

export default AuthRedirect;
