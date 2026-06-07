import type { Session } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import LazyLottie from "@shared/components/LazyLottie";

// Heavy Lottie animation JSON (books ~312 KB, brain ~183 KB, notes ~22 KB) is
// loaded on demand instead of statically imported, so it isn't inlined into
// the landing-page chunk. Each becomes its own async chunk fetched when the
// feature cards mount — keeps the homepage's first paint fast.
const loadBooks = () => import("@/assets/books.json");
const loadBrain = () => import("@/assets/brain.json");
const loadNotes = () => import("@/assets/notes.json");

const FEATURES = [
  {
    load: loadBooks,
    title: "Chat With Your Materials",
    description:
      "Ask questions and get answers grounded in your own uploaded documents.",
  },
  {
    load: loadBrain,
    title: "Quizzes & Flashcards",
    description:
      "Generate practice quizzes and flashcard decks from any class instantly.",
  },
  {
    load: loadNotes,
    title: "Notes & Review",
    description:
      "Keep notes and lock them in with spaced-repetition review that sticks.",
  },
];

const WelcomePage = ({ session }: { session?: Session | null }) => {
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

  // Entrance stagger lives on the parent so each card's own transition has no
  // delay — otherwise framer reuses that delayed transition for the hover-out,
  // making the card wait ~1s before dropping back down.
  const featuresContainerVariants: Variants = {
    hidden: {},
    visible: {
      transition: { delayChildren: 0.3, staggerChildren: 0.15 },
    },
  };

  const featureCardVariants: Variants = {
    hidden: { opacity: 0, y: 50 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 100, damping: 14 },
    },
  };

  const targetRoute = session ? "/dashboard" : "/login";

  return (
    <motion.div
      className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center gap-6 overflow-hidden px-10 py-[60px] max-md:gap-[18px] max-md:px-6 max-md:py-10 max-[480px]:justify-start max-[360px]:gap-3 max-[360px]:px-3 max-[360px]:pb-5 max-[360px]:pt-[50px]"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <motion.p
        className="relative text-[clamp(60px,12vw,120px)] font-extrabold tracking-[-2px] max-[1024px]:text-[clamp(50px,10vw,90px)] max-md:text-[52px] max-md:tracking-[-1px] max-[480px]:text-[42px] max-[360px]:text-[36px]"
        variants={itemVariants}
      >
        Lumi AI
      </motion.p>
      <motion.p
        className="relative overflow-hidden rounded-full border border-solid border-black/[0.08] bg-white px-6 py-2.5 text-[14px] font-semibold uppercase tracking-[4px] text-muted max-md:px-[18px] max-md:py-2 max-md:text-[12px] max-md:tracking-[3px] max-[360px]:px-3 max-[360px]:py-[5px] max-[360px]:text-[9px] max-[360px]:tracking-[1.5px]"
        variants={itemVariants}
      >
        Your AI Study Assistant
      </motion.p>
      <motion.p
        className="mt-2 mb-4 max-w-[550px] text-center text-[18px] leading-[1.7] text-muted max-md:mt-1.5 max-md:mb-3 max-md:max-w-[85%] max-md:text-[15px] max-[480px]:max-w-full max-[480px]:leading-[1.5] max-[360px]:text-[12px]"
        variants={itemVariants}
      >
        Upload your study materials and get instant help, summaries, and study
        tools powered by AI.
      </motion.p>

      <motion.div
        variants={itemVariants}
        whileHover={{
          scale: 1.03,
          y: -6,
          transition: { type: "spring", stiffness: 300, damping: 5 },
        }}
        whileTap={{ scale: 0.98 }}
      >
        <Link to={targetRoute} className="link">
          <motion.button className="rounded-full border-2 border-solid border-ink bg-sage px-[60px] py-[15px] text-[16px] font-bold shadow-[0px_2px_0_#000] max-md:px-11 max-md:py-[14px] max-md:text-[14px] max-[360px]:px-7 max-[360px]:py-2.5 max-[360px]:text-[12px]">
            Get Started
          </motion.button>
        </Link>
      </motion.div>

      <motion.div
        className="mt-[60px] grid w-full max-w-[1200px] grid-cols-3 gap-6 px-5 max-[1024px]:gap-5 max-[1024px]:px-4 max-[900px]:max-w-[700px] max-[900px]:grid-cols-2 max-md:mt-9 max-md:max-w-[380px] max-md:grid-cols-1 max-md:gap-4 max-[480px]:mt-6 max-[480px]:px-0 max-[360px]:mt-5 max-[360px]:gap-2.5"
        initial="hidden"
        animate="visible"
        variants={featuresContainerVariants}
      >
        {FEATURES.map((feature, i) => (
          <motion.div
            className={`relative flex cursor-pointer flex-col items-center justify-start gap-4 overflow-hidden rounded-3xl border-[1.5px] border-solid border-black/[0.08] bg-white px-[30px] py-10 text-center max-[1024px]:px-6 max-[1024px]:py-8 max-md:gap-3 max-md:px-5 max-md:py-6 max-[360px]:gap-2 max-[360px]:rounded-2xl max-[360px]:px-3 max-[360px]:py-4 ${
              i === 2
                ? "max-[900px]:col-span-full max-[900px]:max-w-[340px] max-[900px]:justify-self-center max-md:max-w-none"
                : ""
            }`}
            key={i}
            variants={featureCardVariants}
            whileHover={{
              y: -10,
              transition: { duration: 0.2, ease: "easeOut" },
            }}
          >
            <div className="rounded-[20px] p-2.5 max-md:p-1.5 max-[480px]:rounded-[14px] [&>div]:h-[120px]! max-md:[&>div]:h-[100px]! max-[480px]:[&>div]:h-[120px]! max-[360px]:[&>div]:h-[80px]!">
              <LazyLottie
                style={{ height: 120 }}
                getAnimationData={feature.load}
                loop={true}
                autoplay={true}
              />
            </div>
            <p className="mt-2 text-[22px] font-semibold max-md:mt-1 max-md:text-[18px] max-[360px]:text-[14px]">
              {feature.title}
            </p>
            <p className="text-[15px] leading-[1.6] text-muted max-md:text-[13px] max-[360px]:text-[11px]">
              {feature.description}
            </p>
          </motion.div>
        ))}
      </motion.div>

      <motion.footer
        className="mt-2 text-[0.9rem] text-muted"
        variants={itemVariants}
      >
        <Link to="/privacy" className="text-muted no-underline hover:text-ink">
          Privacy Policy
        </Link>
        <span aria-hidden="true"> · </span>
        <Link to="/terms" className="text-muted no-underline hover:text-ink">
          Terms of Service
        </Link>
      </motion.footer>
    </motion.div>
  );
};

export default WelcomePage;
