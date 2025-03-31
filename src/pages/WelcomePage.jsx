import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import Lottie from "lottie-react";
import books from "../assets/books.json";
import brain from "../assets/brain.json";
import notes from "../assets/notes.json";
import "./WelcomePage.css";

const WelcomePage = ({ session }) => {
  const bgVariants = {
    hidden: (custom) => ({
      scale: 0.5,
      opacity: 0,
      x: custom.x ?? 0,
      y: custom.y ?? 0,
      rotate: custom.rotate ?? 0,
    }),
    visible: (custom) => ({
      scale: 1,
      opacity: custom.opacity ?? 0.3,
      x: 0,
      y: 0,
      rotate: custom.rotate ?? 0,
      transition: {
        type: "spring",
        stiffness: 150,
        damping: 12,
      },
    }),
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
              animation: books,
              title: "Study Smarter",
              description:
                "Upload your documents and chat with an AI that understands your course materials.",
            },
            {
              animation: brain,
              title: "Generate Study Aids",
              description:
                "Create flashcards, practice quizzes, and summaries with one click.",
            },
            {
              animation: notes,
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
              whileHover={{
                y: -10,
                scale: 1.02,
                transition: { type: "spring", stiffness: 400, damping: 10 },
              }}
              whileTap={{ scale: 0.99 }}
            >
              <div className="feature-icon">
                <Lottie
                  style={{ height: 120 }}
                  animationData={feature.animation}
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
      </motion.div>
    </>
  );
};

export default WelcomePage;
