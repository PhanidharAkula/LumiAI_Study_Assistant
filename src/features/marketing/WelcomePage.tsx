import type { Session } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import {
  Constellation,
  LumiStar,
  CornerTicks,
  UI,
  btnClass,
  starPath,
} from "@shared/components/atlas";
import { plateLift, pressLift } from "@shared/motion";

/* Hand-engraved feature emblems - stroke-drawn instruments, one gold accent
   each. Replaces the old Lottie animations (and the ~520 KB of JSON they
   pulled into the landing experience). */
const EmblemChat = () => (
  <svg viewBox="0 0 56 56" width="64" height="64" aria-hidden="true">
    <g
      fill="none"
      stroke="var(--color-ink)"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M28 23 C23.5 19.5 16 19 11 21.5 V41 C16 38.5 23.5 39 28 42.5" />
      <path d="M28 23 C32.5 19.5 40 19 45 21.5 V41 C40 38.5 32.5 39 28 42.5" />
      <path d="M28 23 V42.5" />
    </g>
    <path d={starPath(28, 10.5, 5)} fill="var(--color-gold)" />
    <path d={starPath(41, 13, 2)} fill="var(--color-ink)" opacity="0.45" />
    <path d={starPath(15.5, 12, 1.6)} fill="var(--color-ink)" opacity="0.35" />
  </svg>
);

const EmblemQuiz = () => (
  <svg viewBox="0 0 56 56" width="64" height="64" aria-hidden="true">
    <g fill="none" stroke="var(--color-ink)" strokeWidth="1.6">
      <circle cx="28" cy="30" r="16.5" />
      <path
        d="M28 9.5 V13 M28 47 V50.5 M6.5 30 H10 M46 30 H49.5"
        strokeLinecap="round"
      />
      <path d={starPath(28, 30, 12.5)} strokeLinejoin="round" />
    </g>
    <path
      d={starPath(28, 30, 7)}
      transform="rotate(45 28 30)"
      fill="var(--color-gold)"
      opacity="0.9"
    />
    <circle cx="28" cy="30" r="1.6" fill="var(--color-ink)" />
  </svg>
);

const EmblemReview = () => (
  <svg viewBox="0 0 56 56" width="64" height="64" aria-hidden="true">
    <g fill="none" stroke="var(--color-ink)">
      <ellipse
        cx="28"
        cy="30"
        rx="16.5"
        ry="6.6"
        transform="rotate(-16 28 30)"
        strokeWidth="1.6"
      />
      <ellipse
        cx="28"
        cy="30"
        rx="21.5"
        ry="9.2"
        transform="rotate(-16 28 30)"
        strokeWidth="1.1"
        strokeDasharray="0.5 4"
        strokeLinecap="round"
        opacity="0.7"
      />
    </g>
    <circle cx="28" cy="30" r="5.5" fill="var(--color-ink)" />
    <circle cx="26.2" cy="28.2" r="1.4" fill="var(--color-vellum)" />
    <circle cx="43" cy="25" r="2.7" fill="var(--color-gold)" />
    <path d={starPath(12, 13, 1.8)} fill="var(--color-ink)" opacity="0.4" />
  </svg>
);

const FEATURES = [
  {
    Emblem: EmblemChat,
    plate: "PLATE 01",
    title: "Converse with your materials",
    description:
      "Ask anything. Lumi answers from your own uploaded notes, slides, and readings - grounded in what you actually study.",
  },
  {
    Emblem: EmblemQuiz,
    plate: "PLATE 02",
    title: "Quizzes & flashcards",
    description:
      "Generate practice expeditions from any class in seconds - your difficulty, your question styles, your sky.",
  },
  {
    Emblem: EmblemReview,
    plate: "PLATE 03",
    title: "Review that returns",
    description:
      "Spaced repetition brings each card back just before you'd forget - on schedule, like clockwork orbits.",
  },
];

