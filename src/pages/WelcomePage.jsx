import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import LazyLottie from "../components/LazyLottie";
import "./WelcomePage.css";

// Heavy Lottie animation JSON (books ~312 KB, brain ~183 KB, notes ~22 KB) is
// loaded on demand instead of statically imported, so it isn't inlined into
// the landing-page chunk. Each becomes its own async chunk fetched when the
// feature cards mount — keeps the homepage's first paint fast.
const loadBooks = () => import("../assets/books.json");
const loadBrain = () => import("../assets/brain.json");
const loadNotes = () => import("../assets/notes.json");

const WelcomePage = ({ session }) => {
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

  const featureCardVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: (i) => ({
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 12,
        delay: 0.8 + i * 0.2,
      },
    }),
  };

  const targetRoute = session ? "/dashboard" : "/login";

  return (
    <>
      <motion.div
        className="welcome-container"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        <motion.p className="welcome-logo-name" variants={itemVariants}>
          Lumi AI
        </motion.p>
        <motion.p className="welcome-sub-logo" variants={itemVariants}>
          Your AI Study Assistant
        </motion.p>
        <motion.p variants={itemVariants} className="welcome-description">
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
            <motion.button className="welcome-login-btn">
              Get Started
            </motion.button>
          </Link>
        </motion.div>

        <div className="welcome-features">
          {[
            {
              load: loadBooks,
              title: "Study Smarter",
              description:
                "Upload your documents and chat with an AI that understands your course materials.",
            },
            {
              load: loadBrain,
              title: "Generate Study Aids",
              description:
                "Create flashcards, practice quizzes, and summaries with one click.",
            },
            {
              load: loadNotes,
              title: "Take Smart Notes",
              description:
                "Save important insights and organize your knowledge by class.",
            },
          ].map((feature, i) => (
            <motion.div
              className="feature-card"
              key={i}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={featureCardVariants}
            >
              <div className="feature-icon">
                <LazyLottie
                  style={{ height: 120 }}
                  getAnimationData={feature.load}
                  loop={true}
                  autoplay={true}
                />
              </div>
              <motion.p
                className="feature-name"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 1.0 + i * 0.2 } }}
              >
                {feature.title}
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 1.2 + i * 0.2 } }}
              >
                {feature.description}
              </motion.p>
            </motion.div>
          ))}
        </div>

        <motion.footer className="welcome-footer" variants={itemVariants}>
          <Link to="/privacy">Privacy Policy</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/terms">Terms of Service</Link>
        </motion.footer>
      </motion.div>
    </>
  );
};

export default WelcomePage;
