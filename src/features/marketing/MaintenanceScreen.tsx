import { motion } from "framer-motion";
import { LumiStar, Starfield, UI } from "@shared/components/atlas";
import { fadeRise, stagger } from "@shared/motion";

// Shown to non-admin users when an admin enables "Maintenance mode" in the
// admin Settings panel (gated app-wide from App.tsx; admins bypass it).
// The observatory closes for the night: full night plate, drifting stars,
// the Lumi star resting in its orbit.
export default function MaintenanceScreen() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-5 overflow-hidden bg-night px-6 text-center">
      <Starfield count={70} seed={23} />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(60rem 40rem at 50% 110%, rgb(199 154 51 / 0.12), transparent 60%)",
        }}
      />

      <motion.div
        className="relative flex flex-col items-center gap-5"
        initial="hidden"
        animate="visible"
        variants={stagger()}
      >
        <motion.div className="text-starlight/35" variants={fadeRise}>
          <LumiStar size={120} orbit breathe core="var(--color-night)" />
        </motion.div>

        <motion.p className={UI.overlineNight} variants={fadeRise}>
          The observatory is closed tonight
        </motion.p>

        <motion.h1
          className="m-0 font-display text-[34px] font-semibold leading-tight text-starlight max-[480px]:text-[28px]"
          variants={fadeRise}
        >
          We&rsquo;ll be right{" "}
          <em className="text-gold [font-variation-settings:'SOFT'_60,'WONK'_1]">
            back
          </em>
        </motion.h1>

        <motion.p
          className="m-0 max-w-105 text-[15.5px] leading-[1.7] text-starlight/65"
          variants={fadeRise}
        >
          Lumi is down for a little maintenance - polishing lenses, re-inking
          charts. Please check back again in a short while.
        </motion.p>
      </motion.div>
    </div>
  );
}