const WelcomePage = ({ session }: { session?: Session | null }) => {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: 0.15,
        staggerChildren: 0.13,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { y: 18, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring", stiffness: 110, damping: 16 },
    },
  };

  // Entrance stagger lives on the parent so each card's own transition has no
  // delay - otherwise framer reuses that delayed transition for the hover-out,
  // making the card wait ~1s before dropping back down.
  const featuresContainerVariants: Variants = {
    hidden: {},
    visible: {
      transition: { delayChildren: 0.45, staggerChildren: 0.12 },
    },
  };

  const featureCardVariants: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 100, damping: 16 },
    },
  };

  const targetRoute = session ? "/dashboard" : "/login";

  return (
    <motion.div
      className="relative flex min-h-dvh w-full flex-col items-center overflow-hidden px-10 pb-14 pt-7 max-md:px-5 max-md:pt-5 max-[480px]:px-3.75"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* The night's faint instruments behind everything. */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <Constellation
          name="The Luminarium"
          size={620}
          twinkle
          className="absolute -right-36 -top-24 text-ink/15 max-md:-right-16 max-md:-top-12 max-md:h-64 max-md:w-64 max-[420px]:h-56 max-[420px]:w-56"
        />
        <Constellation
          name="studywithlumi"
          size={460}
          twinkle
          className="absolute -bottom-32 -left-28 text-ink/12 max-md:-bottom-12 max-md:-left-14 max-md:h-56 max-md:w-56 max-[420px]:h-48 max-[420px]:w-48"
        />
      </div>

      {/* Masthead */}
      <motion.header
        className="relative z-10 flex w-full max-w-300 items-center justify-between"
        variants={itemVariants}
      >
        <div className="flex items-center gap-2.5">
          <LumiStar size={30} />
          <span className="font-display text-[21px] font-semibold tracking-[-0.01em]">
            Lumi AI
          </span>
        </div>
        <Link to="/login" className="link">
          <motion.span
            className="flex items-center gap-1.5 rounded-full border border-solid border-ink/25 bg-vellum/70 px-5 py-2 text-[13px] font-semibold text-ink transition-[color,background-color,border-color] duration-200 hover:border-ink hover:bg-vellum"
            {...pressLift}
          >
            Sign in
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </motion.span>
        </Link>
      </motion.header>

      {/* Hero */}
      <motion.div
        className="relative z-10 mt-16 flex flex-col items-center max-md:mt-10"
        variants={itemVariants}
      >
        <div className="text-ink/45">
          <LumiStar
            size={104}
            orbit
            breathe
            className="max-md:h-21 max-md:w-21"
          />
        </div>
      </motion.div>

      <motion.p
        className={`relative z-10 mt-7 ${UI.overline} max-md:mt-5 max-[360px]:tracking-[0.14em]`}
        variants={itemVariants}
      >
        ✦&ensp;Your AI study observatory&ensp;✦
      </motion.p>

      <motion.h1
        className="relative z-10 mt-4 max-w-210 text-center font-display text-[clamp(40px,7vw,76px)] font-semibold leading-[1.06] tracking-[-0.02em] text-ink max-md:mt-3"
        variants={itemVariants}
      >
        Every class becomes{" "}
        <em className="text-gold-deep [font-variation-settings:'SOFT'_60,'WONK'_1]">
          a constellation
        </em>
        .
      </motion.h1>

      <motion.p
        className="relative z-10 mt-5 max-w-140 text-center text-[17px] leading-[1.7] text-muted max-md:max-w-[85%] max-md:text-[15px] max-[480px]:max-w-full"
        variants={itemVariants}
      >
        Upload your study materials and Lumi turns them into conversations,
        quizzes, flashcards, and review that sticks - a sky's worth of
        understanding, charted from your own notes.
      </motion.p>

      <motion.div
        className="relative z-10 mt-9 flex items-center gap-4 max-md:mt-7 max-[480px]:flex-col max-[480px]:gap-3"
        variants={itemVariants}
      >
        <Link to={targetRoute} className="link">
          <motion.span
            className={`${btnClass("gold")} px-9 text-[16px]`}
            {...pressLift}
          >
            Start charting
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </motion.span>
        </Link>
        <span className={UI.overlineMuted}>Free · Google sign-in</span>
      </motion.div>

      {/* Feature plates */}
      <motion.div
        className="relative z-10 mt-24 grid w-full max-w-285 grid-cols-3 gap-6 max-[1024px]:gap-5 max-[900px]:max-w-175 max-[900px]:grid-cols-2 max-md:mt-14 max-md:max-w-105 max-md:grid-cols-1 max-md:gap-4"
        initial="hidden"
        animate="visible"
        variants={featuresContainerVariants}
      >
        {FEATURES.map((feature, i) => (
          <motion.div
            className={`${UI.plate} ${UI.plateHover} flex flex-col items-start gap-3 px-7 py-8 max-[1024px]:px-6 max-[1024px]:py-7 ${
              i === 2
                ? "max-[900px]:col-span-full max-[900px]:max-w-85 max-[900px]:justify-self-center max-md:max-w-none"
                : ""
            }`}
            key={i}
            variants={featureCardVariants}
            {...plateLift}
          >
            <CornerTicks />
            <div className="flex w-full items-start justify-between">
              <feature.Emblem />
              <span className={UI.overlineMuted}>{feature.plate}</span>
            </div>
            <p className="mt-2 font-display text-[22px] font-semibold leading-snug text-ink max-md:text-[20px]">
              {feature.title}
            </p>
            <p className="text-[14.5px] leading-[1.65] text-muted">
              {feature.description}
            </p>
          </motion.div>
        ))}
      </motion.div>

      {/* Colophon */}
      <motion.footer
        className="relative z-10 mt-20 flex w-full max-w-285 flex-col items-center gap-4 max-md:mt-12"
        variants={itemVariants}
      >
        <div className={UI.rule} />
        <div className="flex items-center gap-5 text-[12px]">
          <Link
            to="/privacy"
            state={{ from: "/" }}
            className="font-mono uppercase tracking-[0.16em] text-muted no-underline transition-colors hover:text-gold-deep"
          >
            Privacy
          </Link>
          <span className="text-gold" aria-hidden="true">
            ✦
          </span>
          <Link
            to="/terms"
            state={{ from: "/" }}
            className="font-mono uppercase tracking-[0.16em] text-muted no-underline transition-colors hover:text-gold-deep"
          >
            Terms
          </Link>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted/70">
          Lumi AI · studywithlumi.com
        </p>
      </motion.footer>
    </motion.div>
  );
};

export default WelcomePage;
